-- Read-only audit. Expected result: zero rows, after all Prisma migrations
-- and the security baseline. Any row is a release blocker, not patient data.
WITH client_roles AS (
  SELECT oid, rolname, rolsuper, rolbypassrls
  FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
), public_relations AS (
  SELECT c.* FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
), expected_tables(name) AS (
  VALUES ('profiles'), ('auth_accounts'), ('email_verifications'),
    ('patients'), ('ai_analyses'), ('appointments'), ('knee_data_records'),
    ('nursing_records'), ('alert_logs'), ('devices'), ('device_bindings'),
    ('sensor_sessions'), ('sensor_samples'), ('calibration_records'),
    ('patient_invitations'), ('patient_access_audits'), ('gateway_credentials')
)
SELECT 'missing_client_role' AS issue, name::text AS object_name
FROM (VALUES ('anon'), ('authenticated')) roles(name)
WHERE NOT EXISTS (SELECT 1 FROM client_roles r WHERE r.rolname = roles.name)
UNION ALL
SELECT 'client_schema_or_privileged_role', rolname::text FROM client_roles
WHERE rolsuper OR rolbypassrls
  OR has_schema_privilege(oid, 'public', 'USAGE')
  OR has_schema_privilege(oid, 'public', 'CREATE')
UNION ALL
SELECT 'client_relation_privilege', r.rolname || ':' || c.relname
FROM client_roles r CROSS JOIN public_relations c
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND (has_table_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
UNION ALL
SELECT 'client_sequence_privilege', r.rolname || ':' || c.relname
FROM client_roles r CROSS JOIN public_relations c
WHERE c.relkind = 'S' AND has_sequence_privilege(r.oid, c.oid, 'USAGE,SELECT,UPDATE')
UNION ALL
SELECT 'client_routine_privilege', r.rolname || ':' || p.oid::regprocedure::text
FROM client_roles r CROSS JOIN pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
UNION ALL
SELECT 'rls_disabled', relname::text FROM public_relations
WHERE relkind IN ('r', 'p') AND NOT relrowsecurity
UNION ALL
SELECT 'remaining_policy', c.relname || ':' || p.polname
FROM pg_policy p JOIN public_relations c ON c.oid = p.polrelid
UNION ALL
SELECT 'realtime_public_table', tablename::text FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
UNION ALL
SELECT 'realtime_all_tables', pubname::text FROM pg_publication
WHERE pubname = 'supabase_realtime' AND puballtables
UNION ALL
SELECT 'missing_application_table', name FROM expected_tables e
WHERE NOT EXISTS (SELECT 1 FROM public_relations c
                  WHERE c.relname = e.name AND c.relkind IN ('r', 'p'))
ORDER BY issue, object_name;
