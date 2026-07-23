-- Private receipts bucket (§9): no public access, ever. Objects are stored
-- under `${auth.uid()}/...`; owners can manage their own objects directly.
-- Group members viewing a receipt they didn't upload go through a Route
-- Handler that verifies group membership at the DB layer first and then
-- mints a signed URL with the service-role client — the same "explicit
-- route-handler check + elevated-privilege read" pattern used for the
-- auto-flow RPCs, not a broadening of storage RLS itself.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy receipts_select_own on storage.objects
  for select using (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy receipts_insert_own on storage.objects
  for insert with check (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy receipts_delete_own on storage.objects
  for delete using (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );
