begin;

create extension if not exists pgcrypto;

create type public.switchpath_user_role as enum (
  'account_executive'
);

create type public.playbook_status as enum (
  'draft',
  'active',
  'archived'
);

create type public.playbook_version_status as enum (
  'draft',
  'approved',
  'rejected'
);

create type public.playbook_source_kind as enum (
  'observed_browser_session',
  'written_instructions',
  'agent_suggestion',
  'generalized_intervention'
);

create type public.teaching_session_status as enum (
  'recording',
  'reviewing',
  'approved',
  'discarded'
);

create type public.research_run_status as enum (
  'draft',
  'planning',
  'running',
  'pause_requested',
  'paused',
  'comparing',
  'awaiting_approval',
  'replanning',
  'completed',
  'failed',
  'cancelled'
);

create type public.plan_revision_status as enum (
  'draft',
  'active',
  'superseded'
);

create type public.research_action_status as enum (
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  'discarded'
);

create type public.research_action_kind as enum (
  'search_web',
  'open_public_page',
  'extract_evidence',
  'compare_evidence',
  'create_or_update_claim',
  'suggest_plan_change',
  'ask_for_approval',
  'complete_research',
  'generate_report'
);

create type public.run_command_kind as enum (
  'pause',
  'resume',
  'cancel',
  'submit_source',
  'approve_route',
  'reject_route',
  'retry'
);

create type public.run_command_status as enum (
  'pending',
  'claimed',
  'applied',
  'rejected'
);

create type public.source_kind as enum (
  'official_company',
  'public_filing',
  'public_report',
  'news',
  'public_article',
  'search_result',
  'user_supplied',
  'other'
);

create type public.source_actor as enum (
  'agent',
  'user'
);

create type public.source_retrieval_status as enum (
  'pending',
  'available',
  'blocked',
  'inaccessible',
  'unsupported',
  'failed'
);

create type public.claim_kind as enum (
  'sourced_fact',
  'agent_interpretation',
  'unsupported_hypothesis'
);

create type public.claim_status as enum (
  'active',
  'stale',
  'superseded',
  'rejected'
);

create type public.claim_evidence_relationship as enum (
  'supports',
  'contradicts',
  'context'
);

create type public.intervention_status as enum (
  'submitted',
  'validating',
  'comparing',
  'awaiting_approval',
  'approved',
  'rejected',
  'applied',
  'failed'
);

create type public.intervention_input_mode as enum (
  'typed',
  'voice'
);

create type public.memory_decision as enum (
  'undecided',
  'this_run_only',
  'save_generalized_rule'
);

create type public.report_status as enum (
  'pending',
  'generating',
  'ready',
  'failed'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_audit_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Switchpath audit records cannot be deleted';
end;
$$;

create or replace function public.validate_research_run_transition()
returns trigger
language plpgsql
as $$
declare
  transition_allowed boolean := false;
begin
  if old.status = new.status then
    if new.plan_revision <> old.plan_revision then
      raise exception 'plan_revision cannot change without a run-status transition';
    end if;
    if new.resume_status is distinct from old.resume_status
       or new.retry_status is distinct from old.retry_status then
      raise exception 'resume and retry targets cannot change without a run-status transition';
    end if;
    return new;
  end if;

  transition_allowed := case old.status
    when 'draft' then new.status in ('planning', 'cancelled')
    when 'planning' then new.status in ('running', 'pause_requested', 'failed', 'cancelled')
    when 'running' then new.status in ('pause_requested', 'completed', 'failed', 'cancelled')
    when 'pause_requested' then new.status in ('paused', 'failed', 'cancelled')
    when 'paused' then new.status = old.resume_status or new.status in ('comparing', 'cancelled')
    when 'comparing' then new.status in ('awaiting_approval', 'failed', 'cancelled')
    when 'awaiting_approval' then new.status in ('replanning', 'paused', 'cancelled')
    when 'replanning' then new.status in ('running', 'pause_requested', 'failed', 'cancelled')
    when 'failed' then new.status = old.retry_status or new.status = 'cancelled'
    else false
  end;

  if not transition_allowed then
    raise exception 'Invalid research-run transition: % -> %', old.status, new.status;
  end if;

  if old.status = 'planning' and new.status = 'running' then
    if old.plan_revision = 0 and new.plan_revision <> 1 then
      raise exception 'The initial plan must activate revision 1';
    elsif old.plan_revision > 0 and new.plan_revision <> old.plan_revision then
      raise exception 'Retrying a planned run cannot change its revision';
    end if;
  elsif old.status = 'awaiting_approval' and new.status = 'replanning' then
    if new.plan_revision <> old.plan_revision + 1 then
      raise exception 'An approved route must increment plan_revision exactly once';
    end if;
  elsif new.plan_revision <> old.plan_revision then
    raise exception 'This transition cannot change plan_revision';
  end if;

  if new.status = 'pause_requested' then
    if new.resume_status is distinct from old.status or new.retry_status is not null then
      raise exception 'A pause request must remember its exact resume target';
    end if;
  elsif old.status = 'pause_requested' and new.status = 'paused' then
    if new.resume_status is distinct from old.resume_status or new.retry_status is not null then
      raise exception 'A safe checkpoint must preserve the resume target';
    end if;
  elsif old.status = 'paused' and new.status = 'comparing' then
    if old.resume_status <> 'running' or new.resume_status <> 'running'
       or new.retry_status is not null then
      raise exception 'A source intervention requires paused active research';
    end if;
  elsif old.status in ('comparing', 'awaiting_approval')
        and new.status in ('awaiting_approval', 'paused') then
    if new.resume_status is distinct from old.resume_status or new.retry_status is not null then
      raise exception 'Source comparison must preserve the resume target';
    end if;
  elsif new.status = 'failed' then
    if new.retry_status is distinct from old.status
       or new.resume_status is distinct from old.resume_status then
      raise exception 'A failure must preserve both retry and resume targets';
    end if;
  elsif old.status = 'failed' and new.status = old.retry_status then
    if new.retry_status is not null
       or new.resume_status is distinct from old.resume_status then
      raise exception 'A retry must clear only its retry target';
    end if;
  elsif new.status in ('completed', 'cancelled') then
    if new.resume_status is not null or new.retry_status is not null then
      raise exception 'Terminal runs cannot retain resume or retry targets';
    end if;
  else
    if new.resume_status is not null or new.retry_status is not null then
      raise exception 'This transition must clear resume and retry targets';
    end if;
  end if;

  return new;
end;
$$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  display_name text not null,
  email text not null,
  role public.switchpath_user_role not null default 'account_executive',
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table public.playbooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null,
  description text,
  status public.playbook_status not null default 'draft',
  current_version_id uuid,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.playbook_versions (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  source_kind public.playbook_source_kind not null,
  status public.playbook_version_status not null default 'draft',
  change_summary text,
  created_by uuid not null references public.users(id) on delete restrict,
  approved_by uuid references public.users(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (playbook_id, version_number),
  check (
    (status = 'approved' and approved_by is not null and approved_at is not null)
    or status <> 'approved'
  )
);

alter table public.playbooks
  add constraint playbooks_current_version_fk
  foreign key (current_version_id)
  references public.playbook_versions(id)
  on delete restrict;

create table public.playbook_steps (
  id uuid primary key default gen_random_uuid(),
  playbook_version_id uuid not null references public.playbook_versions(id) on delete restrict,
  position integer not null check (position > 0),
  title text not null,
  objective text not null,
  instructions text,
  action_hint text,
  approval_required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (playbook_version_id, position)
);

create table public.source_rules (
  id uuid primary key default gen_random_uuid(),
  playbook_version_id uuid not null references public.playbook_versions(id) on delete restrict,
  playbook_step_id uuid references public.playbook_steps(id) on delete restrict,
  title text not null,
  rule_definition jsonb not null,
  priority integer not null default 100,
  active boolean not null default true,
  origin_intervention_id uuid,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(rule_definition) = 'object')
);

create table public.teaching_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  status public.teaching_session_status not null default 'recording',
  capture_mode public.playbook_source_kind not null,
  written_instructions text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  reviewed_at timestamptz,
  draft_playbook_version_id uuid references public.playbook_versions(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  check (capture_mode in ('observed_browser_session', 'written_instructions')),
  check (jsonb_typeof(metadata) = 'object')
);

create table public.teaching_events (
  id bigint generated always as identity primary key,
  teaching_session_id uuid not null references public.teaching_sessions(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  event_type text not null,
  page_url text,
  page_title text,
  search_query text,
  selected_text text,
  user_note text,
  explicitly_captured boolean not null default false,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (teaching_session_id, sequence),
  check (jsonb_typeof(metadata) = 'object')
);

create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  playbook_version_id uuid not null references public.playbook_versions(id) on delete restrict,
  company_name text not null,
  company_domain text,
  meeting_context text not null,
  research_goal text not null,
  sales_stage text not null default 'initial_prospecting'
    check (sales_stage = 'initial_prospecting'),
  status public.research_run_status not null default 'draft',
  plan_revision integer not null default 0 check (plan_revision >= 0),
  resume_status public.research_run_status,
  retry_status public.research_run_status,
  pause_requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failure_message text,
  agent_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(agent_state) = 'object'),
  check (
    resume_status is null
    or resume_status in ('planning', 'running', 'replanning')
  ),
  check (
    retry_status is null
    or retry_status in ('planning', 'running', 'pause_requested', 'comparing', 'replanning')
  )
);

create unique index research_runs_one_active_per_workspace_idx
on public.research_runs (workspace_id)
where status in (
  'planning',
  'running',
  'pause_requested',
  'paused',
  'comparing',
  'awaiting_approval',
  'replanning'
);

create index research_runs_workspace_created_idx
on public.research_runs (workspace_id, created_at desc);

create table public.plan_revisions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete restrict,
  revision integer not null check (revision > 0),
  status public.plan_revision_status not null default 'draft',
  reason text not null,
  plan jsonb not null,
  created_by public.source_actor not null default 'agent',
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (run_id, revision),
  check (jsonb_typeof(plan) = 'object')
);

create unique index plan_revisions_one_active_per_run_idx
on public.plan_revisions (run_id)
where status = 'active';

create table public.research_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete restrict,
  plan_revision integer not null,
  sequence integer not null check (sequence > 0),
  kind public.research_action_kind not null,
  title text not null,
  status public.research_action_status not null default 'pending',
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  idempotency_key text not null,
  lease_owner text,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (run_id, plan_revision, sequence),
  unique (run_id, idempotency_key),
  foreign key (run_id, plan_revision)
    references public.plan_revisions(run_id, revision)
    on delete restrict,
  check (jsonb_typeof(input) = 'object'),
  check (output is null or jsonb_typeof(output) in ('object', 'array'))
);

create index research_actions_next_idx
on public.research_actions (run_id, plan_revision, status, sequence);

create table public.run_commands (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.research_runs(id) on delete restrict,
  issued_by uuid not null references public.users(id) on delete restrict,
  kind public.run_command_kind not null,
  status public.run_command_status not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  claimed_by text,
  claimed_at timestamptz,
  handled_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object')
);

create index run_commands_pending_idx
on public.run_commands (run_id, status, id);

create table public.run_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.research_runs(id) on delete restrict,
  plan_revision integer not null default 0 check (plan_revision >= 0),
  action_id uuid references public.research_actions(id) on delete restrict,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object')
);

create index run_events_stream_idx
on public.run_events (run_id, id);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete restrict,
  plan_revision integer not null,
  original_url text not null,
  canonical_url text not null,
  domain text not null,
  title text,
  kind public.source_kind not null,
  added_by public.source_actor not null,
  retrieval_status public.source_retrieval_status not null default 'pending',
  published_at timestamptz,
  retrieved_at timestamptz,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (run_id, plan_revision)
    references public.plan_revisions(run_id, revision)
    on delete restrict,
  check (original_url ~ '^https?://'),
  check (canonical_url ~ '^https?://'),
  check (jsonb_typeof(metadata) = 'object')
);

create index sources_run_revision_idx
on public.sources (run_id, plan_revision, created_at);

create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete restrict,
  source_id uuid not null references public.sources(id) on delete restrict,
  plan_revision integer not null,
  excerpt text not null,
  locator text,
  relevance_score numeric(4, 3) check (relevance_score between 0 and 1),
  credibility_score numeric(4, 3) check (credibility_score between 0 and 1),
  captured_at timestamptz not null default now(),
  foreign key (run_id, plan_revision)
    references public.plan_revisions(run_id, revision)
    on delete restrict
);

create index evidence_items_run_revision_idx
on public.evidence_items (run_id, plan_revision, captured_at);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete restrict,
  plan_revision integer not null,
  kind public.claim_kind not null,
  status public.claim_status not null default 'active',
  statement text not null,
  rationale text,
  confidence numeric(4, 3) check (confidence between 0 and 1),
  created_by public.source_actor not null default 'agent',
  replaces_claim_id uuid references public.claims(id) on delete restrict,
  stale_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (run_id, plan_revision)
    references public.plan_revisions(run_id, revision)
    on delete restrict,
  check (
    kind <> 'sourced_fact'
    or confidence is not null
  )
);

create index claims_active_run_idx
on public.claims (run_id, status, kind);

create table public.claim_evidence (
  claim_id uuid not null references public.claims(id) on delete restrict,
  evidence_id uuid not null references public.evidence_items(id) on delete restrict,
  relationship public.claim_evidence_relationship not null default 'supports',
  created_at timestamptz not null default now(),
  primary key (claim_id, evidence_id)
);

create index claim_evidence_evidence_idx
on public.claim_evidence (evidence_id, relationship);

create table public.interventions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete restrict,
  requested_by uuid not null references public.users(id) on delete restrict,
  base_plan_revision integer not null,
  resulting_plan_revision integer,
  status public.intervention_status not null default 'submitted',
  input_mode public.intervention_input_mode not null,
  proposed_url text not null,
  proposed_page_title text,
  selected_text text,
  instruction text not null,
  comparison jsonb,
  generalized_rule_draft jsonb,
  memory_decision public.memory_decision not null default 'undecided',
  failure_message text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  applied_at timestamptz,
  foreign key (run_id, base_plan_revision)
    references public.plan_revisions(run_id, revision)
    on delete restrict,
  foreign key (run_id, resulting_plan_revision)
    references public.plan_revisions(run_id, revision)
    on delete restrict,
  check (proposed_url ~ '^https?://'),
  check (comparison is null or jsonb_typeof(comparison) = 'object'),
  check (generalized_rule_draft is null or jsonb_typeof(generalized_rule_draft) = 'object')
);

alter table public.source_rules
  add constraint source_rules_origin_intervention_fk
  foreign key (origin_intervention_id)
  references public.interventions(id)
  on delete restrict;

create index interventions_run_created_idx
on public.interventions (run_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete restrict,
  plan_revision integer not null,
  status public.report_status not null default 'pending',
  structured_content jsonb,
  pdf_storage_path text,
  generated_at timestamptz,
  failure_message text,
  created_at timestamptz not null default now(),
  unique (run_id, plan_revision),
  foreign key (run_id, plan_revision)
    references public.plan_revisions(run_id, revision)
    on delete restrict,
  check (structured_content is null or jsonb_typeof(structured_content) = 'object'),
  check (
    status <> 'ready'
    or (structured_content is not null and pdf_storage_path is not null and generated_at is not null)
  )
);

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create trigger playbooks_set_updated_at
before update on public.playbooks
for each row execute function public.set_updated_at();

create trigger research_runs_set_updated_at
before update on public.research_runs
for each row execute function public.set_updated_at();

create trigger research_runs_validate_transition
before update on public.research_runs
for each row execute function public.validate_research_run_transition();

create trigger claims_set_updated_at
before update on public.claims
for each row execute function public.set_updated_at();

create trigger run_events_prevent_delete
before delete on public.run_events
for each row execute function public.prevent_audit_delete();

create trigger sources_prevent_delete
before delete on public.sources
for each row execute function public.prevent_audit_delete();

create trigger evidence_items_prevent_delete
before delete on public.evidence_items
for each row execute function public.prevent_audit_delete();

create trigger interventions_prevent_delete
before delete on public.interventions
for each row execute function public.prevent_audit_delete();

alter table public.workspaces enable row level security;
alter table public.users enable row level security;
alter table public.playbooks enable row level security;
alter table public.playbook_versions enable row level security;
alter table public.playbook_steps enable row level security;
alter table public.source_rules enable row level security;
alter table public.teaching_sessions enable row level security;
alter table public.teaching_events enable row level security;
alter table public.research_runs enable row level security;
alter table public.plan_revisions enable row level security;
alter table public.research_actions enable row level security;
alter table public.run_commands enable row level security;
alter table public.run_events enable row level security;
alter table public.sources enable row level security;
alter table public.evidence_items enable row level security;
alter table public.claims enable row level security;
alter table public.claim_evidence enable row level security;
alter table public.interventions enable row level security;
alter table public.reports enable row level security;

comment on table public.run_commands is
  'Durable command queue polled by the research worker between atomic actions.';

comment on column public.research_runs.plan_revision is
  'Revision fence. Results produced under any older revision must be discarded.';

comment on table public.claim_evidence is
  'Dependency graph used to invalidate only claims affected by changed evidence.';

comment on table public.run_events is
  'Append-only event stream used for audit history and SSE reconnection.';

commit;
