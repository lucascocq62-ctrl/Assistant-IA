const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { imageBase64, mimeType = 'image/jpeg' } = await req.json();
    if (!imageBase64) throw new Error('Image manquante.');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_TEMPLATE_MODEL') ?? 'gpt-5.4-nano',
        messages: [
          {
            role: 'system',
            content: 'Tu convertis des photos de modèles de consultation vétérinaire en gabarits JSON réutilisables. Garde seulement les rubriques utiles et leurs consignes.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyse cette image et retourne uniquement un JSON valide: {"name":"...", "sections":[{"id":"slug", "title":"...", "instruction":"..."}]}. Les instructions doivent dire comment remplir chaque rubrique depuis une transcription.' },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) throw new Error(`Extraction OpenAI échouée: ${await response.text()}`);
    const completion = await response.json();
    const content = completion.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content);
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erreur inconnue' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
