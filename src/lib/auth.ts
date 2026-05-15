import type { Session } from '@supabase/supabase-js';
import type { VetProfile } from './types';
import { assertSupabaseConfigured, supabase } from './supabase';

const authTimeoutMs = 15000;
const profileTimeoutMs = 15000;

export const signOut = () => supabase.auth.signOut();

const cleanNoGoogleCredentials = (firstName: string, orderNumber: string) => {
  const cleanFirstName = firstName.trim().replace(/\s+/g, ' ');
  const cleanOrderNumber = orderNumber.trim();

  if (!cleanFirstName || !cleanOrderNumber) {
    throw new Error('Renseigne un prénom et un numéro d’ordre.');
  }

  return { cleanFirstName, cleanOrderNumber };
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
    return new Error('Les connexions anonymes Supabase ne sont pas activées. Va dans Supabase > Authentication > Providers et active Anonymous sign-ins, puis redéploie.');
  }

  if (lowerMessage.includes('failed to fetch') || lowerMessage.includes('network request failed') || lowerMessage.includes('timeout')) {
    return new Error('Impossible de joindre Supabase. Vérifie la connexion internet et tes variables d’environnement.');
  }

  if (lowerMessage.includes('get_or_create_vet_profile') || lowerMessage.includes('function')) {
    return new Error('La fonction Supabase get_or_create_vet_profile est introuvable. Vérifie tes migrations SQL.');
  }

  if (lowerMessage.includes('permission denied') || lowerMessage.includes('rls')) {
    return new Error('Accès refusé. Vérifie les politiques RLS de ta base de données.');
  }

  return error instanceof Error ? error : new Error(message);
};

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
  if (!data) throw new Error('Supabase n’a retourné aucun profil.');

  return data as VetProfile;
};

const getSessionAfterAnonymousSignIn = async (fallbackSession: Session | null) => {
  if (fallbackSession) return fallbackSession;

  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    authTimeoutMs,
    'Délai dépassé pendant la récupération de la session.',
  );

  if (error) throw error;
  return data.session;
};

const clearPartialSession = async () => {
  try {
    await withTimeout(supabase.auth.signOut({ scope: 'local' }), 8000, 'Délai dépassé pendant le nettoyage de la session.');
  } catch (error) {
    console.warn('Unable to clear partial session.', error);
  }
};

export const getCurrentVetProfile = async () => {
  assertSupabaseConfigured();

  const { data: sessionData, error: sessionError } = await withTimeout(
    supabase.auth.getSession(),
    authTimeoutMs,
    'Délai dépassé pendant la récupération de la session.',
  );
  if (sessionError) throw toFriendlyAuthError(sessionError);

  const session = sessionData.session;
  if (!session) return null;

  const metadata = session.user.user_metadata;
  const metadataFirstName = metadata.first_name || '';
  const metadataOrderNumber = metadata.order_number || '';

  if (metadataFirstName && metadataOrderNumber) {
    try {
      return await callVetProfileRpc(metadataFirstName, metadataOrderNumber);
    } catch (error) {
      throw toFriendlyAuthError(error);
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
    'Délai dépassé pendant la récupération du profil.',
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
      'Délai dépassé pendant la connexion anonyme.',
    );

    if (anonymousError) throw anonymousError;

    const activeSession = await getSessionAfterAnonymousSignIn(anonymousData.session);

    if (!activeSession) {
      throw new Error('La session n’a pas pu être créée. Vérifie que l’accès anonyme est activé.');
    }

    const profile = await callVetProfileRpc(cleanFirstName, cleanOrderNumber);

    return { profile, session: activeSession };
  } catch (error) {
    await clearPartialSession();
    throw toFriendlyAuthError(error);
  }
};
