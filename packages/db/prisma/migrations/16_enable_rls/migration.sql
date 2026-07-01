-- Enable Row Level Security on every table in the public schema.
-- The application connects via Prisma as the `postgres` role, which BYPASSES RLS,
-- so this is a no-op for the app. It closes the Supabase PostgREST/anon exposure
-- (advisor: rls_disabled_in_public, sensitive_columns_exposed) with a default-deny:
-- RLS enabled + no policies => the anon/authenticated API roles get zero rows.
-- (Use ENABLE, not FORCE — FORCE would also gate the table owner and could break jobs.)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;
