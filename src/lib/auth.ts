import { Linking, Platform } from 'react-native';
import type { VetProfile } from './types';
import { assertSupabaseConfigured, supabase } from './supabase';

const nativeRedirectUrl = 'vethelp://auth/callback';

const getConfiguredRedirectUrl = () => process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL?.trim();

const getRedirectUrl = () => {
  const configuredRedirectUrl = getConfiguredRedirectUrl();
  if (configuredRedirectUrl) return configuredRedirectUrl;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }

  return nativeRedirectUrl;
};

export const getGoogleRedirectUrl = getRedirectUrl;

export const signInWithGoogle = async () => {
  assertSupabaseConfigured();

  const redirectTo = getRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) throw error;

  if (data.url) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign(data.url);
      return;
    }

    await Linking.openURL(data.url);
  }
};

export const signOut = () => supabase.auth.signOut();

export const completeOAuthSignIn = async (url: string) => {
  const parsedUrl = new URL(url);
  const code = parsedUrl.searchParams.get('code');

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  }
};

export const signInWithoutGoogle = async (firstName: string, orderNumber: string) => {
  assertSupabaseConfigured();

  const cleanFirstName = firstName.trim();
  const cleanOrderNumber = orderNumber.trim();
  if (!cleanFirstName || !cleanOrderNumber) {
    throw new Error('Renseigne un prénom et un numéro d’ordre.');
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    const { error } = await supabase.auth.signInAnonymously({
      options: {
        data: {
          first_name: cleanFirstName,
          order_number: cleanOrderNumber,
          sign_in_method: 'without_google',
        },
      },
    });
    if (error) throw error;
  }

  const { data, error } = await supabase.rpc('get_or_create_vet_profile', {
    profile_first_name: cleanFirstName,
    profile_order_number: cleanOrderNumber,
  });

  if (error) throw error;
  return data as VetProfile;
};
