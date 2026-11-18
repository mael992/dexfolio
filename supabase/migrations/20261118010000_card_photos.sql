-- =====================================================================
-- Dexfolio — photos personnelles des cartes (sans image officielle)
-- Espace de stockage PRIVÉ : chaque utilisateur ne voit que son dossier
-- « <son id>/<id de carte>.jpg ». 2 Mo max par photo.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-photos', 'card-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "card_photos_select_own" on storage.objects;
create policy "card_photos_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "card_photos_insert_own" on storage.objects;
create policy "card_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'card-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "card_photos_update_own" on storage.objects;
create policy "card_photos_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'card-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "card_photos_delete_own" on storage.objects;
create policy "card_photos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
