alter table public.learning_items
  add column review_stage smallint not null default 0,
  add column correct_streak integer not null default 0,
  add column last_result text,
  add column last_answered_at timestamptz;

alter table public.learning_items
  add constraint learning_items_review_stage_check
    check (review_stage between 0 and 3),
  add constraint learning_items_correct_streak_check
    check (correct_streak >= 0),
  add constraint learning_items_last_result_check
    check (last_result is null or last_result in ('correct', 'incorrect', 'partial'));

alter table public.review_attempts
  add column request_id uuid;

create unique index review_attempts_user_request_id_idx
  on public.review_attempts (user_id, request_id)
  where request_id is not null;

create unique index review_attempts_review_item_graded_idx
  on public.review_attempts (review_item_id)
  where status = 'graded';

-- Attempts must go through the scheduling RPC. Direct inserts could otherwise
-- claim the idempotency key without applying the matching learning-item update.
drop policy if exists "users submit own attempts" on public.review_attempts;
revoke insert on public.review_attempts from authenticated;

create or replace function public.record_review_attempt(
  p_user_id uuid,
  p_review_item_id uuid,
  p_request_id uuid,
  p_result text,
  p_submitted_text text default ''
)
returns table (
  attempt_id uuid,
  learning_item_id uuid,
  request_id uuid,
  result text,
  review_stage smallint,
  correct_streak integer,
  next_due date,
  item_status text,
  answered_at timestamptz,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_review_id uuid;
  v_learning_item_id uuid;
  v_current_stage smallint;
  v_last_answered_at timestamptz;
  v_card_shown_at timestamptz;
  v_new_stage smallint;
  v_correct_streak integer;
  v_next_due date;
  v_status text;
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() at time zone 'Asia/Shanghai')::date;
  v_attempt public.review_attempts%rowtype;
begin
  if p_user_id is null or p_review_item_id is null or p_request_id is null then
    raise exception 'user_id, review_item_id, and request_id are required'
      using errcode = '22023';
  end if;

  if p_result is null or p_result not in ('correct', 'incorrect', 'partial') then
    raise exception 'invalid self-grade result'
      using errcode = '22023';
  end if;

  if length(coalesce(p_submitted_text, '')) > 10000 then
    raise exception 'submitted_text is too long'
      using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_user_id then
    raise exception 'cannot record an attempt for another user'
      using errcode = '42501';
  end if;

  -- Serialize grading with a concurrent daily-review replacement. The save
  -- RPC locks the same review row before changing content or mappings.
  select r.id
    into v_review_id
  from public.review_items as ri
  join public.reviews as r on r.id = ri.review_id
  where ri.id = p_review_item_id
    and ri.user_id = p_user_id
    and r.user_id = p_user_id
  for update of r;

  if not found then
    raise exception 'review item does not belong to the user'
      using errcode = '42501';
  end if;

  select li.id, li.review_stage, li.last_answered_at, ri.shown_at
    into v_learning_item_id, v_current_stage, v_last_answered_at, v_card_shown_at
  from public.review_items as ri
  join public.reviews as r on r.id = ri.review_id
  join public.learning_items as li on li.id = ri.learning_item_id
  where ri.id = p_review_item_id
    and ri.user_id = p_user_id
    and r.id = v_review_id
    and r.user_id = p_user_id
    and li.user_id = p_user_id
  for update of r, li;

  if not found then
    raise exception 'review item does not belong to the user'
      using errcode = '42501';
  end if;

  select ra.*
    into v_attempt
  from public.review_attempts as ra
  where ra.user_id = p_user_id
    and ra.request_id = p_request_id;

  if found then
    if v_attempt.review_item_id <> p_review_item_id
       or v_attempt.result is distinct from p_result
       or v_attempt.submitted_text is distinct from coalesce(p_submitted_text, '') then
      raise exception 'request_id was already used for a different attempt'
        using errcode = '23505';
    end if;

    return query
    select
      v_attempt.id,
      li.id,
      v_attempt.request_id,
      v_attempt.result,
      li.review_stage,
      li.correct_streak,
      li.next_due,
      li.status,
      v_attempt.answered_at,
      true
    from public.learning_items as li
    where li.id = v_learning_item_id;
    return;
  end if;

  -- A client may retry with a fresh request_id after losing the first HTTP
  -- response. The review item itself is therefore also an idempotency boundary:
  -- one generated question can advance (or reset) the schedule only once.
  select ra.*
    into v_attempt
  from public.review_attempts as ra
  where ra.review_item_id = p_review_item_id
    and ra.user_id = p_user_id
    and ra.status = 'graded'
  order by ra.answered_at, ra.id
  limit 1;

  if found then
    return query
    select
      v_attempt.id,
      li.id,
      v_attempt.request_id,
      v_attempt.result,
      li.review_stage,
      li.correct_streak,
      li.next_due,
      li.status,
      v_attempt.answered_at,
      true
    from public.learning_items as li
    where li.id = v_learning_item_id;
    return;
  end if;

  -- A learning item can occur in more than one review. Once a newer card has
  -- already graded it, an older card must not advance the shared schedule a
  -- second time. This check deliberately follows both idempotency returns so
  -- retrying the attempt that performed the update remains successful.
  if v_last_answered_at is not null
     and (v_card_shown_at is null or v_last_answered_at >= v_card_shown_at) then
    raise exception 'learning item was already graded from a newer review card'
      using errcode = '55000';
  end if;

  if p_result = 'incorrect' then
    v_new_stage := 0;
    v_correct_streak := 0;
    v_next_due := v_today + 1;
    v_status := 'learning';
  elsif p_result = 'partial' then
    v_new_stage := greatest(v_current_stage - 1, 0)::smallint;
    v_correct_streak := 0;
    v_next_due := v_today + 3;
    v_status := case when v_new_stage = 0 then 'learning' else 'reviewing' end;
  else
    v_new_stage := least(v_current_stage + 1, 3)::smallint;
    select li.correct_streak + 1
      into v_correct_streak
    from public.learning_items as li
    where li.id = v_learning_item_id;
    v_next_due := v_today + case
      when v_current_stage = 0 then 7
      when v_current_stage = 1 then 30
      else 90
    end;
    v_status := case when v_new_stage = 3 then 'mastered' else 'reviewing' end;
  end if;

  insert into public.review_attempts (
    user_id,
    review_item_id,
    request_id,
    submitted_text,
    status,
    result,
    feedback_json,
    answered_at,
    graded_at
  ) values (
    p_user_id,
    p_review_item_id,
    p_request_id,
    coalesce(p_submitted_text, ''),
    'graded',
    p_result,
    jsonb_build_object('kind', 'self_grade'),
    v_now,
    v_now
  )
  returning * into v_attempt;

  update public.learning_items
  set attempts = attempts + 1,
      correct = correct + case when p_result = 'correct' then 1 else 0 end,
      review_stage = v_new_stage,
      correct_streak = v_correct_streak,
      last_result = p_result,
      last_answered_at = v_now,
      next_due = v_next_due,
      status = v_status,
      updated_at = v_now
  where id = v_learning_item_id;

  update public.profiles
  set state_version = state_version + 1,
      updated_at = v_now
  where id = p_user_id;

  return query
  select
    v_attempt.id,
    li.id,
    v_attempt.request_id,
    v_attempt.result,
    li.review_stage,
    li.correct_streak,
    li.next_due,
    li.status,
    v_attempt.answered_at,
    false
  from public.learning_items as li
  where li.id = v_learning_item_id;
end;
$$;

revoke all on function public.record_review_attempt(uuid, uuid, uuid, text, text) from public;
grant execute on function public.record_review_attempt(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.record_review_attempt(uuid, uuid, uuid, text, text) to service_role;

create or replace function public.replace_review_items(
  p_user_id uuid,
  p_review_id uuid,
  p_learning_item_ids uuid[],
  p_review_date date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_space_id uuid;
  v_existing_ids uuid[];
  v_item_count integer;
  v_distinct_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_user_id is null or p_review_id is null or p_review_date is null
     or coalesce(cardinality(p_learning_item_ids), 0) = 0 then
    raise exception 'review mapping parameters must be non-empty'
      using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_user_id then
    raise exception 'cannot replace another user''s review items'
      using errcode = '42501';
  end if;

  select count(*), count(distinct item_id)
    into v_item_count, v_distinct_count
  from unnest(p_learning_item_ids) as requested(item_id);

  if v_item_count <> v_distinct_count then
    raise exception 'review learning item ids must be unique'
      using errcode = '22023';
  end if;

  select r.knowledge_space_id
    into v_space_id
  from public.reviews as r
  where r.id = p_review_id
    and r.user_id = p_user_id
    and r.review_date = p_review_date
  for update;

  if not found then
    raise exception 'review does not belong to the user'
      using errcode = '42501';
  end if;

  select count(*)
    into v_item_count
  from public.learning_items as li
  where li.id = any(p_learning_item_ids)
    and li.user_id = p_user_id
    and li.knowledge_space_id is not distinct from v_space_id;

  if v_item_count <> cardinality(p_learning_item_ids) then
    raise exception 'all review items must belong to the review knowledge space'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(ri.learning_item_id order by ri.position), '{}'::uuid[])
    into v_existing_ids
  from public.review_items as ri
  where ri.review_id = p_review_id
    and ri.user_id = p_user_id;

  if v_existing_ids is distinct from p_learning_item_ids then
    if exists (
      select 1
      from public.review_attempts as ra
      join public.review_items as ri on ri.id = ra.review_item_id
      where ri.review_id = p_review_id
        and ri.user_id = p_user_id
    ) then
      raise exception 'cannot change review items after an answer was recorded'
        using errcode = '55000';
    end if;

    delete from public.review_items
    where review_id = p_review_id
      and user_id = p_user_id;

    insert into public.review_items (
      user_id,
      review_id,
      learning_item_id,
      position,
      shown_at
    )
    select
      p_user_id,
      p_review_id,
      requested.item_id,
      requested.position::smallint,
      v_now
    from unnest(p_learning_item_ids) with ordinality as requested(item_id, position);
  else
    update public.review_items
    set shown_at = coalesce(shown_at, v_now)
    where review_id = p_review_id
      and user_id = p_user_id;
  end if;

  update public.learning_items
  -- Display is not a scheduling event. next_due remains at or before today for
  -- an unanswered card, so it returns every following day until self-graded.
  set last_shown = greatest(coalesce(last_shown, p_review_date), p_review_date),
      updated_at = v_now
  where id = any(p_learning_item_ids)
    and user_id = p_user_id;
end;
$$;

revoke all on function public.replace_review_items(uuid, uuid, uuid[], date) from public;
grant execute on function public.replace_review_items(uuid, uuid, uuid[], date) to service_role;

create or replace function public.save_daily_review(
  p_user_id uuid,
  p_knowledge_space_id uuid,
  p_review_date date,
  p_content_json jsonb,
  p_audio_script_json jsonb,
  p_learning_item_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_review_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'save_daily_review is restricted to the service role'
      using errcode = '42501';
  end if;

  if p_user_id is null or p_knowledge_space_id is null or p_review_date is null
     or p_content_json is null or jsonb_typeof(p_content_json) <> 'object'
     or p_audio_script_json is null or jsonb_typeof(p_audio_script_json) <> 'object'
     or coalesce(cardinality(p_learning_item_ids), 0) = 0 then
    raise exception 'daily review parameters are invalid'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.knowledge_spaces as ks
    where ks.id = p_knowledge_space_id
      and ks.user_id = p_user_id
  ) then
    raise exception 'knowledge space does not belong to the user'
      using errcode = '42501';
  end if;

  insert into public.reviews (
    user_id,
    knowledge_space_id,
    review_date,
    status,
    content_json,
    audio_script_json
  ) values (
    p_user_id,
    p_knowledge_space_id,
    p_review_date,
    'ready',
    p_content_json,
    p_audio_script_json
  )
  on conflict (user_id, knowledge_space_id, review_date)
  do update set
    status = excluded.status,
    content_json = excluded.content_json,
    audio_script_json = excluded.audio_script_json
  returning id into v_review_id;

  perform public.replace_review_items(
    p_user_id,
    v_review_id,
    p_learning_item_ids,
    p_review_date
  );

  return v_review_id;
end;
$$;

revoke all on function public.save_daily_review(uuid, uuid, date, jsonb, jsonb, uuid[]) from public;
grant execute on function public.save_daily_review(uuid, uuid, date, jsonb, jsonb, uuid[]) to service_role;
