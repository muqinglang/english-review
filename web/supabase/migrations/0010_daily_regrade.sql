-- Let an old review card be self-graded again on any later day. Getting a card
-- right yesterday no longer freezes its schedule: each self-grade re-runs the SRS
-- interval from the learning item's current state, and multiple grades on the same
-- Shanghai day collapse to the last one (last-wins) by reverting to that day's
-- pre-grade baseline before applying the newest result.
--
-- Previously record_review_attempt (0005) treated a review card as a one-shot:
-- a partial unique index plus two idempotency returns and a "graded from a newer
-- card" guard blocked every grade after the first. The idempotency boundary now
-- moves from (review card, forever) to (learning item, Shanghai day).

-- 1. Allow same-day earlier grades to be marked superseded, and record the
--    grading day plus the pre-grade snapshot needed to make same-day re-grades
--    idempotent (last-wins). The status check was created inline in 0001 as
--    review_attempts_status_check.
alter table public.review_attempts
  drop constraint if exists review_attempts_status_check;
alter table public.review_attempts
  add constraint review_attempts_status_check
    check (status in ('pending', 'graded', 'superseded'));

alter table public.review_attempts
  add column if not exists answered_on date,
  add column if not exists prev_state jsonb;

-- Backfill the Shanghai grading day for historical grades so a re-grade later
-- today can recognise and supersede a grade recorded earlier today.
update public.review_attempts
set answered_on = (answered_at at time zone 'Asia/Shanghai')::date
where status = 'graded'
  and answered_on is null;

-- 2. Replace the "one graded attempt per card, ever" index with one scoped to a
--    single Shanghai day, so a card can be graded once per day.
drop index if exists public.review_attempts_review_item_graded_idx;
create unique index if not exists review_attempts_review_item_day_graded_idx
  on public.review_attempts (review_item_id, answered_on)
  where status = 'graded';

-- 3. Rewrite the grading RPC around the (learning item, day) boundary.
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
  v_current_streak integer;
  v_current_attempts integer;
  v_current_correct integer;
  v_base_stage smallint;
  v_base_streak integer;
  v_base_attempts integer;
  v_base_correct integer;
  v_new_stage smallint;
  v_correct_streak integer;
  v_next_due date;
  v_status text;
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() at time zone 'Asia/Shanghai')::date;
  v_attempt public.review_attempts%rowtype;
  v_baseline jsonb;
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

  select li.id, li.review_stage, li.correct_streak, li.attempts, li.correct
    into v_learning_item_id, v_current_stage, v_current_streak, v_current_attempts, v_current_correct
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

  -- Exact retry of the same request returns the recorded attempt unchanged, so a
  -- lost HTTP response or a double tap never grades twice.
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

  -- Find the pre-grade baseline for this learning item today. If any card already
  -- graded it today, re-running the schedule must start from the state the item
  -- had before today's first grade so repeated same-day grades are last-wins, not
  -- cumulative. Grades from earlier days stay untouched: today's baseline is the
  -- item's current state, which already reflects them.
  select ra.prev_state
    into v_baseline
  from public.review_attempts as ra
  join public.review_items as ri on ri.id = ra.review_item_id
  where ri.learning_item_id = v_learning_item_id
    and ra.user_id = p_user_id
    and ra.status = 'graded'
    and ra.answered_on = v_today
  order by ra.answered_at, ra.id
  limit 1;

  if found then
    -- prev_state is missing only for a grade recorded earlier today under the old
    -- one-shot code; fall back to the current state so the migration boundary can
    -- never break the arithmetic.
    v_base_stage := coalesce((v_baseline ->> 'review_stage')::smallint, v_current_stage);
    v_base_streak := coalesce((v_baseline ->> 'correct_streak')::integer, v_current_streak);
    v_base_attempts := coalesce((v_baseline ->> 'attempts')::integer, v_current_attempts);
    v_base_correct := coalesce((v_baseline ->> 'correct')::integer, v_current_correct);

    update public.review_attempts as ra
      set status = 'superseded'
      from public.review_items as ri
      where ra.review_item_id = ri.id
        and ri.learning_item_id = v_learning_item_id
        and ra.user_id = p_user_id
        and ra.status = 'graded'
        and ra.answered_on = v_today;
  else
    v_base_stage := v_current_stage;
    v_base_streak := v_current_streak;
    v_base_attempts := v_current_attempts;
    v_base_correct := v_current_correct;
  end if;

  v_baseline := jsonb_build_object(
    'review_stage', v_base_stage,
    'correct_streak', v_base_streak,
    'attempts', v_base_attempts,
    'correct', v_base_correct
  );

  if p_result = 'incorrect' then
    v_new_stage := 0;
    v_correct_streak := 0;
    v_next_due := v_today + 1;
    v_status := 'learning';
  elsif p_result = 'partial' then
    v_new_stage := greatest(v_base_stage - 1, 0)::smallint;
    v_correct_streak := 0;
    v_next_due := v_today + 3;
    v_status := case when v_new_stage = 0 then 'learning' else 'reviewing' end;
  else
    v_new_stage := least(v_base_stage + 1, 3)::smallint;
    v_correct_streak := v_base_streak + 1;
    v_next_due := v_today + case
      when v_base_stage = 0 then 7
      when v_base_stage = 1 then 30
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
    graded_at,
    answered_on,
    prev_state
  ) values (
    p_user_id,
    p_review_item_id,
    p_request_id,
    coalesce(p_submitted_text, ''),
    'graded',
    p_result,
    jsonb_build_object('kind', 'self_grade'),
    v_now,
    v_now,
    v_today,
    v_baseline
  )
  returning * into v_attempt;

  update public.learning_items
  set attempts = v_base_attempts + 1,
      correct = v_base_correct + case when p_result = 'correct' then 1 else 0 end,
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
