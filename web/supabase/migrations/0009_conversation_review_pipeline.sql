-- Conversation practice is intentionally kept separate from the long-term SRS
-- queue. A learner's first self-grade promotes the same normalized key into
-- learning_items and applies the normal 1 / 3 / 7-day rule.

alter table public.learning_items
  drop constraint if exists learning_items_type_check;

alter table public.learning_items
  add constraint learning_items_type_check
    check (type in ('fact', 'concept', 'decision', 'quote', 'vocabulary', 'expression', 'grammar', 'error', 'pronunciation'));

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  knowledge_space_id uuid not null references public.knowledge_spaces(id) on delete cascade,
  source text not null check (source in ('chatgpt_chrome')),
  practice_date date not null,
  payload_hash text not null,
  item_count integer not null check (item_count between 1 and 20),
  synced_at timestamptz not null default now(),
  unique (user_id, source, payload_hash)
);

create table public.practice_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  practice_session_id uuid not null references public.practice_sessions(id) on delete cascade,
  normalized_key text not null,
  type text not null check (type in ('vocabulary', 'expression', 'grammar', 'error', 'pronunciation')),
  cue text not null,
  answer text not null,
  example text,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  occurrences integer not null default 1 check (occurrences > 0),
  enrichment_status text not null default 'pending' check (enrichment_status in ('pending', 'ready', 'failed')),
  enrichment_json jsonb,
  enrichment_version text,
  audio_status text not null default 'pending' check (audio_status in ('pending', 'ready', 'failed')),
  normal_audio_path text,
  slow_audio_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_session_id, normalized_key)
);

create table public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  practice_item_id uuid not null references public.practice_items(id) on delete cascade,
  request_id uuid not null,
  result text not null check (result in ('correct', 'incorrect', 'partial')),
  submitted_text text not null default '',
  answered_at timestamptz not null default now(),
  unique (user_id, request_id),
  unique (practice_item_id)
);

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  practice_item_id uuid references public.practice_items(id) on delete cascade,
  kind text not null check (kind in ('enrichment', 'tts_audio')),
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  error_summary text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (practice_item_id, kind)
);

create index practice_sessions_user_date_idx on public.practice_sessions (user_id, practice_date desc);
create index practice_items_user_session_idx on public.practice_items (user_id, practice_session_id);
create index generation_jobs_pending_idx on public.generation_jobs (status, created_at) where status = 'pending';

alter table public.practice_sessions enable row level security;
alter table public.practice_items enable row level security;
alter table public.practice_attempts enable row level security;
alter table public.generation_jobs enable row level security;

create policy "users read own practice sessions" on public.practice_sessions for select using (user_id = auth.uid());
create policy "users read own practice items" on public.practice_items for select using (user_id = auth.uid());
create policy "users read own practice attempts" on public.practice_attempts for select using (user_id = auth.uid());
create policy "users read own generation jobs" on public.generation_jobs for select using (user_id = auth.uid());

create or replace function public.record_practice_attempt(
  p_user_id uuid,
  p_practice_item_id uuid,
  p_request_id uuid,
  p_result text,
  p_submitted_text text default ''
)
returns table (
  practice_attempt_id uuid,
  learning_item_id uuid,
  result text,
  next_due date,
  review_stage smallint,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.practice_items%rowtype;
  v_space_id uuid;
  v_learning public.learning_items%rowtype;
  v_attempt public.practice_attempts%rowtype;
  v_today date := (clock_timestamp() at time zone 'Asia/Shanghai')::date;
  v_now timestamptz := clock_timestamp();
  v_stage smallint;
  v_due date;
begin
  if p_user_id is null or p_practice_item_id is null or p_request_id is null
     or p_result not in ('correct', 'incorrect', 'partial')
     or length(coalesce(p_submitted_text, '')) > 10000 then
    raise exception 'practice attempt is invalid' using errcode = '22023';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'cannot record another user''s practice attempt' using errcode = '42501';
  end if;

  select pa.* into v_attempt from public.practice_attempts pa
  where pa.user_id = p_user_id and pa.request_id = p_request_id;
  if found then
    if v_attempt.practice_item_id <> p_practice_item_id or v_attempt.result <> p_result then
      raise exception 'request id was already used' using errcode = '23505';
    end if;
    select li.* into v_learning from public.learning_items li
    join public.practice_items pi on pi.normalized_key = li.normalized_key and pi.user_id = li.user_id
    where pi.id = p_practice_item_id and li.user_id = p_user_id;
    return query select v_attempt.id, v_learning.id, v_attempt.result, v_learning.next_due, v_learning.review_stage, true;
    return;
  end if;

  select pi.* into v_item
  from public.practice_items pi
  where pi.id = p_practice_item_id and pi.user_id = p_user_id
  for update;
  if not found then raise exception 'practice item not found' using errcode = '42501'; end if;

  select ps.knowledge_space_id into v_space_id
  from public.practice_sessions ps
  where ps.id = v_item.practice_session_id
  for update;
  if not found then raise exception 'practice session not found' using errcode = '42501'; end if;

  select li.* into v_learning from public.learning_items li
  where li.user_id = p_user_id and li.normalized_key = v_item.normalized_key for update;

  if p_result = 'incorrect' then v_stage := 0; v_due := v_today + 1;
  elsif p_result = 'partial' then v_stage := 0; v_due := v_today + 3;
  else v_stage := 1; v_due := v_today + 7;
  end if;

  if not found then
    insert into public.learning_items (user_id, knowledge_space_id, normalized_key, type, cue, answer, example, priority, occurrences, attempts, correct, next_due, learned_on, review_stage, correct_streak, last_result, last_answered_at, status)
    values (p_user_id, v_space_id, v_item.normalized_key, v_item.type, v_item.cue, v_item.answer, v_item.example, v_item.priority, v_item.occurrences, 1, case when p_result = 'correct' then 1 else 0 end, v_due, v_today, v_stage, case when p_result = 'correct' then 1 else 0 end, p_result, v_now, case when p_result = 'correct' then 'reviewing' else 'learning' end)
    returning * into v_learning;
  else
    update public.learning_items set attempts = attempts + 1, correct = correct + case when p_result = 'correct' then 1 else 0 end, review_stage = v_stage, correct_streak = case when p_result = 'correct' then correct_streak + 1 else 0 end, last_result = p_result, last_answered_at = v_now, next_due = v_due, status = case when p_result = 'correct' then 'reviewing' else 'learning' end, updated_at = v_now
    where id = v_learning.id returning * into v_learning;
  end if;

  insert into public.practice_attempts (user_id, practice_item_id, request_id, result, submitted_text, answered_at)
  values (p_user_id, p_practice_item_id, p_request_id, p_result, coalesce(p_submitted_text, ''), v_now)
  returning * into v_attempt;
  return query select v_attempt.id, v_learning.id, v_attempt.result, v_learning.next_due, v_learning.review_stage, false;
end;
$$;

revoke all on function public.record_practice_attempt(uuid, uuid, uuid, text, text) from public;
grant execute on function public.record_practice_attempt(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.record_practice_attempt(uuid, uuid, uuid, text, text) to service_role;
