import { createClient } from "@supabase/supabase-js";

const supabaseUrl = requiredEnv("SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const checks = [
  client.from("users").select("external_auth_id").limit(1),
  client.from("interventions").select("intervention_type,undone_at,undo_run_id,undo_plan_revision").limit(1),
  client.from("teaching_sessions").select("status,capture_mode,written_instructions,draft_playbook_version_id").limit(1),
  client.from("teaching_events").select("sequence,page_url,page_title,selected_text,explicitly_captured").limit(1),
];

const results = await Promise.all(checks);
const failures = results.flatMap((result, index) => result.error ? [`check ${index + 1}: ${result.error.message}`] : []);
if (failures.length > 0) {
  console.error("Switchpath production schema is not ready:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Switchpath production schema is ready.");
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
