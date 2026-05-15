import type { Session } from '@supabase/supabase-js';
import type { VetProfile } from './types';
import { assertSupabaseConfigured, supabase } from './supabase';

export const signOut = () => supabase.auth.signOut();

const cleanNoGoogleCredentials = (firstName: string, orderNumber: string) => {
  const cleanFirstName = firstName.trim();
  const cleanOrderNumber = orderNumber.trim();

  if (!cleanFirstName || !cleanOrderNumber) {
    throw new Error('Renseigne un prénom et un numéro d’ordre.');
  }

  return { cleanFirstName, cleanOrderNumber };
};

export const getCurrentVetProfile = async () => {
  assertSupabaseConfigured();

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) return null;

  const metadata = session.user.user_metadata;
  const metadataFirstName = typeof metadata.first_name === 'string' ? metadata.first_name : '';
  const metadataOrderNumber = typeof metadata.order_number === 'string' ? metadata.order_number : '';

  if (metadataFirstName && metadataOrderNumber) {
    const { data, error } = await supabase.rpc('get_or_create_vet_profile', {
      profile_first_name: metadataFirstName,
      profile_order_number: metadataOrderNumber,
    });

    if (error) throw error;
    return data as VetProfile;
  }

  const { data, error } = await supabase
    .from('vet_profiles')
    .select('*')
    .eq('created_by_user_id', session.user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as VetProfile | null;
};

export const signInWithoutGoogle = async (firstName: string, orderNumber: string) => {
  assertSupabaseConfigured();

  const { cleanFirstName, cleanOrderNumber } = cleanNoGoogleCredentials(firstName, orderNumber);

  let activeSession: Session | null = null;
  const { data: sessionData } = await supabase.auth.getSession();

  if (sessionData.session) {
    activeSession = sessionData.session;
  } else {
    const { data: anonymousData, error } = await supabase.auth.signInAnonymously({
      options: {
        data: {
          first_name: cleanFirstName,
          order_number: cleanOrderNumber,
          sign_in_method: 'without_google',
        },
      },
    });
    if (error) throw error;
    activeSession = anonymousData.session;
  }

  if (!activeSession) {
    const { data: refreshedSession } = await supabase.auth.getSession();
    activeSession = refreshedSession.session;
  }

  if (!activeSession) {
    throw new Error('La session sans Google n’a pas pu être créée. Vérifie que les connexions anonymes Supabase sont activées.');
  }

  const { error: updateUserError } = await supabase.auth.updateUser({
    data: {
      first_name: cleanFirstName,
      order_number: cleanOrderNumber,
      sign_in_method: 'without_google',
    },
  });
  if (updateUserError) throw updateUserError;

  const { data, error } = await supabase.rpc('get_or_create_vet_profile', {
    profile_first_name: cleanFirstName,
    profile_order_number: cleanOrderNumber,
  });

  if (error) throw error;
  return { profile: data as VetProfile, session: activeSession };
};
