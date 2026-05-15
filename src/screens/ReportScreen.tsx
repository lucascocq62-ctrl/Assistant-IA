import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RootStackParamList } from '../../App';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { ConsultationReport } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Report'>;

export function ReportScreen({ route }: Props) {
  const [report, setReport] = useState<ConsultationReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (route.params.localReport) {
      setReport(route.params.localReport);
      setIsLoading(false);
      return;
    }

    const loadReport = async () => {
      if (!route.params.consultationId || !isSupabaseConfigured) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.from('consultations').select('*').eq('id', route.params.consultationId).single();
      if (!error) setReport(data as ConsultationReport);
      setIsLoading(false);
    };
    void loadReport();
  }, [route.params.consultationId, route.params.localReport]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Chargement du compte rendu…</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.center}>
        <Text>Compte rendu introuvable.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{report.patient_name}</Text>
      <Text style={styles.meta}>Statut : {report.status}</Text>
      <Text style={styles.meta}>Demandé par : {report.requested_by_email ?? 'Non précisé'}</Text>
      <Text style={styles.meta}>Transcription : {report.transcription_provider === 'groq' ? 'Groq' : 'ChatGPT/OpenAI'}</Text>
      {report.audio_deleted_at ? <Text style={styles.meta}>Audio supprimé le : {new Date(report.audio_deleted_at).toLocaleString()}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Compte rendu proposé</Text>
        <Text style={styles.report}>{report.report_markdown}</Text>
      </View>
      {report.transcription ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Transcription brute</Text>
          <Text style={styles.transcription}>{report.transcription}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  title: { fontSize: 28, fontWeight: '900', color: '#0f172a' },
  meta: { color: '#64748b' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#cbd5e1' },
  sectionTitle: { fontWeight: '900', color: '#0f172a', marginBottom: 10 },
  report: { color: '#0f172a', lineHeight: 22 },
  transcription: { color: '#475569', lineHeight: 21 },
});
