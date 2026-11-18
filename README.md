# Dexfolio — le dex de ta collection Pokémon TCG

Application web (PC + mobile, installable) pour suivre une **vraie collection de cartes Pokémon TCG à compléter**, extension par extension, avec connexion sécurisée, base de données synchronisée et **scanner de cartes** par appareil photo, reconnu par **ton IA locale (Qwen)**.

> Projet de fan **non officiel**. Pokémon, le JCC Pokémon et les noms associés sont des marques de Nintendo, Creatures Inc., GAME FREAK inc. et The Pokémon Company. Ce projet n'est ni affilié ni approuvé par ces sociétés. Le nom « Pokédex » étant une marque déposée, l'app s'appelle **Dexfolio** et n'utilise ni logo officiel ni Poké Ball : seulement une palette rouge / jaune / bleu et un logo original. Données, images et cotes des cartes : API ouverte [TCGdex](https://tcgdex.dev).

## Fonctionnalités

- **Toutes les extensions** (de Wizards à aujourd'hui), en français ou dans 5 autres langues, regroupées par série, avec progression.
- **Classeur par extension** : cartes manquantes grisées, possédées en couleur, filtres (possédées / manquantes / raretés), mode « ajout rapide », cartes secrètes signalées, copie de la liste des manquantes.
- **Fiche carte** : image HD avec effet holographique 3D, quantités par variante (normale, reverse, holo, 1ʳᵉ édition) et par langue, attaques, faiblesses, illustrateur, **cote Cardmarket** (€) et TCGplayer ($).
- **Dex national** : une case par Pokémon (1 025), révélée dès que tu possèdes une carte de lui, progression par génération.
- **Tableau de bord** : cartes uniques, exemplaires, extensions commencées / complètes, **valeur estimée**, derniers ajouts.
- **Recherche** par nom ou par numéro imprimé (`25/165`), **liste d'envies** avec budget estimé.
- **Scanner** : photo → **IA locale (Qwen sur ton PC)** ou **lecture rapide (OCR dans le navigateur)**, et **saisie rapide** extension + numéro.
- Thème clair / sombre, export / import JSON & CSV, PWA (installable, images en cache hors-ligne).

## Architecture

```
Téléphone / PC ── https://<pseudo>.github.io/dexfolio/  (GitHub Pages, app statique)
        │
        ├── API TCGdex (cartes, images, cotes)
        └── Supabase (connexion + base Postgres, RLS) ◄── scanner du PC ── Ollama (Qwen3.6, GPU)
                                                         (connexion sortante uniquement)
```

Le scanner IA n'utilise **aucun modèle distant** : l'app dépose la photo dans ta base (table `scan_jobs`), le petit service `scanner/` qui tourne sur ton PC la fait lire par Qwen via l'Ollama de deepsearch, écrit le résultat puis **efface la photo**. Aucune porte n'est ouverte sur le PC.

## Sécurité

- Authentification **Supabase Auth** (e-mail + mot de passe, lien magique, réinitialisation), flux **PKCE**, mots de passe hachés côté serveur.
- **Row Level Security** sur toutes les tables : chaque utilisateur ne voit et ne modifie que ses propres données ; seul le scanner du PC peut écrire un résultat de scan (34 tests SQL).
- La clé présente dans l'app (`publishable`) est **publique par conception**. La clé **secrète** reste sur ton PC (`scanner/.env`, jamais commité).
- Limite anti-abus (20 scans/minute), Content-Security-Policy stricte injectée au build.

---

## 1. Lancer en local

Prérequis : Node.js 22+.

```bash
npm install
npm run dev        # http://localhost:5173
```

Sans `.env.local`, l'app tourne en **mode local** (collection dans le navigateur). Avec un fichier `.env.local` (voir `.env.example`), elle utilise Supabase.

## 2. Supabase (connexion + base de données)

Le projet `dexfolio` est déjà créé et configuré. Pour en recréer un :

1. Projet gratuit sur [supabase.com](https://supabase.com) (région Europe).
2. **SQL Editor** : exécuter [`supabase/migrations/20261118000000_init.sql`](supabase/migrations/20261118000000_init.sql).
3. **Authentication → URL Configuration** : *Site URL* `https://<pseudo>.github.io/dexfolio/`, *Redirect URLs* `https://<pseudo>.github.io/dexfolio/**` et `http://localhost:5173/**`.
4. GitHub → *Settings → Secrets and variables → Actions → Variables* : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (clé **publishable**).

> Le service d'e-mail intégré de Supabase n'écrit qu'aux adresses des membres de l'organisation : inscris-toi dans l'app **avec l'e-mail de ton compte Supabase/GitHub**. Pour inviter des amis, configure un SMTP (*Authentication → Emails → SMTP*). Une fois ton compte créé, tu peux fermer les inscriptions (*Authentication → Sign In / Providers*).

## 3. Scanner IA local (Qwen)

Prérequis : la pile **deepsearch** lancée (conteneur `ds-ollama` avec `qwen3.6-recherche`, modèle multimodal).

1. Copie `scanner/.env.example` en `scanner/.env` et colle la **clé secrète** Supabase (*Project Settings → API Keys → Secret keys*).
2. Lance le service (il redémarre tout seul avec Docker) :
   ```powershell
   cd scanner
   docker compose up -d --build
   ```
3. Dans l'app, onglet **Scanner** : « Qwen est prêt sur ton PC » doit s'afficher.

Sans Docker : `cd scanner`, `npm install`, puis `$env:OLLAMA_URL='http://localhost:11434'; npm start`.

Mesures sur RTX 5080 (Qwen3.6 35B-A3B, `think: false`) : **6 à 15 s par carte**, nom + numéro + total lus correctement sur les cartes testées (récentes, secrètes et de 1999).

## 4. Mise en ligne

Chaque `git push` sur `main` déclenche [`deploy.yml`](.github/workflows/deploy.yml) qui construit l'app et la publie sur GitHub Pages (*Settings → Pages → Source : GitHub Actions*).

## Structure

```
src/
  components/   UI (boutons, feuilles, cartes holo, mise en page)
  lib/          API TCGdex, Supabase, collection, auth, réglages, prix
  pages/        Accueil, Extensions, Classeur, Dex, Recherche, Scanner, Envies, Réglages
  scanner/      capture caméra, OCR (Tesseract), IA locale (file Supabase), rapprochement catalogue
scanner/        service du PC : file scan_jobs → Ollama (Qwen) → résultat
supabase/
  migrations/   schéma SQL + RLS + fonction d'ajout atomique + file de scans
```

## Licence

Code sous licence MIT. Les images et données de cartes restent la propriété de leurs ayants droit.
