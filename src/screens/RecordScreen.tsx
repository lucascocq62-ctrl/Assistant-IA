import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { decode } from 'base64-arraybuffer';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RootStackParamList } from '../../App';
import { ProviderSelector } from '../components/ProviderSelector';
import { getGuestMode } from '../lib/guestMode';
import { getLocalTemplates } from '../lib/localTemplates';
import { defaultTemplates } from '../lib/templates';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { ConsultationReport, ConsultationTemplate, TranscriptionProvider } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Record'>;

const TRANSCRIPTION_FILE_LIMIT_BYTES = 25 * 1024 * 1024;
const SUPABASE_AUDIO_BUCKET_LIMIT_BYTES = 100 * 1024 * 1024;

const formatDuration = (millis: number) => {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) return 'taille inconnue';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};


const createGuestReport = (args: {
  patientName: string;
  ownerName: string;
  species: string;
  template: ConsultationTemplate;
  provider: TranscriptionProvider;
}): ConsultationReport => {
  const sections = args.template.sections.map((section) => `## ${section.title}\nNon précisé\n\n_Consigne utilisée : ${section.instruction}_`).join('\n\n');

  return {
    id: `guest-report-${Date.now()}`,
    patient_name: args.patientName,
    owner_name: args.ownerName || null,
    species: args.species || null,
    template_id: null,
    transcription_provider: args.provider,
    requested_by_email: 'Mode invité',
    transcription: 'Mode invité : l’audio reste local et n’est pas envoyé à Supabase. Connecte-toi pour lancer la transcription IA.',
    report_markdown: `# ${args.patientName}\n\n> Brouillon généré en mode invité à partir du modèle « ${args.template.name} ». Connecte-toi pour obtenir un compte rendu rempli automatiquement par l’IA.\n\n${sections}`,
    report_json: { guest: true, template: args.template.name },
    status: 'completed',
    created_at: new Date().toISOString(),
  };
};

export function RecordScreen({ navigation, route }: Props) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioDurationMillis, setAudioDurationMillis] = useState(0);
  const [audioSizeBytes, setAudioSizeBytes] = useState<number | undefined>();
  const [provider, setProvider] = useState<TranscriptionProvider>('groq');
  const [patientName, setPatientName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [species, setSpecies] = useState('');
  const [template, setTemplate] = useState<ConsultationTemplate>(defaultTemplates[0]);
  const [templates, setTemplates] = useState<ConsultationTemplate[]>(defaultTemplates);
  const [isGuestMode, setIsGuestMode] = useState(Boolean(route.params?.isGuest));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const exceedsTranscriptionLimit = Boolean(audioSizeBytes && audioSizeBytes > TRANSCRIPTION_FILE_LIMIT_BYTES);
  const canSubmit = useMemo(
    () => Boolean(audioUri && patientName.trim() && !isSubmitting && !exceedsTranscriptionLimit),
    [audioUri, patientName, isSubmitting, exceedsTranscriptionLimit],
  );

  useEffect(() => {
    const loadTemplates = async () => {
      const guestEnabled = Boolean(route.params?.isGuest || (await getGuestMode()) || !isSupabaseConfigured);
      setIsGuestMode(guestEnabled);

      if (guestEnabled) {
        const localTemplates = await getLocalTemplates();
        const nextTemplates = [...localTemplates, ...defaultTemplates];
        setTemplates(nextTemplates);
        setTemplate(nextTemplates[0]);
        return;
      }

      const { data } = await supabase.from('consultation_templates').select('id, name, description, sections').order('created_at', { ascending: false });
      if (data?.length) {
        const remoteTemplates = data as ConsultationTemplate[];
        setTemplates([...remoteTemplates, ...defaultTemplates]);
        setTemplate(remoteTemplates[0]);
      }
    };
    void loadTemplates();
  }, [route.params?.isGuest]);

  useEffect(() => {
    return () => {
      if (recording) {
        void recording.stopAndUnloadAsync().catch(() => undefined);
      }
    };
  }, [recording]);

  const resetAudio = async () => {
    if (audioUri) {
      await FileSystem.deleteAsync(audioUri, { idempotent: true });
    }
    setAudioUri(null);
    setAudioDurationMillis(0);
    setAudioSizeBytes(undefined);
  };

  const readAudioInfo = async (uri: string) => {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    setAudioSizeBytes(info.exists ? info.size : undefined);
  };

  const startRecording = async () => {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Micro refusé', 'Autorise le microphone pour enregistrer la consultation.');
      return;
    }
    if (audioUri) await resetAudio();
    setAudioDurationMillis(0);
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording: nextRecording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
      (status) => {
        if (status.canRecord || status.isRecording) setAudioDurationMillis(status.durationMillis ?? 0);
      },
      500,
    );
    setRecording(nextRecording);
  };

  const stopRecording = async () => {
    if (!recording) return;
    const status = await recording.getStatusAsync();
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    setAudioUri(uri);
    setAudioDurationMillis(status.durationMillis ?? audioDurationMillis);
    if (uri) await readAudioInfo(uri);
  };

  const submitGuestConsultation = async () => {
    if (!audioUri) return;
    const localReport = createGuestReport({
      patientName: patientName.trim(),
      ownerName: ownerName.trim(),
      species: species.trim(),
      template,
      provider,
    });
    await resetAudio();
    navigation.replace('Report', { localReport });
  };

  const submitConsultation = async () => {
    if (!audioUri) return;
    setIsSubmitting(true);
    try {
      if (isGuestMode || !isSupabaseConfigured) {
        await submitGuestConsultation();
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Connecte-toi à Supabase avant de créer une consultation ou active le mode invité.');
      const info = await FileSystem.getInfoAsync(audioUri, { size: true });
      const currentAudioSize = info.exists ? info.size : audioSizeBytes;
      if (currentAudioSize && currentAudioSize > TRANSCRIPTION_FILE_LIMIT_BYTES) {
        throw new Error(`Audio trop volumineux (${formatFileSize(currentAudioSize)}). Groq et OpenAI acceptent environ 25 Mo par fichier via l’API actuelle : compresse ou découpe l’audio avant l’envoi.`);
      }

      const { data: consultation, error: insertError } = await supabase
        .from('consultations')
        .insert({
          user_id: userData.user.id,
          patient_name: patientName.trim(),
          owner_name: ownerName.trim() || null,
          species: species.trim() || null,
          template_id: template.id.length === 36 ? template.id : null,
          transcription_provider: provider,
          status: 'processing',
          requested_by_email: userData.user.email,
        })
        .select('id')
        .single();
      if (insertError) throw insertError;

      const extension = audioUri.split('.').pop() ?? 'm4a';
      const path = `${userData.user.id}/${consultation.id}.${extension}`;
      const file = await FileSystem.readAsStringAsync(audioUri, { encoding: FileSystem.EncodingType.Base64 });
      const arrayBuffer = decode(file);

      const { error: uploadError } = await supabase.storage.from('audio-temp').upload(path, arrayBuffer, {
        contentType: 'audio/mp4',
        upsert: false,
      });
      if (uploadError) {
        await supabase.from('consultations').update({ status: 'failed', error_message: uploadError.message }).eq('id', consultation.id);
        throw uploadError;
      }

      await supabase
        .from('consultations')
        .update({ audio_path: path, audio_uploaded_at: new Date().toISOString() })
        .eq('id', consultation.id);

      const { error } = await supabase.functions.invoke('process-consultation', {
        body: {
          consultationId: consultation.id,
          audioPath: path,
          transcriptionProvider: provider,
          patient: { name: patientName.trim(), ownerName: ownerName.trim(), species: species.trim() },
          template,
        },
      });
      if (error) throw error;

      await resetAudio();
      navigation.replace('Report', { consultationId: consultation.id });
    } catch (error) {
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Impossible de traiter la consultation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isGuestMode ? <Text style={styles.guestBanner}>Mode invité : l’audio reste sur l’appareil. Connecte-toi pour envoyer l’audio et obtenir la transcription IA.</Text> : null}
      <Text style={styles.label}>Animal</Text>
      <TextInput style={styles.input} placeholder="Nom de l’animal *" value={patientName} onChangeText={setPatientName} />
      <TextInput style={styles.input} placeholder="Propriétaire" value={ownerName} onChangeText={setOwnerName} />
      <TextInput style={styles.input} placeholder="Espèce / race" value={species} onChangeText={setSpecies} />

      <Text style={styles.label}>Transcription</Text>
      <ProviderSelector value={provider} onChange={setProvider} />
      {isGuestMode ? <Text style={styles.helper}>Le choix sera utilisé quand tu te connecteras. En mode invité, aucun appel IA n’est lancé.</Text> : null}

      <Text style={styles.label}>Modèle</Text>
      {templates.map((candidate) => (
        <Pressable
          key={candidate.id}
          style={[styles.card, template.id === candidate.id && styles.selectedCard]}
          onPress={() => setTemplate(candidate)}
        >
          <Text style={styles.cardTitle}>{candidate.name}</Text>
          {candidate.description ? <Text style={styles.cardText}>{candidate.description}</Text> : null}
          <Text style={styles.cardText}>{candidate.sections.length} rubriques seront remplies par OpenAI.</Text>
        </Pressable>
      ))}

      <Text style={styles.label}>Audio</Text>
      {recording ? (
        <View style={styles.recordingPanel}>
          <Text style={styles.recordingBadge}>● Enregistrement en cours</Text>
          <Text style={styles.timer}>{formatDuration(audioDurationMillis)}</Text>
          <Pressable style={styles.dangerButton} onPress={stopRecording}>
            <Text style={styles.buttonText}>Arrêter l’enregistrement</Text>
          </Pressable>
        </View>
      ) : audioUri ? (
        <View style={styles.audioPanel}>
          <Text style={styles.ready}>Audio prêt avant envoi</Text>
          <Text style={styles.audioMeta}>Durée : {formatDuration(audioDurationMillis)} · Taille : {formatFileSize(audioSizeBytes)}</Text>
          <Text style={exceedsTranscriptionLimit ? styles.limitError : styles.helper}>
            Limites actuelles : stockage Supabase configuré à {formatFileSize(SUPABASE_AUDIO_BUCKET_LIMIT_BYTES)}, mais Groq/OpenAI acceptent environ {formatFileSize(TRANSCRIPTION_FILE_LIMIT_BYTES)} par transcription. Pour un fichier plus gros, il faudra compresser ou découper avant transcription.
          </Text>
          <View style={styles.audioActions}>
            <Pressable style={[styles.secondaryButton, styles.actionButton]} onPress={startRecording}>
              <Text style={styles.secondaryButtonText}>Reprendre</Text>
            </Pressable>
            <Pressable style={[styles.deleteButton, styles.actionButton]} onPress={resetAudio}>
              <Text style={styles.buttonText}>Effacer</Text>
            </Pressable>
          </View>
          <Text style={styles.helper}>{isGuestMode ? 'En mode invité, l’audio reste local et sera supprimé après création du brouillon.' : 'À l’envoi, l’audio est transféré vers Supabase Storage puis transmis à Groq/OpenAI par la fonction sécurisée.'}</Text>
        </View>
      ) : (
        <Pressable style={styles.primaryButton} onPress={startRecording}>
          <Text style={styles.buttonText}>Lancer l’enregistrement</Text>
        </Pressable>
      )}

      <Pressable style={[styles.submitButton, !canSubmit && styles.disabled]} disabled={!canSubmit} onPress={submitConsultation}>
        <Text style={styles.buttonText}>{isSubmitting ? 'Traitement en cours…' : isGuestMode ? 'Créer un brouillon local' : 'Transcrire et générer le compte rendu'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, gap: 12 },
  guestBanner: { backgroundColor: '#ecfeff', borderColor: '#67e8f9', borderWidth: 1, borderRadius: 12, padding: 12, color: '#155e75', fontWeight: '800', lineHeight: 20 },
  label: { marginTop: 12, fontWeight: '800', color: '#0f172a', fontSize: 16 },
  helper: { color: '#64748b', lineHeight: 20 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 14, fontSize: 16 },
  selectedCard: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#cbd5e1' },
  cardTitle: { fontWeight: '800', color: '#0f172a' },
  cardText: { color: '#64748b', marginTop: 4 },
  primaryButton: { backgroundColor: '#2563eb', padding: 16, borderRadius: 14, alignItems: 'center' },
  secondaryButton: { backgroundColor: '#fff', padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2563eb' },
  secondaryButtonText: { color: '#1d4ed8', fontWeight: '800', textAlign: 'center' },
  dangerButton: { backgroundColor: '#dc2626', padding: 16, borderRadius: 14, alignItems: 'center' },
  deleteButton: { backgroundColor: '#dc2626', padding: 14, borderRadius: 12, alignItems: 'center' },
  recordingPanel: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 16, padding: 16, gap: 12, alignItems: 'center' },
  recordingBadge: { color: '#b91c1c', fontWeight: '900' },
  timer: { color: '#0f172a', fontSize: 42, fontWeight: '900', letterSpacing: 1 },
  audioPanel: { backgroundColor: '#fff', borderColor: '#bbf7d0', borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  audioMeta: { color: '#0f172a', fontWeight: '700' },
  audioActions: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1 },
  limitError: { color: '#b91c1c', fontWeight: '800', lineHeight: 20 },
  submitButton: { marginTop: 18, backgroundColor: '#16a34a', padding: 16, borderRadius: 14, alignItems: 'center' },
  disabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  ready: { color: '#166534', fontWeight: '600' },
});
