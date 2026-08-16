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
    run_id, revision, status, reason, plan, created_by, activated_at
  ) values (
    p_run_id, p_revision, 'active', p_reason, p_plan, 'agent', now()
  );

  insert into public.research_actions (
    id, run_id, plan_revision, sequence, kind, title, status,
    input, output, idempotency_key
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
      'allowedSourceKinds', coalesce(action -> 'allowedSourceKinds', '[]'::jsonb),
      'appliedSourceRuleIds', coalesce(action -> 'appliedSourceRuleIds', '[]'::jsonb),
      'directUrl', action -> 'directUrl'
    ),
    action -> 'result',
    p_run_id::text || ':' || p_revision::text || ':' || (action ->> 'id')
  from jsonb_array_elements(p_actions) as action;
end;
$$;

commit;
