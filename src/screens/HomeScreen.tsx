import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RootStackParamList } from '../../App';
import { getCurrentVetProfile, signInWithoutGoogle, signOut } from '../lib/auth';
import { getGuestMode, setGuestMode } from '../lib/guestMode';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { VetProfile } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [authStatus, setAuthStatus] = useState('Connexion Supabase…');
  const [isNoGoogleSigningIn, setIsNoGoogleSigningIn] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [vetProfile, setVetProfile] = useState<VetProfile | null>(null);
  const [noGoogleError, setNoGoogleError] = useState<string | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);

  useEffect(() => {
    const bootstrapAuth = async (guestEnabled: boolean) => {
      if (!isSupabaseConfigured) {
        setAuthStatus(
          guestEnabled
            ? 'Mode invité : accès sans authentification. Les données restent locales.'
            : 'Configuration Supabase manquante : ajoute les variables Supabase pour activer la connexion prénom + numéro d’ordre.',
        );
        return;
      }

      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) {
        try {
          const profile = await getCurrentVetProfile();
          setVetProfile(profile);
          setAuthStatus(profile ? `Connecté : ${profile.first_name} · n° ${profile.order_number}` : 'Aucun profil vétérinaire trouvé : reconnecte-toi avec ton prénom et ton numéro d’ordre.');
        } catch (error) {
          setAuthStatus(error instanceof Error ? error.message : 'Session active, mais le profil vétérinaire est introuvable.');
        }
      } else if (guestEnabled) {
        setAuthStatus('Mode invité : accès sans authentification. Les données restent locales.');
      } else {
        setAuthStatus('Connecte-toi avec ton prénom et ton numéro d’ordre, ou continue en mode invité.');
      }
    };

    void getGuestMode().then((enabled) => {
      setIsGuestMode(enabled);
      void bootstrapAuth(enabled);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setAuthStatus('Connecte-toi avec ton prénom et ton numéro d’ordre, ou continue en mode invité.');
        setVetProfile(null);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);


  const handleNoGoogleSignIn = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Configuration Supabase manquante',
        'Ajoute EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans Vercel, puis redéploie avant de te connecter avec prénom + numéro d’ordre.',
      );
      return;
    }

    setIsNoGoogleSigningIn(true);
    setAuthStatus('Connexion à Supabase…');
    try {
      setNoGoogleError(null);
      const { profile, session: nextSession, warning } = await signInWithoutGoogle(firstName, orderNumber);
      setSession(nextSession);
      setVetProfile(profile);
      setIsGuestMode(false);
      await setGuestMode(false);
      setAuthStatus(warning ? `Connecté : ${profile.first_name} · n° ${profile.order_number} (profil de secours)` : `Connecté : ${profile.first_name} · n° ${profile.order_number}`);
      if (warning) setNoGoogleError(warning);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Vérifie le prénom et le numéro d’ordre.';
      setNoGoogleError(message);
      setVetProfile(null);
      setSession(null);
      setAuthStatus('Connexion impossible : corrige la configuration Supabase puis réessaie.');
      Alert.alert('Connexion impossible', message);
    } finally {
      setIsNoGoogleSigningIn(false);
    }
  };

  const handleGuestAccess = async () => {
    await setGuestMode(true);
    setIsGuestMode(true);
    setVetProfile(null);
    setAuthStatus('Mode invité : accès sans authentification. Les données restent locales.');
  };

  const handleSignOut = async () => {
    setVetProfile(null);
    setIsGuestMode(false);
    await setGuestMode(false);
    if (session) await signOut();
    setSession(null);
  };

  const connectedLabel = vetProfile ? `${vetProfile.first_name} · n° ${vetProfile.order_number}` : 'Mode invité (sans compte)';
  const canUseApp = Boolean(vetProfile || isGuestMode);
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
          <Text style={styles.userLabel}>{isGuestMode && !session ? 'Accès sans authentification' : 'Compte connecté'}</Text>
          <Text style={styles.userEmail}>{connectedLabel}</Text>
          <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('Record', { isGuest: isGuestMode && !session })}>
            <Text style={styles.primaryText}>Démarrer une consultation</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Templates', { isGuest: isGuestMode && !session })}>
            <Text style={styles.secondaryText}>Créer ou modifier mes modèles</Text>
          </Pressable>
          <Pressable style={styles.logoutButton} onPress={handleSignOut}>
            <Text style={styles.logoutText}>{isGuestMode && !session ? 'Quitter le mode invité' : 'Se déconnecter'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>Connexion vétérinaire</Text>
          <Text style={styles.actionText}>Connecte-toi uniquement avec ton prénom et ton numéro d’ordre. Vet’Help crée une session Supabase anonyme, sans compte Google.</Text>

          <View style={styles.noGoogleForm}>
            <Text style={styles.noGoogleTitle}>Prénom + numéro d’ordre</Text>
            <Text style={styles.formHint}>Renseigne ton prénom et ton numéro d’ordre. Si le profil existe déjà, il sera réutilisé.</Text>
            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              editable={!isNoGoogleSigningIn}
              placeholder="Prénom"
              returnKeyType="next"
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
            />
            <TextInput
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isNoGoogleSigningIn}
              onSubmitEditing={() => {
                if (canSubmitNoGoogle) void handleNoGoogleSignIn();
              }}
              placeholder="Numéro d’ordre"
              returnKeyType="go"
              style={styles.input}
              value={orderNumber}
              onChangeText={setOrderNumber}
            />
            <Pressable accessibilityRole="button" style={[styles.noGoogleButton, !canSubmitNoGoogle && styles.disabledButton]} onPress={handleNoGoogleSignIn} disabled={!canSubmitNoGoogle}>
              <Text style={styles.noGoogleText}>{isNoGoogleSigningIn ? 'Connexion sécurisée…' : 'Se connecter'}</Text>
            </Pressable>
            {noGoogleError ? <Text style={styles.errorText}>{noGoogleError}</Text> : null}
            <Text style={styles.formHint}>Vet’Help ignore les majuscules, accents, espaces et séparateurs du numéro pour éviter les doublons.</Text>
          </View>

          <View style={styles.separatorRow}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>ou</Text>
            <View style={styles.separatorLine} />
          </View>

          <Pressable accessibilityRole="button" style={styles.guestButton} onPress={handleGuestAccess} disabled={isNoGoogleSigningIn}>
            <Text style={styles.guestText}>Accéder sans authentification</Text>
            <Text style={styles.guestHint}>Mode invité : modèles locaux et compte rendu brouillon, sans sauvegarde Supabase.</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.auth}>{authStatus}</Text>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>Pour que cette connexion fonctionne, Supabase doit avoir les connexions anonymes activées et la migration des profils vétérinaires appliquée.</Text>
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
  separatorRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  separatorText: { color: '#64748b', fontWeight: '800' },
  guestButton: { backgroundColor: '#ecfeff', borderWidth: 1, borderColor: '#67e8f9', padding: 14, borderRadius: 14, gap: 4 },
  guestText: { color: '#155e75', fontWeight: '900', fontSize: 15, textAlign: 'center' },
  guestHint: { color: '#0e7490', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  noGoogleButton: { backgroundColor: '#2563eb', padding: 15, borderRadius: 14, alignItems: 'center' },
  noGoogleText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  noGoogleForm: { gap: 10, backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  noGoogleTitle: { color: '#0f172a', fontWeight: '900', fontSize: 16 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 13, color: '#0f172a', fontSize: 16 },
  formHint: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  errorText: { color: '#b91c1c', fontSize: 12, fontWeight: '800', lineHeight: 17 },
  disabledButton: { opacity: 0.5 },
  logoutButton: { padding: 8, alignItems: 'center' },
  logoutText: { color: '#dc2626', fontWeight: '800' },
  auth: { color: '#334155', fontWeight: '700', textAlign: 'center' },
  notice: { borderLeftWidth: 4, borderLeftColor: '#2563eb', padding: 12, backgroundColor: '#eff6ff', borderRadius: 8 },
  noticeText: { color: '#1e3a8a', lineHeight: 20 },
});
