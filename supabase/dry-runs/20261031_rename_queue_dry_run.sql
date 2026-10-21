-- DRY RUN for supabase/migrations/20261031120000_rename_queue.sql.
-- Safe in the SQL Editor: ends with an error on purpose, so nothing is saved.

begin;

-- Rename a queue (owner's request 2026-10-21). Same name rules as creating
-- one: trimmed, 1–60 characters. The new name shows everywhere right away
-- (organizer screens, display, sign-up / check-in link).

create function public.rename_queue(p_queue_id uuid, p_name text)
returns public.queues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
  v_name text := btrim(coalesce(p_name, ''));
begin
  v_queue := private.lock_owned_queue(p_queue_id);

  if v_name = '' then
    raise exception 'Please enter a queue name' using errcode = 'P0001';
  end if;
  if char_length(v_name) > 60 then
    raise exception 'Queue name must be 60 characters or less' using errcode = 'P0001';
  end if;

  if v_name is distinct from v_queue.name then
    update public.queues set name = v_name where id = p_queue_id;
    perform private.touch_queue(p_queue_id);
  end if;

  select * into v_queue from public.queues where id = p_queue_id;
  return v_queue;
end;
$$;

revoke all on function public.rename_queue(uuid, text) from public, anon;
grant execute on function public.rename_queue(uuid, text) to authenticated;

-- ===================== TESTS (7 checks) =====================
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a3', 'ren-a@example.invalid'), ('00000000-0000-0000-0000-0000000000b3', 'ren-b@example.invalid');
create temp table results (n serial, check_name text, value text) on commit drop;
grant all on results to anon, authenticated; grant all on sequence results_n_seq to anon, authenticated;
create temp table ids (q uuid) on commit drop; grant all on ids to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
insert into ids select public.create_queue('Old Name', 'doubles', 0, 0);
do $d$
declare v_q uuid := (select ids.q from ids); r public.queues; v_ver bigint;
begin
  v_ver := (select version from public.queues where id = v_q);
  r := public.rename_queue(v_q, '  Sunday Smash  ');
  insert into results(check_name, value) values ('rename trims', r.name || ' | version bumped=' || (r.version > v_ver));
  v_ver := r.version;
  r := public.rename_queue(v_q, 'Sunday Smash');
  insert into results(check_name, value) values ('same name: no bump', (r.version = v_ver)::text);
  begin perform public.rename_queue(v_q, '   '); insert into results(check_name, value) values ('blank', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('blank (expect refused)', sqlerrm); end;
  begin perform public.rename_queue(v_q, repeat('x', 61)); insert into results(check_name, value) values ('61 chars', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('61 chars (expect refused)', sqlerrm); end;
  insert into results(check_name, value) select 'summary shows new name', name from public.queue_summaries where id = v_q;
end $d$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
do $d$
begin
  begin perform public.rename_queue((select ids.q from ids), 'Hacked'); insert into results(check_name, value) values ('other owner', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('other owner (expect refused)', sqlerrm); end;
end $d$;

reset role;
set local role anon;
do $d$
begin
  begin perform public.rename_queue((select ids.q from ids), 'Hacked'); insert into results(check_name, value) values ('anon', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon (expect refused)', sqlerrm); end;
end $d$;

reset role;
do $$
declare v_report text;
begin
  select string_agg(n || '. ' || check_name || ' => ' || value, E'\n' order by n) into v_report from results;
  raise exception E'DRY RUN RESULTS (nothing was saved):\n%', v_report;
end $$;