import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RootStackParamList } from '../../App';
import { completeOAuthSignIn, signInWithGoogle, signOut } from '../lib/auth';
import { supabase } from '../lib/supabase';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [authStatus, setAuthStatus] = useState('Connexion Supabase…');
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    const bootstrapAuth = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setAuthStatus(data.session ? 'Connecté avec Google' : 'Connecte-toi avec Google pour générer un compte rendu.');
    };

    void bootstrapAuth();
    const handleUrl = async ({ url }: { url: string }) => {
      try {
        await completeOAuthSignIn(url);
      } catch (error) {
        Alert.alert('Connexion Google impossible', error instanceof Error ? error.message : 'Impossible de finaliser la session Google.');
      }
    };

    void Linking.getInitialURL().then((url) => {
      if (url) void handleUrl({ url });
    });

    const linkingSubscription = Linking.addEventListener('url', handleUrl);
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthStatus(nextSession ? 'Connecté avec Google' : 'Connecte-toi avec Google pour générer un compte rendu.');
    });

    return () => {
      linkingSubscription.remove();
      data.subscription.unsubscribe();
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      Alert.alert('Connexion Google impossible', error instanceof Error ? error.message : 'Vérifie la configuration OAuth Supabase.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const canUseApp = Boolean(session);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Compte rendu vétérinaire autonome</Text>
      <Text style={styles.subtitle}>
        Enregistre la consultation, choisis Groq ou ChatGPT/OpenAI pour la transcription, puis OpenAI rédige le compte rendu à partir de tes modèles.
      </Text>

      {canUseApp ? (
        <>
          <View style={styles.userCard}>
            <Text style={styles.userLabel}>Compte connecté</Text>
            <Text style={styles.userEmail}>{session?.user.email}</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('Record')}>
            <Text style={styles.primaryText}>Démarrer un enregistrement</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Templates')}>
            <Text style={styles.secondaryText}>Gérer les modèles</Text>
          </Pressable>
          <Pressable style={styles.logoutButton} onPress={handleSignOut}>
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={styles.googleButton} onPress={handleGoogleSignIn} disabled={isSigningIn}>
          <Text style={styles.googleText}>{isSigningIn ? 'Ouverture de Google…' : 'Se connecter avec Google'}</Text>
        </Pressable>
      )}

      <Text style={styles.auth}>{authStatus}</Text>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>Confidentialité : une ligne de consultation est créée en base dès la demande. L’audio reste temporaire dans un bucket privé puis est supprimé automatiquement.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 16, backgroundColor: '#f8fafc' },
  title: { fontSize: 30, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 16, lineHeight: 24, color: '#475569' },
  userCard: { backgroundColor: '#fff', borderColor: '#cbd5e1', borderWidth: 1, padding: 14, borderRadius: 14 },
  userLabel: { color: '#64748b', fontWeight: '700', marginBottom: 4 },
  userEmail: { color: '#0f172a', fontWeight: '800' },
  primaryButton: { backgroundColor: '#2563eb', padding: 16, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryButton: { backgroundColor: '#e2e8f0', padding: 16, borderRadius: 14, alignItems: 'center' },
  secondaryText: { color: '#0f172a', fontWeight: '700', fontSize: 16 },
  googleButton: { backgroundColor: '#111827', padding: 16, borderRadius: 14, alignItems: 'center' },
  googleText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  logoutButton: { padding: 12, alignItems: 'center' },
  logoutText: { color: '#dc2626', fontWeight: '800' },
  auth: { color: '#64748b', fontWeight: '600' },
  notice: { borderLeftWidth: 4, borderLeftColor: '#16a34a', padding: 12, backgroundColor: '#ecfdf5', borderRadius: 8 },
  noticeText: { color: '#166534', lineHeight: 20 },
});
