alter table public.learning_items
  add column learned_on date;

update public.learning_items
set learned_on = (created_at at time zone 'Asia/Shanghai')::date
where learned_on is null;

alter table public.learning_items
  alter column learned_on set default ((now() at time zone 'Asia/Shanghai')::date),
  alter column learned_on set not null;

create index learning_items_space_learned_idx
  on public.learning_items (user_id, knowledge_space_id, learned_on desc);

create or replace function public.capture_learning_item(
  p_user_id uuid,
  p_knowledge_space_id uuid,
  p_normalized_key text,
  p_type text,
  p_cue text,
  p_answer text,
  p_example text,
  p_priority text,
  p_learned_on date
)
returns table (
  learning_item_id uuid,
  capture_action text,
  next_due date,
  occurrences integer,
  learned_on date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.learning_items%rowtype;
  v_action text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'capture_learning_item is restricted to the service role'
      using errcode = '42501';
  end if;

  if p_user_id is null or p_knowledge_space_id is null or p_learned_on is null then
    raise exception 'user, knowledge space, and learned date are required'
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

  if length(btrim(coalesce(p_normalized_key, ''))) < 2
     or length(p_normalized_key) > 160
     or p_normalized_key not like 'capture:%'
     or length(btrim(coalesce(p_cue, ''))) < 1
     or length(p_cue) > 500
     or length(btrim(coalesce(p_answer, ''))) < 1
     or length(p_answer) > 5000
     or length(coalesce(p_example, '')) > 2000 then
    raise exception 'learning item content is invalid'
      using errcode = '22023';
  end if;

  if p_type is null
     or p_type not in ('fact', 'concept', 'decision', 'quote', 'vocabulary', 'expression', 'error', 'pronunciation')
     or p_priority is null
     or p_priority not in ('high', 'medium', 'low') then
    raise exception 'learning item classification is invalid'
      using errcode = '22023';
  end if;

  -- Serialize captures for the same user/key so concurrent retries cannot
  -- create a duplicate or lose an occurrences increment.
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_normalized_key, 0)
  );

  select li.*
    into v_item
  from public.learning_items as li
  where li.user_id = p_user_id
    and li.normalized_key = p_normalized_key
  for update;

  if found then
    if v_item.knowledge_space_id is distinct from p_knowledge_space_id then
      raise exception 'normalized key already belongs to another knowledge space'
        using errcode = '23505';
    end if;

    update public.learning_items
    set type = p_type,
        cue = btrim(p_cue),
        answer = btrim(p_answer),
        example = nullif(btrim(coalesce(p_example, '')), ''),
        priority = p_priority,
        occurrences = occurrences + 1,
        updated_at = v_now
    where id = v_item.id
    returning * into v_item;

    v_action := 'updated';
  else
    insert into public.learning_items (
      user_id,
      knowledge_space_id,
      normalized_key,
      type,
      cue,
      answer,
      example,
      priority,
      status,
      occurrences,
      attempts,
      correct,
      next_due,
      learned_on
    ) values (
      p_user_id,
      p_knowledge_space_id,
      p_normalized_key,
      p_type,
      btrim(p_cue),
      btrim(p_answer),
      nullif(btrim(coalesce(p_example, '')), ''),
      p_priority,
      'learning',
      1,
      0,
      0,
      p_learned_on + 1,
      p_learned_on
    )
    returning * into v_item;

    v_action := 'created';
  end if;

  update public.profiles
  set state_version = state_version + 1,
      updated_at = v_now
  where id = p_user_id;

  return query
  select v_item.id, v_action, v_item.next_due, v_item.occurrences, v_item.learned_on;
end;
$$;

revoke all on function public.capture_learning_item(uuid, uuid, text, text, text, text, text, text, date) from public;
grant execute on function public.capture_learning_item(uuid, uuid, text, text, text, text, text, text, date) to service_role;
