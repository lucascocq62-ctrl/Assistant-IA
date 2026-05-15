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
- Authentification sans Google via Supabase : prénom + numéro d’ordre avec session anonyme, ou accès invité local sans authentification.
- Base de données Supabase avec profils vétérinaires prénom + numéro d’ordre, demandes de génération, consultations, modèles et RLS par utilisateur.

## Architecture

```text
Expo / React Native
  ├─ Enregistrement audio local
  ├─ Upload temporaire Supabase Storage: audio-temp
  ├─ Edge Function process-consultation
  │   ├─ Transcription Groq ou OpenAI
  │   ├─ Suppression immédiate audio-temp
  │   └─ Rédaction du compte rendu avec OpenAI
  └─ Tables Supabase: profiles, vet_profiles, generation_requests, consultations, consultation_templates
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
2. Dans Supabase > Authentication > Providers, active **Anonymous sign-ins**. C’est indispensable : la connexion prénom + numéro d’ordre crée une session Supabase anonyme avant de créer/récupérer le profil vétérinaire.
3. Dans Supabase > Project Settings > API, copie l’URL du projet et la clé `anon public`, puis renseigne-les dans `.env` localement et dans les variables d’environnement Vercel : `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
4. Appliquer les migrations :

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



### Mode invité sans authentification

Le bouton **Accéder sans authentification** permet d’ouvrir l’application sans compte Supabase. Ce mode sert à tester l’interface, préparer des modèles et créer un brouillon local de compte rendu.

En mode invité :

- les modèles créés sont stockés localement sur l’appareil avec `AsyncStorage` ;
- l’audio n’est pas envoyé à Supabase et reste sur l’appareil ;
- aucun appel de transcription ou de rédaction IA n’est lancé ;
- le compte rendu généré est un brouillon structuré avec les rubriques du modèle et doit être complété manuellement, ou régénéré après connexion.

Pour obtenir un compte rendu rempli automatiquement par l’IA, il faut se connecter avec le prénom + numéro d’ordre.


### Connexion prénom + numéro d’ordre

L’écran d’accueil n’utilise plus Google. Le formulaire demande un prénom et un numéro d’ordre, puis propose deux parcours distincts :

- **Nouvelle connexion** : Vet’Help crée une session Supabase anonyme, appelle `create_vet_profile`, crée le profil vétérinaire, puis laisse entrer l’utilisateur. Si un profil existe déjà avec les mêmes valeurs normalisées, l’accès est refusé et l’utilisateur doit choisir **J’ai déjà un profil**.
- **J’ai déjà un profil** : Vet’Help crée une session Supabase anonyme, appelle `verify_vet_profile`, vérifie que le profil existe déjà, puis laisse entrer l’utilisateur uniquement si le prénom + numéro d’ordre correspondent. Si aucun profil ne correspond, l’accès est refusé.

Les fonctions SQL normalisent le prénom et le numéro d’ordre avant comparaison : elles ignorent les majuscules, les accents, les espaces et les séparateurs du numéro.

Checklist précise pour que ça fonctionne en production :

1. Supabase > Authentication > Providers : activer **Anonymous sign-ins**.
2. Supabase > SQL Editor ou Supabase CLI : appliquer toutes les migrations avec `supabase db push`. Les migrations `202605150001_vet_profiles_without_google.sql`, `202605150002_harden_no_google_auth.sql`, `202605150003_resilient_vet_profile_policies.sql` et `202605150004_split_vet_profile_auth_flows.sql` doivent créer/renforcer `vet_profiles`, ses politiques RLS, `create_vet_profile` et `verify_vet_profile`.
3. Vercel > Project Settings > Environment Variables : ajouter `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` avec les valeurs du projet Supabase. Attention : ces variables Expo sont injectées au build, donc il faut redéployer après chaque changement.
4. Redéployer Vercel après l’ajout des variables, puis vérifier que le déploiement utilise bien le dernier commit.
5. Tester l’app : saisir un prénom, saisir un numéro d’ordre, choisir **Nouvelle connexion** pour créer un profil ou **J’ai déjà un profil** pour vérifier un profil existant, puis cliquer le bouton principal. Si ça échoue, le message affiché indique quoi corriger : Anonymous sign-ins, variables Vercel, profil introuvable/existant, réseau ou migration RPC.

### Diagnostic si la connexion ne marche pas

- Si le message parle de `EXPO_PUBLIC_SUPABASE_URL` ou `EXPO_PUBLIC_SUPABASE_ANON_KEY`, ajoute les deux variables dans Vercel puis redéploie : Expo ne les lit pas dynamiquement après le build.
- Si le message parle des connexions anonymes, active **Anonymous sign-ins** dans Supabase > Authentication > Providers.
- Si le message dit qu’un profil existe déjà, passe par **J’ai déjà un profil** au lieu de **Nouvelle connexion**.
- Si le message dit qu’aucun profil ne correspond, vérifie le prénom et le numéro d’ordre ou crée d’abord le profil via **Nouvelle connexion**.
- Si le message parle de `create_vet_profile`, `verify_vet_profile` ou des politiques RLS, lance `supabase db push` sur le bon projet Supabase, puis attends quelques secondes que le cache de schéma Supabase se mette à jour.
- Si le message parle de réseau ou de délai dépassé, vérifie que l’URL Supabase correspond au bon projet et que la clé `anon public` n’a pas été copiée avec un espace.

## Données créées en base

Lorsqu’un compte rendu est demandé, l’application crée immédiatement une ligne `consultations` avec le statut `processing`, l’identifiant de session connecté et le fournisseur de transcription choisi. L’audio est ensuite envoyé dans le bucket privé `audio-temp`, puis l’Edge Function met à jour la même ligne avec la transcription, le compte rendu, les timestamps de traitement et le statut final.

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
