# Vet'Help

Vet'Help est une application mobile autonome pour générer un compte rendu de consultation vétérinaire à partir d'un enregistrement audio.

## Fonctionnalités

- Enregistrement audio depuis le téléphone.
- Choix du moteur de transcription à chaque consultation :
  - **Groq** (`whisper-large-v3-turbo`) pour le coût minimal.
  - **ChatGPT/OpenAI** (`gpt-4o-mini-transcribe`) pour rester sur l'écosystème OpenAI.
- Rédaction systématique du compte rendu avec OpenAI (`OPENAI_REPORT_MODEL`, par défaut `gpt-5.4-nano`).
- Suppression automatique de l'audio côté mobile et dans Supabase Storage dès que la transcription est terminée.
- Modèles de consultation configurables avec rubriques et consignes.
- Import d'un modèle depuis une photo via une Edge Function OpenAI multimodale.
- Authentification Google via Supabase pour identifier le vétérinaire qui demande la génération.
- Base de données Supabase avec profils, demandes de génération, consultations, modèles et RLS par utilisateur.

## Architecture

```text
Expo / React Native
  ├─ Enregistrement audio local
  ├─ Upload temporaire Supabase Storage: audio-temp
  ├─ Edge Function process-consultation
  │   ├─ Transcription Groq ou OpenAI
  │   ├─ Suppression immédiate audio-temp
  │   └─ Rédaction du compte rendu avec OpenAI
  └─ Tables Supabase: profiles, generation_requests, consultations, consultation_templates
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
EXPO_PUBLIC_AUTH_REDIRECT_URL=https://YOUR_VERCEL_DOMAIN.vercel.app
```


## Déploiement Vercel web

Le projet est configuré pour éviter le 404 Vercel : Vercel lance `npm run build`, Expo exporte l'application web statique dans `dist`, puis toutes les routes sont réécrites vers `index.html`.

Dans Vercel, vérifie les paramètres suivants :

- **Framework Preset** : `Other` ou auto avec le fichier `vercel.json`.
- **Build Command** : `npm run build`.
- **Output Directory** : `dist`.
- **Install Command** : `npm install`.

Ajoute aussi ces variables d'environnement côté Vercel avant de redéployer. `EXPO_PUBLIC_AUTH_REDIRECT_URL` doit être ton domaine Vercel public, sinon Supabase/Google peut retomber sur `localhost` :

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
EXPO_PUBLIC_AUTH_REDIRECT_URL=https://YOUR_VERCEL_DOMAIN.vercel.app
```

Après modification, lance un nouveau déploiement Vercel. Si tu vois encore un 404, vérifie que le déploiement utilise bien le dernier commit et que `dist/index.html` est publié comme dossier de sortie.


### Correction de l’erreur Google qui redirige vers localhost

Si le navigateur affiche `localhost n’autorise pas la connexion` après le clic sur Google, ce n’est pas un problème du bouton : l’URL de retour OAuth pointe encore vers `localhost`. Corrige ces trois endroits puis redéploie :

1. Dans Vercel > Project Settings > Environment Variables, ajoute `EXPO_PUBLIC_AUTH_REDIRECT_URL=https://TON-DOMAINE.vercel.app`.
2. Dans Supabase > Authentication > URL Configuration, mets **Site URL** à `https://TON-DOMAINE.vercel.app`.
3. Dans Supabase > Authentication > URL Configuration > Redirect URLs, ajoute `https://TON-DOMAINE.vercel.app` et, pour mobile, `vethelp://auth/callback`.

## Configuration Supabase

1. Créer un projet Supabase.
2. Activer **Google** dans Supabase Auth > Providers.
3. Dans Supabase Auth > URL Configuration, règle **Site URL** sur `https://TON-DOMAINE.vercel.app` et ajoute les redirect URLs `https://TON-DOMAINE.vercel.app`, `https://TON-PROJET.supabase.co/auth/v1/callback` et `vethelp://auth/callback` pour mobile. Si cette étape reste sur `localhost`, Google affichera `ERR_CONNECTION_REFUSED` après connexion.
4. Appliquer la migration :

```bash
supabase db push
```

5. Déployer les Edge Functions :

```bash
supabase functions deploy process-consultation
supabase functions deploy extract-template
```

6. Ajouter les secrets :

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set GROQ_API_KEY=gsk_...
supabase secrets set OPENAI_REPORT_MODEL=gpt-5.4-nano
supabase secrets set OPENAI_TEMPLATE_MODEL=gpt-5.4-nano
```


## Données créées en base

Lorsqu’un compte rendu est demandé, l’application crée immédiatement une ligne `consultations` avec le statut `processing`, l’email du compte Google et le fournisseur de transcription choisi. L’audio est ensuite envoyé dans le bucket privé `audio-temp`, puis l’Edge Function met à jour la même ligne avec la transcription, le compte rendu, les timestamps de traitement et le statut final.

Une ligne `generation_requests` est également créée pour tracer qui a demandé la génération, avec quel fournisseur de transcription et quel modèle OpenAI de rédaction. L’audio n’est pas conservé : `audio_path` est vidé et `audio_deleted_at` est renseigné après suppression du fichier temporaire.

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
