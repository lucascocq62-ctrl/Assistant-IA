import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { decode } from 'base64-arraybuffer';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RootStackParamList } from '../../App';
import { ProviderSelector } from '../components/ProviderSelector';
import { defaultTemplates } from '../lib/templates';
import { supabase } from '../lib/supabase';
import { ConsultationTemplate, TranscriptionProvider } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Record'>;

export function RecordScreen({ navigation }: Props) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [provider, setProvider] = useState<TranscriptionProvider>('groq');
  const [patientName, setPatientName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [species, setSpecies] = useState('');
  const [template, setTemplate] = useState<ConsultationTemplate>(defaultTemplates[0]);
  const [templates, setTemplates] = useState<ConsultationTemplate[]>(defaultTemplates);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => Boolean(audioUri && patientName.trim() && !isSubmitting), [audioUri, patientName, isSubmitting]);

  useEffect(() => {
    const loadTemplates = async () => {
      const { data } = await supabase.from('consultation_templates').select('id, name, description, sections').order('created_at', { ascending: false });
      if (data?.length) {
        const remoteTemplates = data as ConsultationTemplate[];
        setTemplates([...remoteTemplates, ...defaultTemplates]);
        setTemplate(remoteTemplates[0]);
      }
    };
    void loadTemplates();
  }, []);

  const startRecording = async () => {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Micro refusé', 'Autorise le microphone pour enregistrer la consultation.');
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording: nextRecording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    setRecording(nextRecording);
    setAudioUri(null);
  };

  const stopRecording = async () => {
    if (!recording) return;
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    setAudioUri(uri);
  };

  const submitConsultation = async () => {
    if (!audioUri) return;
    setIsSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Connecte-toi à Supabase avant de créer une consultation.');

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

      await FileSystem.deleteAsync(audioUri, { idempotent: true });
      setAudioUri(null);
      navigation.replace('Report', { consultationId: consultation.id });
    } catch (error) {
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Impossible de traiter la consultation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Animal</Text>
      <TextInput style={styles.input} placeholder="Nom de l’animal *" value={patientName} onChangeText={setPatientName} />
      <TextInput style={styles.input} placeholder="Propriétaire" value={ownerName} onChangeText={setOwnerName} />
      <TextInput style={styles.input} placeholder="Espèce / race" value={species} onChangeText={setSpecies} />

      <Text style={styles.label}>Transcription</Text>
      <ProviderSelector value={provider} onChange={setProvider} />

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
        <Pressable style={styles.dangerButton} onPress={stopRecording}>
          <Text style={styles.buttonText}>Arrêter l’enregistrement</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.primaryButton} onPress={startRecording}>
          <Text style={styles.buttonText}>{audioUri ? 'Réenregistrer' : 'Lancer l’enregistrement'}</Text>
        </Pressable>
      )}
      {audioUri && <Text style={styles.ready}>Audio prêt. Il sera supprimé après transcription.</Text>}

      <Pressable style={[styles.submitButton, !canSubmit && styles.disabled]} disabled={!canSubmit} onPress={submitConsultation}>
        <Text style={styles.buttonText}>{isSubmitting ? 'Traitement en cours…' : 'Transcrire et générer le compte rendu'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, gap: 12 },
  label: { marginTop: 12, fontWeight: '800', color: '#0f172a', fontSize: 16 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 14, fontSize: 16 },
  selectedCard: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#cbd5e1' },
  cardTitle: { fontWeight: '800', color: '#0f172a' },
  cardText: { color: '#64748b', marginTop: 4 },
  primaryButton: { backgroundColor: '#2563eb', padding: 16, borderRadius: 14, alignItems: 'center' },
  dangerButton: { backgroundColor: '#dc2626', padding: 16, borderRadius: 14, alignItems: 'center' },
  submitButton: { marginTop: 18, backgroundColor: '#16a34a', padding: 16, borderRadius: 14, alignItems: 'center' },
  disabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  ready: { color: '#166534', fontWeight: '600' },
});
