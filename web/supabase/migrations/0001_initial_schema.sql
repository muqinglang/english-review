create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Shanghai',
  state_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worker_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  token_hash text not null unique,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'chatgpt',
  project_ref text not null,
  display_name text not null,
  cursor jsonb not null default '{}'::jsonb,
  last_successful_sync_at timestamptz,
  unique (user_id, provider, project_ref)
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  cursor_in jsonb not null default '{}'::jsonb,
  cursor_out jsonb not null default '{}'::jsonb,
  received_count integer not null default 0,
  error_summary text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.source_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  external_id text not null,
  title text,
  updated_at timestamptz,
  unique (source_id, external_id)
);

create table public.source_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_chat_id uuid not null references public.source_chats(id) on delete cascade,
  external_id text not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  original_text text not null,
  occurred_at timestamptz,
  source_updated_at timestamptz not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (source_chat_id, external_id, source_updated_at)
);

create table public.learning_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  normalized_key text not null,
  type text not null check (type in ('vocabulary', 'expression', 'error', 'pronunciation')),
  cue text not null,
  answer text not null,
  example text,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'learning' check (status in ('learning', 'reviewing', 'mastered', 'pending_confirmation')),
  occurrences integer not null default 1 check (occurrences > 0),
  attempts integer not null default 0 check (attempts >= 0),
  correct integer not null default 0 check (correct >= 0 and correct <= attempts),
  next_due date not null,
  last_shown date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_key)
);

create table public.item_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  learning_item_id uuid not null references public.learning_items(id) on delete cascade,
  source_message_id uuid not null references public.source_messages(id) on delete cascade,
  original_sentence text not null,
  evidence_kind text not null,
  created_at timestamptz not null default now(),
  unique (learning_item_id, source_message_id, evidence_kind)
);

create table public.pending_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_message_id uuid references public.source_messages(id) on delete set null,
  raw_text text not null,
  suggested_interpretation text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed')),
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  review_date date not null,
  status text not null default 'ready' check (status in ('draft', 'ready', 'archived')),
  content_json jsonb not null,
  audio_script_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, review_date)
);

create table public.review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  review_id uuid not null references public.reviews(id) on delete cascade,
  learning_item_id uuid not null references public.learning_items(id) on delete restrict,
  position smallint not null check (position > 0),
  shown_at timestamptz,
  unique (review_id, position),
  unique (review_id, learning_item_id)
);

create table public.review_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  review_item_id uuid not null references public.review_items(id) on delete cascade,
  submitted_text text not null,
  status text not null default 'pending' check (status in ('pending', 'graded')),
  result text check (result in ('correct', 'incorrect', 'partial')),
  feedback_json jsonb,
  answered_at timestamptz not null default now(),
  graded_at timestamptz
);

create index source_messages_user_updated_idx on public.source_messages (user_id, source_updated_at desc);
create index learning_items_due_idx on public.learning_items (user_id, next_due);
create index review_attempts_pending_idx on public.review_attempts (user_id, status, answered_at);

alter table public.profiles enable row level security;
alter table public.worker_devices enable row level security;
alter table public.sources enable row level security;
alter table public.sync_runs enable row level security;
alter table public.source_chats enable row level security;
alter table public.source_messages enable row level security;
alter table public.learning_items enable row level security;
alter table public.item_evidence enable row level security;
alter table public.pending_confirmations enable row level security;
alter table public.reviews enable row level security;
alter table public.review_items enable row level security;
alter table public.review_attempts enable row level security;

create policy "users read own profile" on public.profiles for select using (id = auth.uid());
create policy "users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "users read own data" on public.worker_devices for select using (user_id = auth.uid());
create policy "users read own data" on public.sources for select using (user_id = auth.uid());
create policy "users read own data" on public.sync_runs for select using (user_id = auth.uid());
create policy "users read own data" on public.source_chats for select using (user_id = auth.uid());
create policy "users read own data" on public.source_messages for select using (user_id = auth.uid());
create policy "users read own data" on public.learning_items for select using (user_id = auth.uid());
create policy "users read own data" on public.item_evidence for select using (user_id = auth.uid());
create policy "users read own data" on public.pending_confirmations for select using (user_id = auth.uid());
create policy "users read own data" on public.reviews for select using (user_id = auth.uid());
create policy "users read own data" on public.review_items for select using (user_id = auth.uid());
create policy "users read own data" on public.review_attempts for select using (user_id = auth.uid());

create policy "users submit own attempts" on public.review_attempts for insert with check (user_id = auth.uid());
