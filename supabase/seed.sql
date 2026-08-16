begin;

insert into public.workspaces (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Switchpath demo workspace')
on conflict (id) do nothing;

insert into public.users (id, workspace_id, display_name, email, role)
values (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'ABC',
  'yash@switchpath.local',
  'account_executive'
)
on conflict (id) do nothing;

insert into public.playbooks (
  id,
  workspace_id,
  name,
  description,
  status,
  created_by
)
values (
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  'Account intelligence',
  'Public-source account research used to demonstrate live route intervention.',
  'active',
  '00000000-0000-4000-8000-000000000002'
)
on conflict (id) do nothing;

insert into public.playbook_versions (
  id,
  playbook_id,
  version_number,
  source_kind,
  status,
  change_summary,
  created_by,
  approved_by,
  approved_at
)
values (
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000003',
  1,
  'agent_suggestion',
  'approved',
  'Initial demo route for the intervention-first MVP.',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  now()
)
on conflict (id) do nothing;

insert into public.playbook_steps (
  id,
  playbook_version_id,
  position,
  title,
  objective,
  instructions,
  action_hint
)
values
  (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000004',
    1,
    'Understand the prospect',
    'Establish what the company does and how it operates.',
    'Prefer the prospect company website and other first-party material.',
    'search_web'
  ),
  (
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000004',
    2,
    'Identify strategic priorities',
    'Find dated initiatives relevant to the meeting objective.',
    'Use exact excerpts and retain the public URL for every factual claim.',
    'extract_evidence'
  ),
  (
    '00000000-0000-4000-8000-000000000013',
    '00000000-0000-4000-8000-000000000004',
    3,
    'Develop the meeting angle',
    'Connect verified priorities to useful discovery questions and opportunities.',
    'Separate sourced facts from interpretations and unsupported hypotheses.',
    'create_or_update_claim'
  )
on conflict (id) do nothing;

update public.playbooks
set current_version_id = '00000000-0000-4000-8000-000000000004'
where id = '00000000-0000-4000-8000-000000000003';

commit;
