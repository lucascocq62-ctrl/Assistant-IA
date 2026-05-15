import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const expoEnv = process.env as Record<string, string | undefined>;
const supabaseUrl = expoEnv.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = expoEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const assertSupabaseConfigured = () => {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase n’est pas configuré. Ajoute EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans Vercel puis redéploie.',
    );
  }
};

if (!isSupabaseConfigured) {
  console.warn('Supabase is not configured. Copy .env.example to .env and fill in your keys.');
}

export const supabase = createClient(supabaseUrl ?? 'https://missing-project.supabase.co', supabaseAnonKey ?? 'missing-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
