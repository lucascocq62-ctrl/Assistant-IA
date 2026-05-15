import type { Session } from '@supabase/supabase-js';
import type { VetProfile } from './types';
import { assertSupabaseConfigured, supabase } from './supabase';

const authTimeoutMs = 15000;
const profileTimeoutMs = 15000;

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

  if (lowerMessage.includes('anonymous') || lowerMessage.includes('signups not allowed') || lowerMessage.includes('signup is disabled')) {
    return new Error('Les connexions anonymes Supabase ne sont pas activées. Va dans Supabase > Authentication > Providers et active Anonymous sign-ins, puis redéploie si nécessaire.');
  }

  if (lowerMessage.includes('failed to fetch') || lowerMessage.includes('network request failed') || lowerMessage.includes('timeout') || lowerMessage.includes('délai dépassé')) {
    return new Error('Impossible de joindre Supabase. Vérifie la connexion internet, EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans Vercel, puis redéploie.');
  }

  if (lowerMessage.includes('get_or_create_vet_profile') || lowerMessage.includes('function') || lowerMessage.includes('schema cache')) {
    return new Error('La fonction Supabase get_or_create_vet_profile est introuvable ou pas encore chargée. Applique les migrations avec supabase db push, puis réessaie.');
  }

  if (lowerMessage.includes('permission denied') || lowerMessage.includes('row-level security') || lowerMessage.includes('rls')) {
    return new Error('Supabase refuse l’accès au profil vétérinaire. Vérifie que la migration des profils vétérinaires et les politiques RLS sont appliquées.');
  }

  if (lowerMessage.includes('jwt') || lowerMessage.includes('auth') || lowerMessage.includes('utilisateur non authentifié')) {
    return new Error('La session Supabase n’est pas valide. Réessaie la connexion ; si l’erreur persiste, vérifie que Anonymous sign-ins est activé.');
  }

  return error instanceof Error ? error : new Error(message);
};

const buildLocalVetProfile = (session: Session, firstName: string, orderNumber: string): VetProfile => ({
  id: session.user.id,
  first_name: firstName,
  order_number: orderNumber,
  normalized_first_name: normalizeVetFirstName(firstName),
  normalized_order_number: normalizeVetOrderNumber(orderNumber),
  created_by_user_id: session.user.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const callVetProfileRpc = async (firstName: string, orderNumber: string) => {
  const { data, error } = await withTimeout(
    supabase.rpc('get_or_create_vet_profile', {
      profile_first_name: firstName,
      profile_order_number: orderNumber,
    }),
    profileTimeoutMs,
    'Délai dépassé pendant la création du profil vétérinaire.',
  );

  if (error) throw error;
  if (!data) throw new Error('Supabase n’a retourné aucun profil vétérinaire. Vérifie la fonction get_or_create_vet_profile.');

  return data as VetProfile;
};

const upsertVetProfileDirectly = async (session: Session, firstName: string, orderNumber: string) => {
  const profile = buildLocalVetProfile(session, firstName, orderNumber);
  const { data, error } = await withTimeout(
    supabase
      .from('vet_profiles')
      .upsert(
        {
          first_name: profile.first_name,
          order_number: profile.order_number,
          normalized_first_name: profile.normalized_first_name,
          normalized_order_number: profile.normalized_order_number,
          created_by_user_id: session.user.id,
          updated_at: profile.updated_at,
        },
        { onConflict: 'normalized_first_name,normalized_order_number' },
      )
      .select('*')
      .single(),
    profileTimeoutMs,
    'Délai dépassé pendant la sauvegarde directe du profil vétérinaire.',
  );

  if (error) throw error;
  if (!data) throw new Error('Supabase n’a retourné aucun profil vétérinaire après sauvegarde directe.');

  return data as VetProfile;
};

const getOrCreateVetProfileResiliently = async (session: Session, firstName: string, orderNumber: string) => {
  try {
    return { profile: await callVetProfileRpc(firstName, orderNumber) };
  } catch (rpcError) {
    console.warn('Vet profile RPC failed, trying direct table upsert.', rpcError);

    try {
      return {
        profile: await upsertVetProfileDirectly(session, firstName, orderNumber),
        warning: 'Le profil a été sauvegardé par le mode de secours car le RPC Supabase a échoué.',
      };
    } catch (directError) {
      console.warn('Direct vet profile upsert failed, using session metadata fallback.', directError);
      return {
        profile: buildLocalVetProfile(session, firstName, orderNumber),
        warning: `${toFriendlyAuthError(rpcError).message} Connexion maintenue avec le profil de session local.`,
      };
    }
  }
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

const updateAnonymousUserMetadata = async (firstName: string, orderNumber: string) => {
  const { error } = await withTimeout(
    supabase.auth.updateUser({
      data: {
        first_name: firstName,
        order_number: orderNumber,
        sign_in_method: 'without_google',
      },
    }),
    authTimeoutMs,
    'Délai dépassé pendant la mise à jour de la session Supabase.',
  );

  if (error) {
    console.warn('Unable to persist no-Google auth metadata on Supabase user.', error);
  }
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
    const { profile } = await getOrCreateVetProfileResiliently(session, metadataFirstName, metadataOrderNumber);
    return profile;
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

export const signInWithoutGoogle = async (firstName: string, orderNumber: string) => {
  assertSupabaseConfigured();

  const { cleanFirstName, cleanOrderNumber } = cleanNoGoogleCredentials(firstName, orderNumber);

  try {
    await clearPartialSession();

    const { data: anonymousData, error: anonymousError } = await withTimeout(
      supabase.auth.signInAnonymously({
        options: {
          data: {
            first_name: cleanFirstName,
            order_number: cleanOrderNumber,
            sign_in_method: 'without_google',
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

    await updateAnonymousUserMetadata(cleanFirstName, cleanOrderNumber);
    const { profile, warning } = await getOrCreateVetProfileResiliently(activeSession, cleanFirstName, cleanOrderNumber);
    const session = (await getSessionAfterAnonymousSignIn(activeSession)) ?? activeSession;

    return { profile, session, warning };
  } catch (error) {
    await clearPartialSession();
    throw toFriendlyAuthError(error);
  }
};
