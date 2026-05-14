import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const [authStatus, setAuthStatus] = useState('Connexion Supabase…');

  useEffect(() => {
    const bootstrapAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setAuthStatus('Session prête');
        return;
      }
      const { error } = await supabase.auth.signInAnonymously();
      setAuthStatus(error ? `Auth à configurer: ${error.message}` : 'Session anonyme prête');
    };
    void bootstrapAuth();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Compte rendu vétérinaire autonome</Text>
      <Text style={styles.subtitle}>
        Enregistre la consultation, choisis Groq ou ChatGPT/OpenAI pour la transcription, puis OpenAI rédige le compte rendu à partir de tes modèles.
      </Text>
      <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('Record')}>
        <Text style={styles.primaryText}>Démarrer un enregistrement</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Templates')}>
        <Text style={styles.secondaryText}>Gérer les modèles</Text>
      </Pressable>
      <Text style={styles.auth}>{authStatus}</Text>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>Confidentialité : l’audio est envoyé dans un bucket temporaire privé et supprimé automatiquement dès que la transcription est terminée.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 16, backgroundColor: '#f8fafc' },
  title: { fontSize: 30, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 16, lineHeight: 24, color: '#475569' },
  primaryButton: { backgroundColor: '#2563eb', padding: 16, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryButton: { backgroundColor: '#e2e8f0', padding: 16, borderRadius: 14, alignItems: 'center' },
  secondaryText: { color: '#0f172a', fontWeight: '700', fontSize: 16 },
  auth: { color: '#64748b', fontWeight: '600' },
  notice: { borderLeftWidth: 4, borderLeftColor: '#16a34a', padding: 12, backgroundColor: '#ecfdf5', borderRadius: 8 },
  noticeText: { color: '#166534', lineHeight: 20 },
});
