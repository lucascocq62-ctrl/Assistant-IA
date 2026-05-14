import { Linking, Platform } from 'react-native';
import { supabase } from './supabase';

const getRedirectUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }

  return 'assistantiaveto://auth/callback';
};

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getRedirectUrl(),
      skipBrowserRedirect: Platform.OS !== 'web',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) throw error;

  if (Platform.OS !== 'web' && data.url) {
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
