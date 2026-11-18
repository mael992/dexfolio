-- =====================================================================
-- Dexfolio — schéma initial
-- À exécuter une seule fois : Supabase > SQL Editor > New query > Run
-- (ou `npx supabase db push` si tu utilises la CLI Supabase).
--
-- Sécurité : Row Level Security (RLS) activé sur toutes les tables.
-- Chaque utilisateur ne peut lire / écrire QUE ses propres lignes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Collection : une ligne par (carte, langue, variante)
-- ---------------------------------------------------------------------
create table if not exists public.collection_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id       text not null check (char_length(card_id) between 1 and 80),
  set_id        text not null check (char_length(set_id) between 1 and 80),
  lang          text not null default 'fr' check (lang in ('fr', 'en', 'de', 'es', 'it', 'pt')),
  variant       text not null default 'normal' check (variant in ('normal', 'reverse', 'holo', 'firstEdition', 'wPromo')),
  quantity      integer not null default 1 check (quantity between 1 and 9999),
  card_name     text not null check (char_length(card_name) between 1 and 120),
  card_local_id text check (char_length(card_local_id) <= 20),
  card_image    text check (char_length(card_image) <= 300),
  rarity        text check (char_length(rarity) <= 60),
  dex_ids       integer[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint collection_items_unique unique (user_id, card_id, lang, variant)
);

create index if not exists collection_items_user_updated_idx on public.collection_items (user_id, updated_at desc);
create index if not exists collection_items_user_set_idx on public.collection_items (user_id, set_id);

-- ---------------------------------------------------------------------
-- Liste d'envies
-- ---------------------------------------------------------------------
create table if not exists public.wishlist_items (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id       text not null check (char_length(card_id) between 1 and 80),
  set_id        text not null check (char_length(set_id) between 1 and 80),
  card_name     text not null check (char_length(card_name) between 1 and 120),
  card_local_id text check (char_length(card_local_id) <= 20),
  card_image    text check (char_length(card_image) <= 300),
  priority      smallint not null default 0 check (priority between 0 and 3),
  created_at    timestamptz not null default now(),
  primary key (user_id, card_id)
);

-- ---------------------------------------------------------------------
-- Scanner IA local : file d'attente traitée par le PC (Qwen via Ollama)
--   L'app dépose la photo ici ; le « scanner » qui tourne sur le PC la lit,
--   la fait analyser par le modèle LOCAL, écrit le résultat et efface la photo.
-- ---------------------------------------------------------------------
create table if not exists public.scan_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'processing', 'done', 'error')),
  image       text check (char_length(image) <= 3000000),
  lang        text check (lang in ('fr', 'en', 'de', 'es', 'it', 'pt')),
  result      jsonb,
  error       text check (char_length(error) <= 500),
  model       text check (char_length(model) <= 80),
  duration_ms integer,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists scan_jobs_status_created_idx on public.scan_jobs (status, created_at);
create index if not exists scan_jobs_user_created_idx on public.scan_jobs (user_id, created_at desc);

-- Battement de cœur du scanner local (l'app affiche « Qwen en ligne / hors ligne »)
create table if not exists public.scanner_status (
  id        text primary key check (char_length(id) <= 40),
  last_seen timestamptz not null default now(),
  model     text check (char_length(model) <= 80),
  info      jsonb
);

-- Anti-abus : 20 scans max par minute et par utilisateur
create or replace function public.scan_jobs_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.scan_jobs j
       where j.user_id = new.user_id and j.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Trop de scans en une minute, patiente un peu.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists scan_jobs_rate_limit on public.scan_jobs;
create trigger scan_jobs_rate_limit
  before insert on public.scan_jobs
  for each row execute function public.scan_jobs_rate_limit();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.collection_items enable row level security;
alter table public.wishlist_items   enable row level security;
alter table public.scan_jobs        enable row level security;
alter table public.scanner_status   enable row level security;

-- Collection : CRUD limité au propriétaire
drop policy if exists "collection_select_own" on public.collection_items;
create policy "collection_select_own" on public.collection_items
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "collection_insert_own" on public.collection_items;
create policy "collection_insert_own" on public.collection_items
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "collection_update_own" on public.collection_items;
create policy "collection_update_own" on public.collection_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "collection_delete_own" on public.collection_items;
create policy "collection_delete_own" on public.collection_items
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Envies : CRUD limité au propriétaire
drop policy if exists "wishlist_select_own" on public.wishlist_items;
create policy "wishlist_select_own" on public.wishlist_items
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "wishlist_insert_own" on public.wishlist_items;
create policy "wishlist_insert_own" on public.wishlist_items
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "wishlist_update_own" on public.wishlist_items;
create policy "wishlist_update_own" on public.wishlist_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "wishlist_delete_own" on public.wishlist_items;
create policy "wishlist_delete_own" on public.wishlist_items
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Scans : chacun dépose / lit / supprime ses propres demandes.
-- Seul le scanner du PC (clé secrète, côté serveur) peut écrire les résultats.
drop policy if exists "scan_jobs_select_own" on public.scan_jobs;
create policy "scan_jobs_select_own" on public.scan_jobs
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "scan_jobs_insert_own" on public.scan_jobs;
create policy "scan_jobs_insert_own" on public.scan_jobs
  for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending' and result is null and error is null);

drop policy if exists "scan_jobs_delete_own" on public.scan_jobs;
create policy "scan_jobs_delete_own" on public.scan_jobs
  for delete to authenticated using ((select auth.uid()) = user_id);

-- État du scanner : lisible par les utilisateurs connectés, écrit uniquement par le PC
drop policy if exists "scanner_status_read" on public.scanner_status;
create policy "scanner_status_read" on public.scanner_status
  for select to authenticated using (true);

-- Les rôles anonymes n'ont aucun accès
revoke all on public.collection_items from anon;
revoke all on public.wishlist_items   from anon;
revoke all on public.scan_jobs        from anon;
revoke all on public.scanner_status   from anon;
grant select, insert, update, delete on public.collection_items to authenticated;
grant select, insert, update, delete on public.wishlist_items   to authenticated;
grant select, insert, delete on public.scan_jobs to authenticated;
grant select on public.scanner_status to authenticated;
-- Le scanner du PC (clé secrète = rôle service_role) traite la file et publie son état
grant select, insert, update, delete on public.scan_jobs      to service_role;
grant select, insert, update, delete on public.scanner_status to service_role;
revoke all on function public.scan_jobs_rate_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- updated_at automatique
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists collection_items_touch on public.collection_items;
create trigger collection_items_touch
  before update on public.collection_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Ajout / retrait atomique d'exemplaires (évite les conflits lors de clics rapides)
-- SECURITY INVOKER : la fonction s'exécute avec les droits (et le RLS) de l'appelant.
-- ---------------------------------------------------------------------
create or replace function public.adjust_card_quantity(
  p_card_id       text,
  p_set_id        text,
  p_lang          text,
  p_variant       text,
  p_delta         integer,
  p_card_name     text,
  p_card_local_id text default null,
  p_card_image    text default null,
  p_rarity        text default null,
  p_dex_ids       integer[] default '{}'
)
returns setof public.collection_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.collection_items;
begin
  if v_uid is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 999 then
    raise exception 'Delta invalide' using errcode = '22023';
  end if;

  if p_delta > 0 then
    insert into public.collection_items as ci
      (user_id, card_id, set_id, lang, variant, quantity, card_name, card_local_id, card_image, rarity, dex_ids)
    values
      (v_uid, p_card_id, p_set_id, p_lang, p_variant, least(p_delta, 9999), p_card_name, p_card_local_id, p_card_image, p_rarity, coalesce(p_dex_ids, '{}'))
    on conflict (user_id, card_id, lang, variant) do update
      set quantity      = least(ci.quantity + excluded.quantity, 9999),
          card_name     = excluded.card_name,
          card_local_id = coalesce(excluded.card_local_id, ci.card_local_id),
          card_image    = coalesce(excluded.card_image, ci.card_image),
          rarity        = coalesce(excluded.rarity, ci.rarity),
          dex_ids       = case when cardinality(excluded.dex_ids) > 0 then excluded.dex_ids else ci.dex_ids end
    returning * into v_row;
    return next v_row;
    return;
  end if;

  -- delta négatif : décrément, puis suppression si la quantité tombe à 0
  update public.collection_items as ci
     set quantity = ci.quantity + p_delta
   where ci.user_id = v_uid and ci.card_id = p_card_id and ci.lang = p_lang and ci.variant = p_variant
     and ci.quantity + p_delta > 0
  returning * into v_row;

  if found then
    return next v_row;
    return;
  end if;

  delete from public.collection_items as ci
   where ci.user_id = v_uid and ci.card_id = p_card_id and ci.lang = p_lang and ci.variant = p_variant;
  return;
end;
$$;

revoke all on function public.adjust_card_quantity(text, text, text, text, integer, text, text, text, text, integer[]) from public, anon;
grant execute on function public.adjust_card_quantity(text, text, text, text, integer, text, text, text, text, integer[]) to authenticated;
