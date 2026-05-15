import type { Session } from '@supabase/supabase-js';
import type { VetProfile } from './types';
import { assertSupabaseConfigured, supabase } from './supabase';

const authTimeoutMs = 15000;
const profileTimeoutMs = 15000;

export type VetProfileSignInMode = 'create' | 'existing';

export const signOut = () => supabase.auth.signOut();

const normalizeVetFirstName = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizeVetOrderNumber = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

const cleanNoGoogleCredentials = (firstName: string, orderNumber: string) => {
  const cleanFirstName = firstName.trim().replace(/\s+/g, ' ');
  const cleanOrderNumber = orderNumber.trim();
  const normalizedFirstName = normalizeVetFirstName(cleanFirstName);
  const normalizedOrderNumber = normalizeVetOrderNumber(cleanOrderNumber);

  if (!normalizedFirstName || !normalizedOrderNumber) {
    throw new Error('Renseigne un prénom et un numéro d’ordre valide.');
  }

  return { cleanFirstName, cleanOrderNumber, normalizedFirstName, normalizedOrderNumber };
};

const withTimeout = async <T>(promise: PromiseLike<T>, timeoutMs: number, timeoutMessage: string) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const toFriendlyAuthError = (error: unknown) => {
  const message = getErrorMessage(error);
  const lowerMessage = message.toLowerCase();

  if (message.includes('PROFIL_EXISTE_DEJA')) {
    return new Error('Un profil existe déjà avec ce prénom et ce numéro d’ordre. Utilise plutôt « J’ai déjà un profil ».');
  }

  if (message.includes('PROFIL_INTROUVABLE')) {
    return new Error('Aucun profil ne correspond à ce prénom et ce numéro d’ordre. Vérifie les informations ou crée un nouveau profil.');
  }

  if (lowerMessage.includes('anonymous') || lowerMessage.includes('signups not allowed') || lowerMessage.includes('signup is disabled')) {
    return new Error('Les connexions anonymes Supabase ne sont pas activées. Va dans Supabase > Authentication > Providers et active Anonymous sign-ins, puis redéploie si nécessaire.');
  }

  if (lowerMessage.includes('failed to fetch') || lowerMessage.includes('network request failed') || lowerMessage.includes('timeout') || lowerMessage.includes('délai dépassé')) {
    return new Error('Impossible de joindre Supabase. Vérifie la connexion internet, EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans Vercel, puis redéploie.');
  }

  if (lowerMessage.includes('create_vet_profile') || lowerMessage.includes('verify_vet_profile') || lowerMessage.includes('get_or_create_vet_profile') || lowerMessage.includes('function') || lowerMessage.includes('schema cache')) {
    return new Error('Les fonctions Supabase de profil vétérinaire sont introuvables ou pas encore chargées. Applique les migrations avec supabase db push, puis réessaie.');
  }

  if (lowerMessage.includes('permission denied') || lowerMessage.includes('row-level security') || lowerMessage.includes('rls')) {
    return new Error('Supabase refuse l’accès au profil vétérinaire. Vérifie que la migration des profils vétérinaires et les politiques RLS sont appliquées.');
  }

  if (lowerMessage.includes('jwt') || lowerMessage.includes('auth') || lowerMessage.includes('utilisateur non authentifié')) {
    return new Error('La session Supabase n’est pas valide. Réessaie la connexion ; si l’erreur persiste, vérifie que Anonymous sign-ins est activé.');
  }

  return error instanceof Error ? error : new Error(message);
};

const getSessionAfterAnonymousSignIn = async (fallbackSession: Session | null) => {
  if (fallbackSession) return fallbackSession;

  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    authTimeoutMs,
    'Délai dépassé pendant la récupération de la session Supabase.',
  );

  if (error) throw error;
  return data.session;
};

const clearPartialSession = async () => {
  try {
    await withTimeout(supabase.auth.signOut({ scope: 'local' }), 8000, 'Délai dépassé pendant le nettoyage de la session Supabase.');
  } catch (error) {
    console.warn('Unable to clear partial Supabase session after failed no-Google sign-in.', error);
  }
};

const updateAnonymousUserMetadata = async (firstName: string, orderNumber: string, mode: VetProfileSignInMode) => {
  const { error } = await withTimeout(
    supabase.auth.updateUser({
      data: {
        first_name: firstName,
        order_number: orderNumber,
        sign_in_method: 'without_google',
        vet_profile_mode: mode,
      },
    }),
    authTimeoutMs,
    'Délai dépassé pendant la mise à jour de la session Supabase.',
  );

  if (error) {
    console.warn('Unable to persist no-Google auth metadata on Supabase user.', error);
  }
};

const createAnonymousSession = async (firstName: string, orderNumber: string, mode: VetProfileSignInMode) => {
  await clearPartialSession();

  const { data: anonymousData, error: anonymousError } = await withTimeout(
    supabase.auth.signInAnonymously({
      options: {
        data: {
          first_name: firstName,
          order_number: orderNumber,
          sign_in_method: 'without_google',
          vet_profile_mode: mode,
        },
      },
    }),
    authTimeoutMs,
    'Délai dépassé pendant la connexion anonyme Supabase.',
  );

  if (anonymousError) throw anonymousError;

  const activeSession = await getSessionAfterAnonymousSignIn(anonymousData.session);

  if (!activeSession) {
    throw new Error('La session sans Google n’a pas pu être créée. Vérifie que les connexions anonymes Supabase sont activées.');
  }

  return activeSession;
};

const callVetProfileAction = async (firstName: string, orderNumber: string, mode: VetProfileSignInMode) => {
  const functionName = mode === 'create' ? 'create_vet_profile' : 'verify_vet_profile';
  const timeoutMessage = mode === 'create' ? 'Délai dépassé pendant la création du profil vétérinaire.' : 'Délai dépassé pendant la vérification du profil vétérinaire.';
  const { data, error } = await withTimeout(
    supabase.rpc(functionName, {
      profile_first_name: firstName,
      profile_order_number: orderNumber,
    }),
    profileTimeoutMs,
    timeoutMessage,
  );

  if (error) throw error;
  if (!data) {
    throw new Error(mode === 'create' ? 'Supabase n’a retourné aucun profil vétérinaire après création.' : 'PROFIL_INTROUVABLE');
  }

  return data as VetProfile;
};

export const getCurrentVetProfile = async () => {
  assertSupabaseConfigured();

  const { data: sessionData, error: sessionError } = await withTimeout(
    supabase.auth.getSession(),
    authTimeoutMs,
    'Délai dépassé pendant la récupération de la session Supabase.',
  );
  if (sessionError) throw toFriendlyAuthError(sessionError);

  const session = sessionData.session;
  if (!session) return null;

  const metadata = session.user.user_metadata;
  const metadataFirstName = typeof metadata.first_name === 'string' ? metadata.first_name : '';
  const metadataOrderNumber = typeof metadata.order_number === 'string' ? metadata.order_number : '';

  if (metadataFirstName && metadataOrderNumber) {
    try {
      return await callVetProfileAction(metadataFirstName, metadataOrderNumber, 'existing');
    } catch (error) {
      console.warn('Unable to verify persisted vet profile from session metadata.', error);
    }
  }

  const { data, error } = await withTimeout(
    supabase
      .from('vet_profiles')
      .select('*')
      .eq('created_by_user_id', session.user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    profileTimeoutMs,
    'Délai dépassé pendant la récupération du profil vétérinaire.',
  );

  if (error) throw toFriendlyAuthError(error);
  return data as VetProfile | null;
};

export const signInWithVetProfile = async (firstName: string, orderNumber: string, mode: VetProfileSignInMode) => {
  assertSupabaseConfigured();

  const { cleanFirstName, cleanOrderNumber } = cleanNoGoogleCredentials(firstName, orderNumber);

  try {
    const activeSession = await createAnonymousSession(cleanFirstName, cleanOrderNumber, mode);
    await updateAnonymousUserMetadata(cleanFirstName, cleanOrderNumber, mode);
    const profile = await callVetProfileAction(cleanFirstName, cleanOrderNumber, mode);
    const session = (await getSessionAfterAnonymousSignIn(activeSession)) ?? activeSession;

    return { profile, session };
  } catch (error) {
    await clearPartialSession();
    throw toFriendlyAuthError(error);
  }
};

export const createVetProfileAndSignIn = (firstName: string, orderNumber: string) => signInWithVetProfile(firstName, orderNumber, 'create');

export const signInWithExistingVetProfile = (firstName: string, orderNumber: string) => signInWithVetProfile(firstName, orderNumber, 'existing');

export const signInWithoutGoogle = signInWithExistingVetProfile;
