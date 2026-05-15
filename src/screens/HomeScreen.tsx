import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RootStackParamList } from '../../App';
import { completeOAuthSignIn, getGoogleRedirectUrl, signInWithGoogle, signOut } from '../lib/auth';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [authStatus, setAuthStatus] = useState('Connexion Supabase…');
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    const bootstrapAuth = async () => {
      if (!isSupabaseConfigured) {
        setAuthStatus('Configuration Supabase manquante : ajoute les variables Vercel puis redéploie.');
        return;
      }

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
      Alert.alert('Connexion Google impossible', error instanceof Error ? error.message : 'Vérifie la configuration OAuth Supabase et l’URL de redirection.');
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
      <View style={styles.heroCard}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>VH</Text>
        </View>
        <Text style={styles.kicker}>Assistant IA vétérinaire</Text>
        <Text style={styles.title}>Vet'Help</Text>
        <Text style={styles.subtitle}>
          Transforme tes consultations enregistrées en comptes rendus vétérinaires structurés, relisibles et prêts à valider.
        </Text>

        <View style={styles.benefitsRow}>
          <View style={styles.benefitPill}>
            <Text style={styles.benefitText}>Audio supprimé</Text>
          </View>
          <View style={styles.benefitPill}>
            <Text style={styles.benefitText}>Groq ou OpenAI</Text>
          </View>
          <View style={styles.benefitPill}>
            <Text style={styles.benefitText}>Modèles sur mesure</Text>
          </View>
        </View>
      </View>

      {canUseApp ? (
        <View style={styles.actionCard}>
          <Text style={styles.userLabel}>Compte connecté</Text>
          <Text style={styles.userEmail}>{session?.user.email}</Text>
          <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('Record')}>
            <Text style={styles.primaryText}>Démarrer une consultation</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Templates')}>
            <Text style={styles.secondaryText}>Créer ou modifier mes modèles</Text>
          </Pressable>
          <Pressable style={styles.logoutButton} onPress={handleSignOut}>
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>Connexion sécurisée</Text>
          <Text style={styles.actionText}>Connecte-toi avec Google pour associer chaque génération de compte rendu à ton compte vétérinaire.</Text>
          <Pressable style={[styles.googleButton, (!isSupabaseConfigured || isSigningIn) && styles.disabledButton]} onPress={handleGoogleSignIn} disabled={!isSupabaseConfigured || isSigningIn}>
            <Text style={styles.googleText}>{isSigningIn ? 'Ouverture de Google…' : 'Continuer avec Google'}</Text>
          </Pressable>
          <Text style={styles.redirectHint}>URL de retour OAuth : {getGoogleRedirectUrl()}</Text>
        </View>
      )}

      <Text style={styles.auth}>{authStatus}</Text>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>Si Google redirige vers localhost, configure `EXPO_PUBLIC_AUTH_REDIRECT_URL` avec ton URL Vercel et ajoute cette même URL dans Supabase Auth.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 22, justifyContent: 'center', gap: 16, backgroundColor: '#eaf2ff' },
  heroCard: { backgroundColor: '#0f172a', borderRadius: 28, padding: 24, gap: 14, shadowColor: '#0f172a', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 12 } },
  logoMark: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#38bdf8', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#082f49', fontWeight: '900', fontSize: 22 },
  kicker: { color: '#93c5fd', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 12 },
  title: { fontSize: 42, fontWeight: '900', color: '#fff' },
  subtitle: { fontSize: 16, lineHeight: 24, color: '#dbeafe' },
  benefitsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  benefitPill: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 10 },
  benefitText: { color: '#e0f2fe', fontWeight: '700', fontSize: 12 },
  actionCard: { backgroundColor: '#fff', borderColor: '#dbeafe', borderWidth: 1, padding: 18, borderRadius: 22, gap: 12 },
  actionTitle: { color: '#0f172a', fontWeight: '900', fontSize: 20 },
  actionText: { color: '#475569', lineHeight: 21 },
  userLabel: { color: '#64748b', fontWeight: '700' },
  userEmail: { color: '#0f172a', fontWeight: '900', marginBottom: 4 },
  primaryButton: { backgroundColor: '#2563eb', padding: 16, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryButton: { backgroundColor: '#e0f2fe', padding: 16, borderRadius: 14, alignItems: 'center' },
  secondaryText: { color: '#0369a1', fontWeight: '800', fontSize: 15 },
  googleButton: { backgroundColor: '#111827', padding: 16, borderRadius: 14, alignItems: 'center' },
  disabledButton: { opacity: 0.5 },
  googleText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  redirectHint: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  logoutButton: { padding: 8, alignItems: 'center' },
  logoutText: { color: '#dc2626', fontWeight: '800' },
  auth: { color: '#334155', fontWeight: '700', textAlign: 'center' },
  notice: { borderLeftWidth: 4, borderLeftColor: '#2563eb', padding: 12, backgroundColor: '#eff6ff', borderRadius: 8 },
  noticeText: { color: '#1e3a8a', lineHeight: 20 },
});
