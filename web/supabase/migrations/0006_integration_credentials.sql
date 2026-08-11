create table public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 80),
  encrypted_secret text not null,
  key_suffix text not null check (char_length(key_suffix) between 1 and 12),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.integration_credentials enable row level security;

-- Integration secrets are only accessed by server routes using the Secret key.
-- Migration 0003 grants read access to future tables by default, so revoke it
-- explicitly and deliberately leave this table without authenticated policies.
revoke all privileges on table public.integration_credentials from public;
revoke all privileges on table public.integration_credentials from anon;
revoke all privileges on table public.integration_credentials from authenticated;
grant all privileges on table public.integration_credentials to service_role;

create table public.tts_usage_daily (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  character_count integer not null default 0 check (character_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.tts_usage_daily enable row level security;

revoke all privileges on table public.tts_usage_daily from public;
revoke all privileges on table public.tts_usage_daily from anon;
revoke all privileges on table public.tts_usage_daily from authenticated;
grant all privileges on table public.tts_usage_daily to service_role;

-- Atomically reserve one synthesis request. The conditional ON CONFLICT update
-- takes a row lock, so parallel requests cannot pass the limits independently.
create or replace function public.reserve_tts_usage(
  p_user_id uuid,
  p_characters integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max_requests constant integer := 100;
  v_max_characters constant integer := 20000;
  v_usage_date date := timezone('Asia/Shanghai', clock_timestamp())::date;
  v_reserved boolean;
begin
  if p_user_id is null
    or p_characters is null
    or p_characters <= 0 then
    raise exception using errcode = '22023', message = 'invalid TTS usage reservation';
  end if;

  if p_characters > v_max_characters then
    return false;
  end if;

  insert into public.tts_usage_daily as usage (
    user_id,
    usage_date,
    request_count,
    character_count
  )
  values (p_user_id, v_usage_date, 1, p_characters)
  on conflict (user_id, usage_date) do update
  set
    request_count = usage.request_count + 1,
    character_count = usage.character_count + excluded.character_count,
    updated_at = clock_timestamp()
  where usage.request_count < v_max_requests
    and usage.character_count + excluded.character_count <= v_max_characters
  returning true into v_reserved;

  return coalesce(v_reserved, false);
end;
$$;

-- PostgreSQL grants function execution to PUBLIC by default. Keep this RPC
-- callable only through the server's service-role client.
revoke all privileges on function public.reserve_tts_usage(uuid, integer) from public;
revoke all privileges on function public.reserve_tts_usage(uuid, integer) from anon;
revoke all privileges on function public.reserve_tts_usage(uuid, integer) from authenticated;
grant execute on function public.reserve_tts_usage(uuid, integer) to service_role;
