import { Linking, Platform } from 'react-native';
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
