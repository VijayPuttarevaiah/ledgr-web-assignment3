-- This Supabase CLI version defaults new tables to NOT auto-exposed via
-- PostgREST (matching the current cloud default — see the commented
-- `auto_expose_new_tables` note in supabase/config.toml), so every table
-- needs an explicit GRANT before RLS even gets a chance to run. RLS (§5)
-- remains the real per-row security boundary; these GRANTs only control
-- table-level visibility to PostgREST, which is the standard, safe
-- Supabase pattern (broad GRANT + restrictive RLS).
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
