# Dexfolio — le dex de ta collection Pokémon TCG

Application web (PC + mobile, installable) pour suivre une **vraie collection de cartes Pokémon TCG à compléter**, extension par extension, avec connexion sécurisée, base de données synchronisée et **scanner de cartes** par appareil photo.

> Projet de fan **non officiel**. Pokémon, le JCC Pokémon et les noms associés sont des marques de Nintendo, Creatures Inc., GAME FREAK inc. et The Pokémon Company. Ce projet n'est ni affilié ni approuvé par ces sociétés. Le nom « Pokédex » étant une marque déposée, l'app s'appelle **Dexfolio** et n'utilise ni logo officiel ni Poké Ball : seulement une palette rouge / jaune / bleu et un logo original. Données, images et cotes des cartes : API ouverte [TCGdex](https://tcgdex.dev).

## Fonctionnalités

- **Toutes les extensions** (de Wizards à aujourd'hui), en français ou dans 5 autres langues, regroupées par série, avec progression.
- **Classeur par extension** : cartes manquantes grisées, possédées en couleur, filtres (possédées / manquantes / raretés), mode « ajout rapide », cartes secrètes signalées, copie de la liste des manquantes.
- **Fiche carte** : image HD avec effet holographique 3D, quantités par variante (normale, reverse, holo, 1ʳᵉ édition) et par langue, attaques, faiblesses, illustrateur, **cote Cardmarket** (€) et TCGplayer ($).
- **Dex national** : une case par Pokémon (1 025), révélée dès que tu possèdes une carte de lui, progression par génération.
- **Tableau de bord** : cartes uniques, exemplaires, extensions commencées / complètes, **valeur estimée** de la collection, derniers ajouts.
- **Recherche** par nom ou par numéro imprimé (`25/165`).
- **Liste d'envies** avec budget estimé.
- **Scanner** : photo → reconnaissance par **IA (Claude)** ou **lecture locale gratuite (OCR)**, et **saisie rapide** extension + numéro.
- Thème clair / sombre, export / import JSON & CSV, PWA (installable sur l'écran d'accueil, images en cache hors-ligne).

## Pile technique

React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · TanStack Query · React Router · Supabase (Auth + Postgres + Edge Functions) · Tesseract.js · API Anthropic (Claude) · GitHub Pages + GitHub Actions.

## Sécurité

- Authentification **Supabase Auth** (e-mail + mot de passe, lien magique, réinitialisation), flux **PKCE**, mots de passe hachés côté serveur.
- **Row Level Security** sur toutes les tables : chaque utilisateur ne voit et ne modifie que ses propres données (testé : voir `supabase/migrations`).
- La clé présente dans l'app (`anon` / `publishable`) est **publique par conception** ; aucune clé secrète n'est dans le code ni dans le dépôt.
- La clé API Anthropic reste **côté serveur** (secret de l'Edge Function), avec vérification du jeton utilisateur et **limite quotidienne** de scans.
- Content-Security-Policy stricte injectée au build.

---

## 1. Lancer en local

Prérequis : Node.js 22+.

```bash
npm install
npm run dev        # http://localhost:5173
```

Sans configuration, l'app tourne en **mode local** (collection stockée dans le navigateur). Pour brancher la base, copie `.env.example` en `.env.local` et renseigne les deux valeurs Supabase.

## 2. Configurer Supabase (connexion + base de données)

1. Crée un projet gratuit sur [supabase.com](https://supabase.com) (région **Europe**, ex. Paris ou Francfort). Garde le mot de passe de la base pour toi.
2. **SQL Editor → New query** : colle le contenu de [`supabase/migrations/20261118000000_init.sql`](supabase/migrations/20261118000000_init.sql) puis **Run**.
3. **Authentication → URL Configuration** :
   - *Site URL* : `https://<ton-pseudo>.github.io/dexfolio/`
   - *Redirect URLs* : ajoute `https://<ton-pseudo>.github.io/dexfolio/**` et `http://localhost:5173/**`
4. **Authentication → Providers → Email** : laisse « Confirm email » activé ; règle la longueur minimale du mot de passe à 8 ou plus.
5. **Project Settings → API Keys** : copie l'URL du projet et la clé **publishable** (ou `anon`).
6. Sur GitHub : **Settings → Secrets and variables → Actions → Variables** du dépôt, crée :
   - `VITE_SUPABASE_URL` = `https://xxxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = la clé publishable / anon
7. Relance le déploiement (**Actions → Déployer sur GitHub Pages → Run workflow**).
8. Crée ton compte depuis l'app. Si l'app est pour toi seul, tu peux ensuite désactiver les inscriptions (*Authentication → Sign In / Providers → Allow new users to sign up*).

> Le service d'e-mail intégré de Supabase est limité (quelques e-mails par heure, destinataires de ton organisation). Pour ouvrir l'app à des amis, configure un SMTP personnalisé (*Authentication → Emails → SMTP*).

## 3. Scanner IA (optionnel)

Le scanner fonctionne sans IA (lecture locale gratuite + saisie rapide). Pour la reconnaissance par Claude :

1. Crée une clé API sur [console.anthropic.com](https://console.anthropic.com) et ajoute un peu de crédit. *(Un abonnement Claude Pro/Max ne donne pas de crédit API : c'est une facturation séparée, à l'usage.)*
2. Déploie la fonction (au choix) :
   - **CLI** : `npx supabase login`, puis
     `npx supabase functions deploy scan-card --project-ref <ref-du-projet> --no-verify-jwt`
   - **Tableau de bord** : *Edge Functions → Deploy a new function → Via Editor*, nomme-la `scan-card`, colle [`supabase/functions/scan-card/index.ts`](supabase/functions/scan-card/index.ts), désactive « Enforce JWT verification » (le jeton est vérifié dans le code), déploie.
3. *Edge Functions → Secrets* : ajoute `ANTHROPIC_API_KEY` (et optionnellement `ANTHROPIC_MODEL`, `SCAN_DAILY_LIMIT`, `ALLOWED_ORIGINS=https://<ton-pseudo>.github.io`).

**Coût indicatif par scan** (photo ≈ 1 000 tokens) : ≈ 1 à 2 centimes avec **Claude Opus 5.5** (modèle par défaut, le plus précis) ; ≈ 0,04 centime avec **Claude Haiku 5.5** (`ANTHROPIC_MODEL=claude-haiku-5-5`). La limite par défaut est de 60 scans IA par utilisateur et par jour.

## 4. Mise en ligne

Chaque `git push` sur `main` déclenche le workflow [`deploy.yml`](.github/workflows/deploy.yml) qui construit l'app et la publie sur GitHub Pages (*Settings → Pages → Source : GitHub Actions*).

## Structure

```
src/
  components/   UI (boutons, feuilles, cartes holo, mise en page)
  lib/          API TCGdex, Supabase, collection, auth, réglages, prix
  pages/        Accueil, Extensions, Classeur, Dex, Recherche, Scanner, Envies, Réglages
  scanner/      capture caméra, OCR (Tesseract), IA (Edge Function), rapprochement catalogue
supabase/
  migrations/   schéma SQL + RLS + fonction d'ajout atomique
  functions/    Edge Function « scan-card » (API Anthropic)
```

## Licence

Code sous licence MIT. Les images et données de cartes restent la propriété de leurs ayants droit.
