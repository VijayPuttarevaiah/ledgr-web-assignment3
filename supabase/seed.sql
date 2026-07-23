-- System default categories, visible to every user (user_id is null).
-- Runs after migrations on `supabase db reset`. Demo user accounts and
-- sample transactions are seeded separately via `npm run seed` (see
-- scripts/seed-demo-data.ts) because they must go through Supabase Auth,
-- not raw SQL.

insert into public.categories (name, color, icon, is_system) values
  ('Groceries',     '#c98a3a', 'ShoppingCart',  true),
  ('Dining',        '#ef6461', 'UtensilsCrossed', true),
  ('Transport',     '#5aa7e8', 'Bus',           true),
  ('Housing',       '#e0b84c', 'Home',          true),
  ('Entertainment', '#8a7cf0', 'Clapperboard',  true),
  ('Health',        '#e88ac9', 'HeartPulse',    true),
  ('Education',     '#7ec98a', 'GraduationCap', true),
  ('Income',        '#2fd1a8', 'Wallet',        true),
  ('Other',         '#9a9aa4', 'Tag',           true)
on conflict do nothing;
