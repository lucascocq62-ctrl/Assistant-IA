# Assistant IA Veto

Application mobile autonome pour générer un compte rendu de consultation vétérinaire à partir d'un enregistrement audio.

## Fonctionnalités

- Enregistrement audio depuis le téléphone.
- Choix du moteur de transcription à chaque consultation :
  - **Groq** (`whisper-large-v3-turbo`) pour le coût minimal.
  - **ChatGPT/OpenAI** (`gpt-4o-mini-transcribe`) pour rester sur l'écosystème OpenAI.
- Rédaction systématique du compte rendu avec OpenAI (`OPENAI_REPORT_MODEL`, par défaut `gpt-5.4-nano`).
- Suppression automatique de l'audio côté mobile et dans Supabase Storage dès que la transcription est terminée.
- Modèles de consultation configurables avec rubriques et consignes.
- Import d'un modèle depuis une photo via une Edge Function OpenAI multimodale.
- Base de données Supabase avec RLS par utilisateur.

## Architecture

```text
Expo / React Native
  ├─ Enregistrement audio local
  ├─ Upload temporaire Supabase Storage: audio-temp
  ├─ Edge Function process-consultation
  │   ├─ Transcription Groq ou OpenAI
  │   ├─ Suppression immédiate audio-temp
  │   └─ Rédaction du compte rendu avec OpenAI
  └─ Tables Supabase: consultations, consultation_templates
```

## Installation locale

```bash
npm install
cp .env.example .env
npm run start
```

Renseigner dans `.env` :

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```


## Déploiement Vercel web

Le projet est configuré pour éviter le 404 Vercel : Vercel lance `npm run build`, Expo exporte l'application web statique dans `dist`, puis toutes les routes sont réécrites vers `index.html`.

Dans Vercel, vérifie les paramètres suivants :

- **Framework Preset** : `Other` ou auto avec le fichier `vercel.json`.
- **Build Command** : `npm run build`.
- **Output Directory** : `dist`.
- **Install Command** : `npm install`.

Ajoute aussi ces variables d'environnement côté Vercel avant de redéployer :

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Après modification, lance un nouveau déploiement Vercel. Si tu vois encore un 404, vérifie que le déploiement utilise bien le dernier commit et que `dist/index.html` est publié comme dossier de sortie.

## Configuration Supabase

1. Créer un projet Supabase.
2. Activer l'authentification anonyme dans Supabase Auth si tu veux garder le mode sans inscription au prototype.
3. Appliquer la migration :

```bash
supabase db push
```

4. Déployer les Edge Functions :

```bash
supabase functions deploy process-consultation
supabase functions deploy extract-template
```

5. Ajouter les secrets :

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set GROQ_API_KEY=gsk_...
supabase secrets set OPENAI_REPORT_MODEL=gpt-5.4-nano
supabase secrets set OPENAI_TEMPLATE_MODEL=gpt-5.4-nano
```

## Coût estimatif

Pour une consultation de 20 minutes, avec environ 5 000 tokens d'entrée et 1 500 tokens de sortie :

| Choix | Coût variable estimé |
| --- | ---: |
| Groq transcription + OpenAI rédaction | ~0,016 $ / consultation |
| OpenAI transcription + OpenAI rédaction | ~0,063 $ / consultation |

Supabase peut rester gratuit en prototype. Pour une petite production, prévoir Supabase Pro à partir d'environ 25 $ / mois, hors coûts IA.

## Notes importantes

- Le compte rendu est une proposition : il doit être relu et validé par le vétérinaire.
- L'audio est conçu comme une donnée temporaire. La suppression est faite dans un bloc `finally` de l'Edge Function afin de nettoyer même en cas d'erreur de transcription ou rédaction.
- Les politiques RLS isolent les modèles et consultations par utilisateur Supabase.
