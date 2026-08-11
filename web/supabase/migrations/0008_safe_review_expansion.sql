-- Allow a generated review to gain new cards after grading has started without
-- invalidating the review_item ids referenced by existing attempts.

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
  v_existing_count integer;
  v_max_position integer;
  v_temp_position_base integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_user_id is null or p_review_id is null or p_review_date is null
     or coalesce(cardinality(p_learning_item_ids), 0) = 0
     or cardinality(p_learning_item_ids) > 32767 then
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

  -- record_review_attempt takes this same lock before it locks a learning item.
  -- Keeping that order prevents grading and regeneration from interleaving.
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

  select
    coalesce(array_agg(ri.learning_item_id order by ri.position), '{}'::uuid[]),
    count(*)::integer,
    coalesce(max(ri.position), 0)::integer
    into v_existing_ids, v_existing_count, v_max_position
  from public.review_items as ri
  where ri.review_id = p_review_id
    and ri.user_id = p_user_id;

  -- Match record_review_attempt's review -> learning_item lock order. Sorting
  -- makes concurrent saves that share learning items acquire locks consistently.
  perform 1
  from public.learning_items as li
  where li.id = any(p_learning_item_ids)
    and li.user_id = p_user_id
  order by li.id
  for update;

  if v_existing_ids is distinct from p_learning_item_ids then
    if v_existing_count > 0 then
      -- A ready review may already be open in a browser even without an
      -- attempt. Every published review_item id therefore remains valid.
      if not (v_existing_ids <@ p_learning_item_ids) then
        raise exception 'published reviews may only be expanded with new items'
          using errcode = '55000';
      end if;

      v_temp_position_base := cardinality(p_learning_item_ids);
      if v_max_position > v_temp_position_base
         or v_temp_position_base + v_existing_count > 32767 then
        raise exception 'review positions exceed the supported range'
          using errcode = '22023';
      end if;

      -- Reject a stale Worker snapshot if a newly proposed card became
      -- ineligible after selection (for example, it was graded elsewhere).
      if exists (
        select 1
        from public.learning_items as li
        where li.id = any(p_learning_item_ids)
          and not (li.id = any(v_existing_ids))
          and (
            li.next_due > p_review_date
            or li.last_shown is not null and li.last_shown >= p_review_date
          )
      ) then
        raise exception 'new review items are no longer selectable'
          using errcode = '55000';
      end if;

      -- Move retained rows out of the target range first, avoiding transient
      -- conflicts with the immediate unique(review_id, position) constraint.
      update public.review_items as ri
      set position = (v_temp_position_base + old_item.ordinality)::smallint
      from unnest(v_existing_ids) with ordinality as old_item(item_id, ordinality)
      where ri.review_id = p_review_id
        and ri.user_id = p_user_id
        and ri.learning_item_id = old_item.item_id;

      update public.review_items as ri
      set position = array_position(p_learning_item_ids, ri.learning_item_id)::smallint
      where ri.review_id = p_review_id
        and ri.user_id = p_user_id;

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
      from unnest(p_learning_item_ids) with ordinality as requested(item_id, position)
      where not (requested.item_id = any(v_existing_ids));
    else
      -- The first publication has no row ids that clients can reference yet.
      if exists (
        select 1
        from public.learning_items as li
        where li.id = any(p_learning_item_ids)
          and (
            li.next_due > p_review_date
            or li.last_shown is not null and li.last_shown >= p_review_date
          )
      ) then
        raise exception 'review items are no longer selectable'
          using errcode = '55000';
      end if;

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
    end if;
  else
    -- Identical retries leave review_item identity and shown_at untouched.
    null;
  end if;

  update public.learning_items
  set last_shown = greatest(coalesce(last_shown, p_review_date), p_review_date),
      updated_at = v_now
  where id = any(p_learning_item_ids)
    and user_id = p_user_id;
end;
$$;

revoke all on function public.replace_review_items(uuid, uuid, uuid[], date) from public;
grant execute on function public.replace_review_items(uuid, uuid, uuid[], date) to service_role;

-- Save learning-item content and the generated review in one transaction. The
-- target review row is locked before content updates, matching the grading RPC.
create or replace function public.save_daily_review_with_items(
  p_user_id uuid,
  p_knowledge_space_id uuid,
  p_review_date date,
  p_content_json jsonb,
  p_audio_script_json jsonb,
  p_learning_items_json jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_review_id uuid;
  v_learning_item_ids uuid[];
  v_item_count integer;
  v_distinct_count integer;
  v_today date := (clock_timestamp() at time zone 'Asia/Shanghai')::date;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'save_daily_review_with_items is restricted to the service role'
      using errcode = '42501';
  end if;

  if p_user_id is null or p_knowledge_space_id is null or p_review_date is null
     or p_content_json is null or jsonb_typeof(p_content_json) <> 'object'
     or p_audio_script_json is null or jsonb_typeof(p_audio_script_json) <> 'object'
     or p_learning_items_json is null
     or jsonb_typeof(p_learning_items_json) <> 'array'
     or jsonb_array_length(p_learning_items_json) = 0 then
    raise exception 'daily review parameters are invalid'
      using errcode = '22023';
  end if;

  select count(*), count(distinct item.normalized_key)
    into v_item_count, v_distinct_count
  from jsonb_to_recordset(p_learning_items_json) as item(
    normalized_key text,
    type text,
    cue text,
    answer text,
    example text,
    priority text,
    occurrences integer,
    due_date date,
    learned_on date
  );

  if v_item_count <> jsonb_array_length(p_learning_items_json)
     or v_item_count <> v_distinct_count
     or v_item_count > 100
     or exists (
       select 1
       from jsonb_to_recordset(p_learning_items_json) as item(
         normalized_key text,
         type text,
         cue text,
         answer text,
         example text,
         priority text,
         occurrences integer,
         due_date date,
         learned_on date
       )
       where nullif(btrim(item.normalized_key), '') is null
          or length(item.normalized_key) > 240
          or item.type is null
          or item.type not in ('fact', 'concept', 'decision', 'quote', 'vocabulary', 'expression', 'error', 'pronunciation')
          or nullif(btrim(item.cue), '') is null
          or length(item.cue) > 20000
          or nullif(btrim(item.answer), '') is null
          or length(item.answer) > 50000
          or length(coalesce(item.example, '')) > 20000
          or item.priority is null
          or item.priority not in ('high', 'medium', 'low')
          or item.occurrences is null
          or item.occurrences <= 0
          or item.occurrences > 1000000
     ) then
    raise exception 'daily review learning items are invalid or duplicated'
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
  on conflict (user_id, knowledge_space_id, review_date) do nothing
  returning id into v_review_id;

  if v_review_id is null then
    select r.id
      into v_review_id
    from public.reviews as r
    where r.user_id = p_user_id
      and r.knowledge_space_id = p_knowledge_space_id
      and r.review_date = p_review_date
    for update;

    if not found then
      raise exception 'daily review could not be locked'
        using errcode = '55000';
    end if;
  end if;

  -- A normalized key may not be silently moved between knowledge spaces.
  if exists (
    select 1
    from public.learning_items as li
    join jsonb_to_recordset(p_learning_items_json) as item(normalized_key text)
      on item.normalized_key = li.normalized_key
    where li.user_id = p_user_id
      and li.knowledge_space_id is distinct from p_knowledge_space_id
  ) then
    raise exception 'a learning item already belongs to another knowledge space'
      using errcode = '55000';
  end if;

  insert into public.learning_items (
    user_id,
    knowledge_space_id,
    normalized_key,
    type,
    cue,
    answer,
    example,
    priority,
    occurrences,
    next_due,
    learned_on
  )
  select
    p_user_id,
    p_knowledge_space_id,
    item.normalized_key,
    item.type,
    item.cue,
    item.answer,
    nullif(btrim(item.example), ''),
    item.priority,
    item.occurrences,
    coalesce(item.due_date, v_today),
    coalesce(item.learned_on, v_today)
  from jsonb_to_recordset(p_learning_items_json) as item(
    normalized_key text,
    type text,
    cue text,
    answer text,
    example text,
    priority text,
    occurrences integer,
    due_date date,
    learned_on date
  )
  order by item.normalized_key
  on conflict (user_id, normalized_key) do nothing;

  select array_agg(li.id order by requested.position)
    into v_learning_item_ids
  from jsonb_array_elements(p_learning_items_json) with ordinality as requested(value, position)
  join public.learning_items as li
    on li.user_id = p_user_id
   and li.knowledge_space_id = p_knowledge_space_id
   and li.normalized_key = requested.value ->> 'normalized_key';

  if cardinality(v_learning_item_ids) <> v_item_count then
    raise exception 'daily review learning items could not be resolved'
      using errcode = '22023';
  end if;

  perform 1
  from public.learning_items as li
  where li.id = any(v_learning_item_ids)
    and li.user_id = p_user_id
  order by li.id
  for update;

  -- Published cards are immutable across all reviews: an old page may still
  -- submit an answer against its existing review_item id. Only cards that have
  -- never been published may receive regenerated content here.
  update public.learning_items as li
  set type = item.type,
      cue = item.cue,
      answer = item.answer,
      example = nullif(btrim(item.example), ''),
      priority = item.priority,
      updated_at = v_now
  from jsonb_to_recordset(p_learning_items_json) as item(
    normalized_key text,
    type text,
    cue text,
    answer text,
    example text,
    priority text
  )
  where li.user_id = p_user_id
    and li.knowledge_space_id = p_knowledge_space_id
    and li.normalized_key = item.normalized_key
    and not exists (
      select 1
      from public.review_items as ri
      where ri.user_id = p_user_id
        and ri.learning_item_id = li.id
    );

  perform public.replace_review_items(
    p_user_id,
    v_review_id,
    v_learning_item_ids,
    p_review_date
  );

  update public.reviews
  set status = 'ready',
      content_json = p_content_json,
      audio_script_json = p_audio_script_json
  where id = v_review_id
    and user_id = p_user_id;

  return v_review_id;
end;
$$;

revoke all on function public.save_daily_review_with_items(uuid, uuid, date, jsonb, jsonb, jsonb) from public;
grant execute on function public.save_daily_review_with_items(uuid, uuid, date, jsonb, jsonb, jsonb) to service_role;
