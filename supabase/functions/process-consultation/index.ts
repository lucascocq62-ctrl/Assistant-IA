import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type TranscriptionProvider = 'groq' | 'openai';
type TemplateSection = { id: string; title: string; instruction: string };
type ConsultationTemplate = { id?: string; name: string; description?: string | null; sections: TemplateSection[] };

type RequestBody = {
  consultationId: string;
  audioPath: string;
  transcriptionProvider: TranscriptionProvider;
  patient: { name: string; ownerName?: string; species?: string };
  template: ConsultationTemplate;
};

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = env('SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } });

  let audioPath: string | undefined;
  let consultationId: string | undefined;
  let generationRequestId: string | undefined;

  try {
    const body = (await req.json()) as RequestBody;
    audioPath = body.audioPath;
    consultationId = body.consultationId;

    if (!body.consultationId) throw new Error('Identifiant de consultation obligatoire.');
    if (!body.patient?.name) throw new Error('Le nom de l’animal est obligatoire.');
    if (!body.template?.sections?.length) throw new Error('Un modèle de consultation est obligatoire.');

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error('Utilisateur non authentifié.');

    const { data: existingConsultation, error: consultationError } = await supabase
      .from('consultations')
      .select('id, user_id')
      .eq('id', body.consultationId)
      .single();
    if (consultationError || !existingConsultation) throw consultationError ?? new Error('Consultation introuvable.');
    if (existingConsultation.user_id !== userData.user.id) throw new Error('Consultation non autorisée pour cet utilisateur.');

    const reportModel = Deno.env.get('OPENAI_REPORT_MODEL') ?? 'gpt-5.4-nano';
    const { data: generationRequest, error: requestError } = await supabase
      .from('generation_requests')
      .insert({
        user_id: userData.user.id,
        consultation_id: body.consultationId,
        transcription_provider: body.transcriptionProvider,
        report_model: reportModel,
        status: 'processing',
      })
      .select('id')
      .single();
    if (requestError) throw requestError;
    generationRequestId = generationRequest.id;

    await supabase
      .from('consultations')
      .update({ status: 'processing', processing_started_at: new Date().toISOString(), error_message: null })
      .eq('id', body.consultationId);

    const { data: audioData, error: downloadError } = await supabase.storage.from('audio-temp').download(body.audioPath);
    if (downloadError || !audioData) throw downloadError ?? new Error('Audio introuvable.');

    const transcription = await transcribeAudio(audioData, body.transcriptionProvider);
    const report = await draftReport({ transcription, template: body.template, patient: body.patient, reportModel });

    const completedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('consultations')
      .update({
        patient_name: body.patient.name,
        owner_name: body.patient.ownerName || null,
        species: body.patient.species || null,
        template_id: body.template.id?.length === 36 ? body.template.id : null,
        transcription_provider: body.transcriptionProvider,
        transcription,
        report_markdown: report.markdown,
        report_json: report.json,
        status: 'completed',
        processing_completed_at: completedAt,
        error_message: null,
      })
      .eq('id', body.consultationId);
    if (updateError) throw updateError;

    await supabase
      .from('generation_requests')
      .update({ status: 'completed', completed_at: completedAt })
      .eq('id', generationRequestId);

    return new Response(JSON.stringify({ consultationId: body.consultationId, generationRequestId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    if (consultationId) {
      await supabase.from('consultations').update({ status: 'failed', error_message: message }).eq('id', consultationId);
    }
    if (generationRequestId) {
      await supabase.from('generation_requests').update({ status: 'failed', error_message: message }).eq('id', generationRequestId);
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    if (audioPath) {
      await supabase.storage.from('audio-temp').remove([audioPath]);
      if (consultationId) {
        await supabase.from('consultations').update({ audio_deleted_at: new Date().toISOString(), audio_path: null }).eq('id', consultationId);
      }
    }
  }
});

async function transcribeAudio(audio: Blob, provider: TranscriptionProvider) {
  const form = new FormData();
  form.append('file', audio, 'consultation.m4a');
  form.append('model', provider === 'groq' ? 'whisper-large-v3-turbo' : 'gpt-4o-mini-transcribe');
  form.append('language', 'fr');
  form.append('response_format', 'json');

  const apiKey = provider === 'groq' ? env('GROQ_API_KEY') : env('OPENAI_API_KEY');
  const url = provider === 'groq' ? 'https://api.groq.com/openai/v1/audio/transcriptions' : 'https://api.openai.com/v1/audio/transcriptions';
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form });
  if (!response.ok) throw new Error(`Transcription ${provider} échouée: ${await response.text()}`);
  const json = await response.json();
  return json.text as string;
}

async function draftReport(args: { transcription: string; template: ConsultationTemplate; patient: RequestBody['patient']; reportModel: string }) {
  const sections = args.template.sections.map((section, index) => `${index + 1}. ${section.title}: ${section.instruction}`).join('\n');
  const templateInstructions = args.template.description?.trim()
    ? `Consignes globales du modèle « ${args.template.name} »:\n${args.template.description.trim()}\n\nRubriques à remplir:\n${sections}`
    : `Rubriques à remplir pour le modèle « ${args.template.name} »:\n${sections}`;
  const prompt = `Tu es assistant de rédaction pour un vétérinaire français. Rédige un compte rendu clair, factuel et relisible par le praticien. N'invente aucune donnée. Si une information manque, écris "Non précisé".\n\nAnimal: ${args.patient.name}\nPropriétaire: ${args.patient.ownerName || 'Non précisé'}\nEspèce/race: ${args.patient.species || 'Non précisé'}\n\nModèle à remplir:\n${templateInstructions}\n\nTranscription:\n${args.transcription}\n\nRéponds obligatoirement avec un JSON valide de forme {"markdown":"...", "sections": [{"title":"...", "content":"..."}], "warnings": []}.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: args.reportModel,
      messages: [
        { role: 'system', content: 'Tu produis des comptes rendus vétérinaires structurés en français, sans diagnostic inventé.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) throw new Error(`Rédaction OpenAI échouée: ${await response.text()}`);
  const completion = await response.json();
  const content = completion.choices?.[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(content);
  const markdown = typeof parsed.markdown === 'string' ? parsed.markdown : JSON.stringify(parsed, null, 2);
  return { markdown, json: parsed };
}
