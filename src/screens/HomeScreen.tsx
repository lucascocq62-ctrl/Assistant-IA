import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RootStackParamList } from '../../App';
import { createVetProfileAndSignIn, getCurrentVetProfile, signInWithExistingVetProfile, signOut, type VetProfileSignInMode } from '../lib/auth';
import { getGuestMode, setGuestMode } from '../lib/guestMode';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { VetProfile } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const workflowSteps = [
  { title: 'Capture', text: 'Enregistre la consultation au fil de l’examen, avec suivi du temps et de la taille audio.' },
  { title: 'Génère', text: 'Transcription Groq/OpenAI puis compte rendu structuré selon tes modèles vétérinaires.' },
  { title: 'Valide', text: 'Relis, corrige et copie le résultat dans ton logiciel métier ou ton dossier patient.' },
];

const featureCards = [
  { title: 'Modèles personnalisables', text: 'SOAP, chirurgie, NAC, urgence, suivi : adapte les rubriques à ton style de rédaction.' },
  { title: 'Confidentialité opérationnelle', text: 'Audio temporaire, bucket privé Supabase et suppression après traitement côté fonction.' },
  { title: 'Mode terrain', text: 'Un mode invité permet de préparer un brouillon local quand l’accès complet n’est pas disponible.' },
  { title: 'Multi-fournisseurs IA', text: 'Choisis Groq pour la vitesse/coût ou OpenAI pour une intégration unifiée.' },
];

const trustBadges = ['Audio temporaire', 'Workflow vétérinaire', 'Modèles de clinique', 'Relecture obligatoire'];
const specialties = ['Médecine générale', 'Urgences', 'Chirurgie', 'NAC', 'Équine', 'Suivi client'];

export function HomeScreen({ navigation }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [authStatus, setAuthStatus] = useState('Connexion Supabase…');
  const [isNoGoogleSigningIn, setIsNoGoogleSigningIn] = useState(false);
  const [selectedSignInMode, setSelectedSignInMode] = useState<VetProfileSignInMode>('existing');
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


  const handleNoGoogleSignIn = async (mode: VetProfileSignInMode = selectedSignInMode) => {
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
      const { profile, session: nextSession } = mode === 'create'
        ? await createVetProfileAndSignIn(firstName, orderNumber)
        : await signInWithExistingVetProfile(firstName, orderNumber);
      setSession(nextSession);
      setVetProfile(profile);
      setIsGuestMode(false);
      await setGuestMode(false);
      setAuthStatus(mode === 'create' ? `Nouveau profil créé : ${profile.first_name} · n° ${profile.order_number}` : `Profil vérifié : ${profile.first_name} · n° ${profile.order_number}`);
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
        <View style={styles.heroTopRow}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>VH</Text>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>Copilote clinique IA</Text>
          </View>
        </View>
        <Text style={styles.kicker}>Assistant IA vétérinaire</Text>
        <Text style={styles.title}>Des comptes rendus propres avant la fin de la consultation.</Text>
        <Text style={styles.subtitle}>
          Vet’Help capture la consultation, génère une note structurée et te laisse garder le contrôle médical avant export.
        </Text>

        <View style={styles.benefitsRow}>
          {trustBadges.map((badge) => (
            <View key={badge} style={styles.benefitPill}>
              <Text style={styles.benefitText}>{badge}</Text>
            </View>
          ))}
        </View>

        <View style={styles.heroPreview}>
          <Text style={styles.previewEyebrow}>Flux de travail</Text>
          <View style={styles.previewLine}>
            <Text style={styles.previewStep}>● Capture</Text>
            <Text style={styles.previewArrow}>→</Text>
            <Text style={styles.previewStep}>Génère</Text>
            <Text style={styles.previewArrow}>→</Text>
            <Text style={styles.previewStep}>Valide</Text>
          </View>
        </View>
      </View>

      <View style={styles.workflowGrid}>
        {workflowSteps.map((step, index) => (
          <View key={step.title} style={styles.workflowCard}>
            <Text style={styles.workflowIndex}>{String(index + 1).padStart(2, '0')}</Text>
            <Text style={styles.workflowTitle}>{step.title}</Text>
            <Text style={styles.workflowText}>{step.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionKicker}>Pensé pour la clinique</Text>
        <Text style={styles.sectionTitle}>Un scribe IA vétérinaire, pas un dictaphone générique.</Text>
        <View style={styles.featureGrid}>
          {featureCards.map((feature) => (
            <View key={feature.title} style={styles.featureCard}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureText}>{feature.text}</Text>
            </View>
          ))}
        </View>
        <View style={styles.specialtyRow}>
          {specialties.map((specialty) => (
            <View key={specialty} style={styles.specialtyPill}>
              <Text style={styles.specialtyText}>{specialty}</Text>
            </View>
          ))}
        </View>
      </View>

      {canUseApp ? (
        <View style={styles.actionCard}>
          <Text style={styles.userLabel}>{isGuestMode && !session ? 'Accès sans authentification' : 'Compte connecté'}</Text>
          <Text style={styles.userEmail}>{connectedLabel}</Text>
          <View style={styles.quickActionsRow}>
            <View style={styles.quickMetric}>
              <Text style={styles.quickMetricValue}>3</Text>
              <Text style={styles.quickMetricLabel}>étapes</Text>
            </View>
            <View style={styles.quickMetric}>
              <Text style={styles.quickMetricValue}>2</Text>
              <Text style={styles.quickMetricLabel}>IA au choix</Text>
            </View>
            <View style={styles.quickMetric}>
              <Text style={styles.quickMetricValue}>0</Text>
              <Text style={styles.quickMetricLabel}>audio conservé</Text>
            </View>
          </View>
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
            <Text style={styles.formHint}>Choisis « Nouvelle connexion » pour créer un profil, ou « J’ai déjà un profil » pour vérifier qu’il existe avant d’entrer.</Text>
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
                if (canSubmitNoGoogle) void handleNoGoogleSignIn(selectedSignInMode);
              }}
              placeholder="Numéro d’ordre"
              returnKeyType="go"
              style={styles.input}
              value={orderNumber}
              onChangeText={setOrderNumber}
            />
            <View style={styles.modeSelector}>
              <Pressable
                accessibilityRole="button"
                style={[styles.modeButton, selectedSignInMode === 'create' && styles.selectedModeButton]}
                onPress={() => setSelectedSignInMode('create')}
                disabled={isNoGoogleSigningIn}
              >
                <Text style={[styles.modeButtonText, selectedSignInMode === 'create' && styles.selectedModeButtonText]}>Nouvelle connexion</Text>
                <Text style={styles.modeHint}>Crée un profil vétérinaire.</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={[styles.modeButton, selectedSignInMode === 'existing' && styles.selectedModeButton]}
                onPress={() => setSelectedSignInMode('existing')}
                disabled={isNoGoogleSigningIn}
              >
                <Text style={[styles.modeButtonText, selectedSignInMode === 'existing' && styles.selectedModeButtonText]}>J’ai déjà un profil</Text>
                <Text style={styles.modeHint}>Vérifie que le profil existe.</Text>
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" style={[styles.noGoogleButton, !canSubmitNoGoogle && styles.disabledButton]} onPress={() => handleNoGoogleSignIn(selectedSignInMode)} disabled={!canSubmitNoGoogle}>
              <Text style={styles.noGoogleText}>{isNoGoogleSigningIn ? 'Connexion sécurisée…' : selectedSignInMode === 'create' ? 'Créer mon profil' : 'Vérifier mon profil'}</Text>
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
        <Text style={styles.noticeText}>Pour que cette connexion fonctionne, Supabase doit avoir les connexions anonymes activées et les migrations des profils vétérinaires appliquées.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#eef7f6' },
  container: { flexGrow: 1, padding: 22, justifyContent: 'center', gap: 16 },
  heroCard: { backgroundColor: '#062f2f', borderRadius: 32, padding: 24, gap: 14, shadowColor: '#0f172a', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 14 } },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  logoMark: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#7dd3fc', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#083344', fontWeight: '900', fontSize: 22 },
  heroBadge: { backgroundColor: 'rgba(236,253,245,0.14)', borderWidth: 1, borderColor: 'rgba(167,243,208,0.35)', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  heroBadgeText: { color: '#ccfbf1', fontWeight: '900', fontSize: 12 },
  kicker: { color: '#99f6e4', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 12 },
  title: { fontSize: 38, lineHeight: 42, fontWeight: '900', color: '#fff' },
  subtitle: { fontSize: 16, lineHeight: 24, color: '#d1fae5' },
  benefitsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  benefitPill: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 10 },
  benefitText: { color: '#ecfeff', fontWeight: '700', fontSize: 12 },
  heroPreview: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', gap: 8 },
  previewEyebrow: { color: '#99f6e4', fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  previewLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  previewStep: { color: '#fff', fontWeight: '900' },
  previewArrow: { color: '#67e8f9', fontWeight: '900' },
  workflowGrid: { gap: 10 },
  workflowCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#ccfbf1', gap: 7 },
  workflowIndex: { color: '#0d9488', fontWeight: '900', fontSize: 12 },
  workflowTitle: { color: '#0f172a', fontWeight: '900', fontSize: 18 },
  workflowText: { color: '#475569', lineHeight: 20 },
  sectionCard: { backgroundColor: '#fff', borderRadius: 26, padding: 18, borderWidth: 1, borderColor: '#dbeafe', gap: 14 },
  sectionKicker: { color: '#0d9488', fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 },
  sectionTitle: { color: '#0f172a', fontWeight: '900', fontSize: 22, lineHeight: 27 },
  featureGrid: { gap: 10 },
  featureCard: { backgroundColor: '#f8fafc', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', gap: 6 },
  featureTitle: { color: '#0f172a', fontWeight: '900' },
  featureText: { color: '#475569', lineHeight: 19, fontSize: 13 },
  specialtyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  specialtyPill: { backgroundColor: '#ecfeff', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#a5f3fc' },
  specialtyText: { color: '#155e75', fontWeight: '800', fontSize: 12 },
  actionCard: { backgroundColor: '#fff', borderColor: '#ccfbf1', borderWidth: 1, padding: 18, borderRadius: 22, gap: 12 },
  actionTitle: { color: '#0f172a', fontWeight: '900', fontSize: 20 },
  actionText: { color: '#475569', lineHeight: 21 },
  userLabel: { color: '#64748b', fontWeight: '700' },
  userEmail: { color: '#0f172a', fontWeight: '900', marginBottom: 4 },
  quickActionsRow: { flexDirection: 'row', gap: 8 },
  quickMetric: { flex: 1, backgroundColor: '#f0fdfa', borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ccfbf1' },
  quickMetricValue: { color: '#0f766e', fontWeight: '900', fontSize: 20 },
  quickMetricLabel: { color: '#475569', fontWeight: '700', fontSize: 11, textAlign: 'center' },
  primaryButton: { backgroundColor: '#0f766e', padding: 16, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryButton: { backgroundColor: '#ecfeff', padding: 16, borderRadius: 14, alignItems: 'center' },
  secondaryText: { color: '#0e7490', fontWeight: '800', fontSize: 15 },
  separatorRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  separatorText: { color: '#64748b', fontWeight: '800' },
  guestButton: { backgroundColor: '#ecfeff', borderWidth: 1, borderColor: '#67e8f9', padding: 14, borderRadius: 14, gap: 4 },
  guestText: { color: '#155e75', fontWeight: '900', fontSize: 15, textAlign: 'center' },
  guestHint: { color: '#0e7490', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  noGoogleButton: { backgroundColor: '#0f766e', padding: 15, borderRadius: 14, alignItems: 'center' },
  modeSelector: { flexDirection: 'row', gap: 10 },
  modeButton: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 14, padding: 12, backgroundColor: '#fff', gap: 4 },
  selectedModeButton: { backgroundColor: '#ccfbf1', borderColor: '#0d9488' },
  modeButtonText: { color: '#0f172a', fontWeight: '900', fontSize: 13 },
  selectedModeButtonText: { color: '#0f766e' },
  modeHint: { color: '#64748b', fontSize: 11, lineHeight: 15 },
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
  notice: { borderLeftWidth: 4, borderLeftColor: '#0d9488', padding: 12, backgroundColor: '#f0fdfa', borderRadius: 8 },
  noticeText: { color: '#115e59', lineHeight: 20 },
});
