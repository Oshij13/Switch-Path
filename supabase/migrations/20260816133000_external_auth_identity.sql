begin;

alter table public.users
  add column if not exists external_auth_id text;

create unique index if not exists users_external_auth_id_unique
  on public.users (external_auth_id)
  where external_auth_id is not null;

comment on column public.users.external_auth_id is
  'Stable identity supplied by the hosting platform authentication layer.';

commit;
