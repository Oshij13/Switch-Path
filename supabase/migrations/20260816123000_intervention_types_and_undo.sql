begin;

alter table public.interventions
  add column if not exists intervention_type text not null default 'add_source',
  add column if not exists undone_at timestamptz,
  add column if not exists undo_run_id uuid,
  add column if not exists undo_plan_revision integer;

alter table public.interventions
  drop constraint if exists interventions_intervention_type_check;

alter table public.interventions
  add constraint interventions_intervention_type_check
  check (intervention_type in (
    'add_source',
    'replace_source',
    'change_objective',
    'challenge_conclusion'
  ));

alter table public.interventions
  drop constraint if exists interventions_undo_plan_revision_fk;

alter table public.interventions
  add constraint interventions_undo_plan_revision_fk
  foreign key (undo_run_id, undo_plan_revision)
  references public.plan_revisions(run_id, revision)
  on delete restrict;

alter table public.interventions
  drop constraint if exists interventions_undo_target_check;

alter table public.interventions
  add constraint interventions_undo_target_check
  check ((undo_run_id is null) = (undo_plan_revision is null));

comment on column public.interventions.intervention_type is
  'Explicit user intent: add source, replace source, change objective, or challenge conclusion.';

comment on column public.interventions.undo_plan_revision is
  'The later immutable plan revision that restored the route before this intervention.';

comment on column public.interventions.undo_run_id is
  'The original or successor run containing the immutable undo revision.';

commit;
