begin;

create or replace function public.save_research_plan(
  p_run_id uuid,
  p_revision integer,
  p_reason text,
  p_plan jsonb,
  p_actions jsonb
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if jsonb_typeof(p_plan) <> 'object' or jsonb_typeof(p_actions) <> 'array' then
    raise exception 'Plan and actions must be structured JSON';
  end if;

  update public.plan_revisions
  set status = 'superseded'
  where run_id = p_run_id and status = 'active';

  insert into public.plan_revisions (
    run_id,
    revision,
    status,
    reason,
    plan,
    created_by,
    activated_at
  ) values (
    p_run_id,
    p_revision,
    'active',
    p_reason,
    p_plan,
    'agent',
    now()
  );

  insert into public.research_actions (
    id,
    run_id,
    plan_revision,
    sequence,
    kind,
    title,
    status,
    input,
    output,
    idempotency_key
  )
  select
    (action ->> 'id')::uuid,
    p_run_id,
    p_revision,
    (action ->> 'sequence')::integer,
    (action ->> 'kind')::public.research_action_kind,
    action ->> 'title',
    coalesce((action ->> 'status')::public.research_action_status, 'pending'),
    jsonb_build_object(
      'objective', action -> 'objective',
      'dependsOn', coalesce(action -> 'dependsOn', '[]'::jsonb),
      'completionCriteria', action -> 'completionCriteria',
      'allowedSourceKinds', coalesce(action -> 'allowedSourceKinds', '[]'::jsonb)
    ),
    action -> 'result',
    p_run_id::text || ':' || p_revision::text || ':' || (action ->> 'id')
  from jsonb_array_elements(p_actions) as action;
end;
$$;

create or replace function public.claim_next_run_command(
  p_run_id uuid,
  p_worker_id text
)
returns setof public.run_commands
language plpgsql
set search_path = public
as $$
begin
  return query
  with next_command as (
    select id
    from public.run_commands
    where run_id = p_run_id and status = 'pending'
    order by id
    for update skip locked
    limit 1
  )
  update public.run_commands as command
  set
    status = 'claimed',
    claimed_by = p_worker_id,
    claimed_at = now()
  from next_command
  where command.id = next_command.id
  returning command.*;
end;
$$;

commit;
