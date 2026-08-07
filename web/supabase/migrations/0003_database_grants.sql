-- Server routes use the Supabase Secret key, which assumes the service_role
-- database role. Tables created through the SQL editor do not always inherit
-- the API grants that Dashboard-created tables receive.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- The existing RLS policies are intended to allow signed-in users to read
-- their own rows and submit review attempts.
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant update on public.profiles to authenticated;
grant insert on public.review_attempts to authenticated;

-- Preserve the same grants for tables and sequences created by later
-- migrations owned by postgres.
alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to service_role;
alter default privileges for role postgres in schema public
  grant select on tables to authenticated;
