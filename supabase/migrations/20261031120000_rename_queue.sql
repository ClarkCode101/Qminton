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
