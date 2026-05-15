import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { RootStackParamList } from '../../App';
import { completeOAuthSignIn, getGoogleRedirectUrl, signInWithGoogle, signInWithoutGoogle, signOut } from '../lib/auth';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { VetProfile } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [authStatus, setAuthStatus] = useState('Connexion Supabase…');
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [isNoGoogleSigningIn, setIsNoGoogleSigningIn] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [vetProfile, setVetProfile] = useState<VetProfile | null>(null);
  const [noGoogleError, setNoGoogleError] = useState<string | null>(null);

  useEffect(() => {
    const bootstrapAuth = async () => {
      if (!isSupabaseConfigured) {
        setAuthStatus('Configuration Supabase manquante : ajoute les variables Vercel puis redéploie.');
        return;
      }

      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session?.user.email) {
        setAuthStatus('Connecté avec Google');
      } else if (data.session) {
        setAuthStatus('Connecté sans Google');
      } else {
        setAuthStatus('Connecte-toi avec Google ou avec ton numéro d’ordre.');
      }
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
      if (nextSession?.user.email) {
        setAuthStatus('Connecté avec Google');
      } else if (nextSession) {
        setAuthStatus('Connecté sans Google');
      } else {
        setAuthStatus('Connecte-toi avec Google ou avec ton numéro d’ordre.');
        setVetProfile(null);
      }
    });

    return () => {
      linkingSubscription.remove();
      data.subscription.unsubscribe();
    };
  }, []);

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Configuration Supabase manquante',
        'Ajoute EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans Vercel, puis redéploie avant de te connecter avec Google.',
      );
      return;
    }

    setIsGoogleSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      Alert.alert('Connexion Google impossible', error instanceof Error ? error.message : 'Vérifie la configuration OAuth Supabase et l’URL de redirection.');
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  const handleNoGoogleSignIn = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Configuration Supabase manquante',
        'Ajoute EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans Vercel, puis redéploie avant de te connecter sans Google.',
      );
      return;
    }

    setIsNoGoogleSigningIn(true);
    try {
      setNoGoogleError(null);
      const { profile, session: nextSession } = await signInWithoutGoogle(firstName, orderNumber);
      setSession(nextSession);
      setVetProfile(profile);
      setAuthStatus(`Connecté sans Google : ${profile.first_name} · n° ${profile.order_number}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Vérifie le prénom et le numéro d’ordre.';
      setNoGoogleError(message);
      Alert.alert('Connexion sans Google impossible', message);
    } finally {
      setIsNoGoogleSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setVetProfile(null);
    await signOut();
  };

  const connectedLabel = session?.user.email ?? (vetProfile ? `${vetProfile.first_name} · n° ${vetProfile.order_number}` : 'Connexion sans Google');
  const canUseApp = Boolean(session);
  const canSubmitNoGoogle = Boolean(firstName.trim() && orderNumber.trim() && !isNoGoogleSigningIn);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
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
          <Text style={styles.userEmail}>{connectedLabel}</Text>
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
          <Pressable accessibilityRole="button" style={[styles.googleButton, isGoogleSigningIn && styles.disabledButton]} onPress={handleGoogleSignIn} disabled={isGoogleSigningIn}>
            <Text style={styles.googleText}>{isGoogleSigningIn ? 'Ouverture de Google…' : 'Continuer avec Google'}</Text>
          </Pressable>

          <View style={styles.separatorRow}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>ou</Text>
            <View style={styles.separatorLine} />
          </View>

          <View style={styles.noGoogleForm}>
            <Text style={styles.noGoogleTitle}>Connexion sans Google</Text>
            <Text style={styles.formHint}>Renseigne ton prénom et ton numéro d’ordre. Si le profil existe déjà, il sera réutilisé.</Text>
            <TextInput
              autoCapitalize="words"
              placeholder="Prénom"
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
            />
            <TextInput
              autoCapitalize="characters"
              placeholder="Numéro d’ordre"
              style={styles.input}
              value={orderNumber}
              onChangeText={setOrderNumber}
            />
            <TouchableOpacity accessibilityRole="button" activeOpacity={0.82} style={[styles.noGoogleButton, !canSubmitNoGoogle && styles.disabledButton]} onPress={handleNoGoogleSignIn} disabled={!canSubmitNoGoogle}>
              <Text style={styles.noGoogleText}>{isNoGoogleSigningIn ? 'Connexion…' : 'Connexion sans Google'}</Text>
            </TouchableOpacity>
            {noGoogleError ? <Text style={styles.errorText}>{noGoogleError}</Text> : null}
            <Text style={styles.formHint}>Vet’Help ignore les majuscules, accents, espaces et séparateurs du numéro pour éviter les doublons.</Text>
          </View>

          <Text style={styles.redirectHint}>URL de retour OAuth : {getGoogleRedirectUrl()}</Text>
        </View>
      )}

      <Text style={styles.auth}>{authStatus}</Text>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>Si Google redirige vers localhost, configure `EXPO_PUBLIC_AUTH_REDIRECT_URL` avec ton URL Vercel et ajoute cette même URL dans Supabase Auth.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#eaf2ff' },
  container: { flexGrow: 1, padding: 22, justifyContent: 'center', gap: 16 },
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
  googleButton: { backgroundColor: '#111827', padding: 16, borderRadius: 14, alignItems: 'center', cursor: 'pointer' as never },
  separatorRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  separatorText: { color: '#64748b', fontWeight: '800' },
  noGoogleButton: { backgroundColor: '#2563eb', padding: 15, borderRadius: 14, alignItems: 'center' },
  noGoogleText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  noGoogleForm: { gap: 10, backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  noGoogleTitle: { color: '#0f172a', fontWeight: '900', fontSize: 16 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 13, color: '#0f172a', fontSize: 16 },
  formHint: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  errorText: { color: '#b91c1c', fontSize: 12, fontWeight: '800', lineHeight: 17 },
  disabledButton: { opacity: 0.5 },
  googleText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  redirectHint: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  logoutButton: { padding: 8, alignItems: 'center' },
  logoutText: { color: '#dc2626', fontWeight: '800' },
  auth: { color: '#334155', fontWeight: '700', textAlign: 'center' },
  notice: { borderLeftWidth: 4, borderLeftColor: '#2563eb', padding: 12, backgroundColor: '#eff6ff', borderRadius: 8 },
  noticeText: { color: '#1e3a8a', lineHeight: 20 },
});
