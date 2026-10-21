-- Organizer adds people to a planned session's sign-up list (owner's request
-- 2026-10-21): for those who messaged the organizer instead of using the link.
--
-- Same rules as signing up from the link: name 1–40 characters, a skill, no
-- duplicate going name (case-insensitive; repeats are skipped, like bulk add
-- players), at most 150 going. Nobody is charged until Start session.
-- These spots get a random cancel code that nobody keeps, so only the
-- organizer can remove them.

create function public.add_signups(p_queue_id uuid, p_people jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
  v_person jsonb;
  v_name text;
  v_skill public.skill_level;
  v_added integer := 0;
  v_skipped integer := 0;
begin
  v_queue := private.lock_owned_queue(p_queue_id);
  if v_queue.status <> 'planned' then
    raise exception 'This session already started. Add players instead.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_people) is distinct from 'array' or jsonb_array_length(p_people) = 0 then
    raise exception 'Please enter at least one name' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_people) > 100 then
    raise exception 'Add at most 100 people at a time' using errcode = 'P0001';
  end if;

  for v_person in select * from jsonb_array_elements(p_people)
  loop
    v_name := btrim(coalesce(v_person->>'name', ''));
    if v_name = '' then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if char_length(v_name) > 40 then
      raise exception 'Name must be 40 characters or less: %', left(v_name, 40) using errcode = 'P0001';
    end if;
    begin
      v_skill := (v_person->>'skill')::public.skill_level;
    exception when invalid_text_representation then
      raise exception 'Please pick a skill level for %', v_name using errcode = 'P0001';
    end;
    if v_skill is null then
      raise exception 'Please pick a skill level for %', v_name using errcode = 'P0001';
    end if;

    if exists (
      select 1 from public.signups
      where queue_id = p_queue_id and status = 'going' and lower(name) = lower(v_name)
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if (select count(*) from public.signups where queue_id = p_queue_id and status = 'going') >= 150 then
      raise exception 'The list is full (150 people)' using errcode = 'P0001';
    end if;

    insert into public.signups (queue_id, name, skill, cancel_code_hash)
    values (p_queue_id, v_name, v_skill, private.code_hash(gen_random_uuid()));
    v_added := v_added + 1;
  end loop;

  if v_added > 0 then
    perform private.touch_queue(p_queue_id);
  end if;
  return jsonb_build_object('added', v_added, 'skipped', v_skipped);
end;
$$;

revoke all on function public.add_signups(uuid, jsonb) from public, anon;
grant execute on function public.add_signups(uuid, jsonb) to authenticated;
