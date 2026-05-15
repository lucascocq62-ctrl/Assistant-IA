import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Expo remplace uniquement les accès directs `process.env.EXPO_PUBLIC_*` dans le bundle web.
// Ne pas passer par un objet intermédiaire, sinon les variables Vercel peuvent rester undefined côté navigateur.
// @ts-ignore Expo expose ces variables au build même si le type généré de process.env ne les déclare pas.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
// @ts-ignore Expo expose ces variables au build même si le type généré de process.env ne les déclare pas.
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

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
    detectSessionInUrl: false,
  },
});
