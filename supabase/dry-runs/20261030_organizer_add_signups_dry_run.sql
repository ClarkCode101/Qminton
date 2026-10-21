-- DRY RUN for supabase/migrations/20261030120000_organizer_add_signups.sql.
-- Safe in the SQL Editor: ends with an error on purpose, so nothing is saved.

begin;

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

-- ===================== TESTS (14 checks) =====================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a2', 'add-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000000b2', 'add-b@example.invalid');
create temp table results (n serial, check_name text, value text) on commit drop;
grant all on results to anon, authenticated; grant all on sequence results_n_seq to anon, authenticated;
create temp table ids (name text, q uuid, t uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
insert into ids (name, q) select 'plan', public.create_queue('Plan', 'doubles', 50, 20);
insert into ids (name, q) select 'live', public.create_queue('Live', 'doubles', 50, 20);

do $d$
declare v_q uuid := (select ids.q from ids where ids.name = 'plan'); v_live uuid := (select ids.q from ids where ids.name = 'live'); r jsonb; v_ver bigint;
begin
  perform public.set_queue_plan(v_q, '2026-10-25 19:00+08');
  update ids set t = (select c.token from public.check_ins c where c.queue_id = ids.q) where ids.name = 'plan';
  v_ver := (select version from public.queues where id = v_q);
  r := public.add_signups(v_q, '[{"name":" Ana ","skill":"beginner"},{"name":"Ben","skill":"advance"},{"name":"ana","skill":"beginner"},{"name":"  ","skill":"beginner"}]');
  insert into results(check_name, value) values ('add 4 (1 dup, 1 blank)', r::text || ' | version bumped=' || ((select version from public.queues where id = v_q) > v_ver));
  insert into results(check_name, value) select 'list', string_agg(name || ':' || skill || ':' || status, ', ' order by id) from public.signups where queue_id = v_q;
  r := public.add_signups(v_q, '[{"name":"Ben","skill":"beginner"}]');
  insert into results(check_name, value) values ('already going -> skipped, no bump', r::text);
  begin perform public.add_signups(v_q, '[{"name":"Cy","skill":"pro"}]'); insert into results(check_name, value) values ('bad skill', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('bad skill (expect refused)', sqlerrm); end;
  begin perform public.add_signups(v_q, '[{"name":"Cy"}]'); insert into results(check_name, value) values ('no skill', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('no skill (expect refused)', sqlerrm); end;
  begin perform public.add_signups(v_q, jsonb_build_array(jsonb_build_object('name', repeat('x', 41), 'skill', 'beginner'))); insert into results(check_name, value) values ('long name', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('long name (expect refused)', sqlerrm); end;
  begin perform public.add_signups(v_q, '[]'); insert into results(check_name, value) values ('empty list', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('empty list (expect refused)', sqlerrm); end;
  begin perform public.add_signups(v_live, '[{"name":"Cy","skill":"beginner"}]'); insert into results(check_name, value) values ('live queue', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('live queue (expect refused)', sqlerrm); end;
  insert into results(check_name, value) values ('no charges (expect 0)', (select count(*) from public.ledger_entries where queue_id = v_q)::text);
end $d$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $d$
declare r jsonb;
begin
  r := public.get_signup((select ids.t from ids where ids.name = 'plan'));
  insert into results(check_name, value) values ('public link shows them', (r->'going')::text || ' | mine ' || (r->'mine')::text);
  begin perform public.add_signups((select ids.q from ids where ids.name = 'plan'), '[{"name":"Hack","skill":"beginner"}]'); insert into results(check_name, value) values ('anon add_signups', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon add_signups (expect refused)', sqlerrm); end;
end $d$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $d$
begin
  begin perform public.add_signups((select ids.q from ids where ids.name = 'plan'), '[{"name":"Hack","skill":"beginner"}]'); insert into results(check_name, value) values ('other owner', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('other owner (expect refused)', sqlerrm); end;
end $d$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $d$
declare v_q uuid := (select ids.q from ids where ids.name = 'plan'); r jsonb;
begin
  perform public.remove_signup(v_q, (select id from public.signups where queue_id = v_q and name = 'Ben' and status = 'going'));
  insert into results(check_name, value) values ('organizer removes an added one', (select string_agg(name || ':' || status, ', ' order by id) from public.signups where queue_id = v_q));
  r := public.start_session(v_q, array(select id from public.signups where queue_id = v_q and status = 'going'));
  insert into results(check_name, value) values ('start: added ones become players + billed', r::text || ' | ' || (select string_agg(player_name || ' ' || amount, ', ') from public.ledger_entries where queue_id = v_q));
end $d$;

reset role;
do $$
declare v_report text;
begin
  select string_agg(n || '. ' || check_name || ' => ' || value, E'\n' order by n) into v_report from results;
  raise exception E'DRY RUN RESULTS (nothing was saved):\n%', v_report;
end $$;