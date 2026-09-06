-- Backend-only security baseline and cleanup for legacy allow-all policies.
-- Run as the database owner after Prisma migrations. See docs/SUPABASE_SECURITY.md.
-- This project reserves the entire public schema for trusted server access.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Schema denial also protects future tables, views and RPCs, irrespective of
-- the object creator's default grants. Do not restore client schema USAGE.
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Defaults apply only to the executing migration role. Schema denial above
-- remains the boundary for objects created by other roles as well.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;

DO $security$
DECLARE
  relation record;
  legacy_policy record;
  client_role text;
BEGIN
  -- Catalog-driven coverage includes all Prisma tables, _prisma_migrations,
  -- gateway_credentials (including token_hash), and any later public tables.
  FOR relation IN
    SELECT c.oid, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation.relname);
    -- Remove policies by catalog identity, including renamed/custom policies.
    FOR legacy_policy IN SELECT polname FROM pg_policy WHERE polrelid = relation.oid
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', legacy_policy.polname, relation.relname);
    END LOOP;
  END LOOP;

  -- RLS alone is insufficient for Realtime DELETE events. Stop publishing
  -- public rows entirely; the browser already polls authenticated server APIs.
  FOR relation IN
    SELECT c.relname
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public'
  LOOP
    EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', relation.relname);
  END LOOP;

  -- ALL TABLES / schema-wide publications need explicit operator review.
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime' AND puballtables)
    OR EXISTS (SELECT 1 FROM pg_publication_tables
               WHERE pubname = 'supabase_realtime' AND schemaname = 'public') THEN
    RAISE EXCEPTION 'public is still published; narrow supabase_realtime and rerun the security baseline';
  END IF;

  -- Detect inherited grants and insufficient REVOKE authority before committing.
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_schema_privilege(client_role, 'public', 'USAGE')
      OR has_schema_privilege(client_role, 'public', 'CREATE')
      OR EXISTS (SELECT 1 FROM pg_roles
                 WHERE rolname = client_role AND (rolsuper OR rolbypassrls)) THEN
      RAISE EXCEPTION 'Client role % still has privileged access; review role memberships/grantors', client_role;
    END IF;
    FOR relation IN
      SELECT c.oid, c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    LOOP
      IF has_table_privilege(client_role, relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(client_role, relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'Client role % retains privileges on public.%', client_role, relation.relname;
      END IF;
    END LOOP;
  END LOOP;
END
$security$;

-- No FORCE RLS: the trusted Prisma table owner must retain backend access.
-- No changes to auth/storage schemas or service_role's explicit grants.
COMMIT;
