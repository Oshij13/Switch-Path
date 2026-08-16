import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260813160000_initial_switchpath.sql",
  import.meta.url,
);
const migration = readFileSync(migrationUrl, "utf8");
const repositoryMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260814090000_repository_functions.sql",
    import.meta.url,
  ),
  "utf8",
);
const seed = readFileSync(
  new URL("../../../supabase/seed.sql", import.meta.url),
  "utf8",
);
const interventionMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260816123000_intervention_types_and_undo.sql",
    import.meta.url,
  ),
  "utf8",
);
const authMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260816133000_external_auth_identity.sql",
    import.meta.url,
  ),
  "utf8",
);

test("migration contains the durable research records", () => {
  const requiredTables = [
    "playbooks",
    "playbook_versions",
    "playbook_steps",
    "source_rules",
    "teaching_sessions",
    "teaching_events",
    "research_runs",
    "plan_revisions",
    "research_actions",
    "run_commands",
    "run_events",
    "sources",
    "evidence_items",
    "claims",
    "claim_evidence",
    "interventions",
    "reports",
  ];

  for (const table of requiredTables) {
    assert.match(migration, new RegExp(`create table public\\.${table} \\(`));
  }
});

test("database contract enforces run, revision, and evidence invariants", () => {
  assert.match(migration, /validate_research_run_transition/);
  assert.match(migration, /research_runs_one_active_per_workspace_idx/);
  assert.match(migration, /awaiting_approval.*replanning/s);
  assert.match(migration, /new\.plan_revision <> old\.plan_revision \+ 1/);
  assert.match(migration, /resume_status public\.research_run_status/);
  assert.match(migration, /retry_status public\.research_run_status/);
  assert.match(migration, /foreign key \(run_id, plan_revision\)/);
  assert.match(migration, /primary key \(claim_id, evidence_id\)/);
  assert.match(migration, /alter table public\.claims enable row level security/);
});

test("migration is wrapped in one transaction", () => {
  assert.equal(migration.trimStart().startsWith("begin;"), true);
  assert.equal(migration.trimEnd().endsWith("commit;"), true);
});

test("repository migration saves plans and claims commands atomically", () => {
  assert.match(repositoryMigration, /create or replace function public\.save_research_plan/);
  assert.match(repositoryMigration, /create or replace function public\.claim_next_run_command/);
  assert.match(repositoryMigration, /for update skip locked/);
  assert.equal(repositoryMigration.trimStart().startsWith("begin;"), true);
  assert.equal(repositoryMigration.trimEnd().endsWith("commit;"), true);
});

test("cloud seed creates the fixed localhost demo identities", () => {
  assert.match(seed, /Switchpath demo workspace/);
  assert.match(seed, /Account intelligence/);
  assert.match(seed, /00000000-0000-4000-8000-000000000004/);
  assert.equal(seed.trimStart().startsWith("begin;"), true);
  assert.equal(seed.trimEnd().endsWith("commit;"), true);
});

test("interventions preserve explicit intent and a referentially valid undo target", () => {
  for (const intent of ["add_source", "replace_source", "change_objective", "challenge_conclusion"]) {
    assert.match(interventionMigration, new RegExp(`'${intent}'`));
  }
  assert.match(interventionMigration, /undo_run_id/);
  assert.match(interventionMigration, /foreign key \(undo_run_id, undo_plan_revision\)/);
  assert.match(interventionMigration, /interventions_undo_target_check/);
  assert.equal(interventionMigration.trimStart().startsWith("begin;"), true);
  assert.equal(interventionMigration.trimEnd().endsWith("commit;"), true);
});

test("host authentication identities are unique without replacing local demo users", () => {
  assert.match(authMigration, /add column if not exists external_auth_id text/);
  assert.match(authMigration, /users_external_auth_id_unique/);
  assert.match(authMigration, /where external_auth_id is not null/);
  assert.equal(authMigration.trimStart().startsWith("begin;"), true);
  assert.equal(authMigration.trimEnd().endsWith("commit;"), true);
});
