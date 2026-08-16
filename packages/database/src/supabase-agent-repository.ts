import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { RunState, RunStatus } from "../../shared/src/domain-types.ts";
import type { MeetingBrief } from "../../agent/src/meeting-brief-synthesizer.ts";
import type {
  ActionResult,
  ApprovedPlaybookStep,
  AgentRepository,
  GeneralizedSourceRule,
  PlannedAction,
  ResearchPlan,
  ResearchRun,
  RunCommand,
  RunEventRecord,
  SavedSourceRule,
  SourceIntervention,
} from "../../agent/src/contracts.ts";

type JsonObject = Record<string, unknown>;

export type SupabaseAgentRepositoryOptions = {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  workerId?: string;
};

export type WorkspaceUserContext = {
  userId: string;
  workspaceId: string;
  displayName: string;
  email: string;
  role: string;
};

export type CreateResearchRunInput = {
  workspaceId: string;
  playbookVersionId: string;
  companyName: string;
  companyDomain?: string;
  meetingContext: string;
  researchGoal: string;
};

export type PersistedRunEvent = RunEventRecord & {
  id: number;
  createdAt: string;
};

export type PersistedSourceRule = SavedSourceRule;

export type PendingMemoryCandidate = {
  run: ResearchRun;
  intervention: SourceIntervention;
};

export type RunResultSource = {
  id: string;
  url: string;
  title: string;
  domain: string;
  kind: string;
  retrievalStatus: string;
  summary?: string;
  retrievedAt?: string;
  promptInjectionSignals: string[];
};

export type RunResultEvidence = {
  id: string;
  sourceId: string;
  sourceUrl: string;
  sourceTitle: string;
  excerpt: string;
  locator?: string;
  relevanceScore?: number;
  credibilityScore?: number;
};

export type RunResultClaim = {
  id: string;
  kind: "sourced_fact" | "agent_interpretation" | "unsupported_hypothesis";
  status: string;
  statement: string;
  rationale?: string;
  confidence?: number;
  evidence: Array<RunResultEvidence & { relationship: string }>;
};

export type RunResults = {
  runId: string;
  revision: number;
  latestSummary?: string;
  sources: RunResultSource[];
  evidence: RunResultEvidence[];
  claims: RunResultClaim[];
  uncertainties: string[];
};

export type RunRevisionImpact = {
  runId: string;
  companyName: string;
  fromRevision: number;
  toRevision: number;
  status: "processing" | "ready";
  intervention: {
    id: string;
    proposedUrl: string;
    proposedPageTitle?: string;
    instruction: string;
  };
  changed: Array<{
    kind: "added" | "revised" | "removed";
    previous?: RunResultClaim;
    current?: RunResultClaim;
  }>;
  retained: RunResultClaim[];
  evidence: Array<RunResultEvidence & { introducedSource: boolean }>;
};

export type DemoResetResult = {
  removedRuns: number;
  removedLearnedRules: number;
};

export type ResearchRunSummary = {
  id: string;
  companyName: string;
  companyDomain?: string;
  meetingContext: string;
  researchGoal: string;
  status: ResearchRun["status"];
  planRevision: number;
  failureMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  sourceCount: number;
  claimCount: number;
  interventionCount: number;
  briefReady: boolean;
  pdfReady: boolean;
};

export type PlaybookStepSummary = {
  id: string;
  position: number;
  title: string;
  objective: string;
  instructions?: string;
  actionHint?: string;
  approvalRequired: boolean;
};

export type PlaybookSourceRuleSummary = {
  id: string;
  title: string;
  ruleDefinition: GeneralizedSourceRule;
  priority: number;
  active: boolean;
  createdAt: string;
  origin?: {
    interventionId: string;
    runId: string;
    companyName?: string;
    proposedUrl?: string;
    proposedPageTitle?: string;
  };
};

export type PlaybookDetails = {
  id: string;
  name: string;
  description?: string;
  status: string;
  version: {
    id: string;
    number: number;
    sourceKind: string;
    status: string;
    changeSummary?: string;
    approvedAt?: string;
    createdAt: string;
    isCurrent: boolean;
  };
  steps: PlaybookStepSummary[];
  sourceRules: PlaybookSourceRuleSummary[];
};

export type PlaybookVersionSummary = {
  id: string;
  playbookId: string;
  number: number;
  sourceKind: string;
  status: string;
  changeSummary?: string;
  approvedAt?: string;
  createdAt: string;
  isCurrent: boolean;
};

export type SavePlaybookVersionInput = {
  workspaceId: string;
  playbookId: string;
  baseVersionId: string;
  name: string;
  description?: string;
  changeSummary: string;
  steps: Array<{
    title: string;
    objective: string;
    instructions?: string;
    actionHint?: string;
    approvalRequired?: boolean;
  }>;
};

export type SaveObservedPlaybookInput = {
  workspaceId: string;
  name: string;
  description?: string;
  sourceKind?: "observed_browser_session" | "written_instructions";
  steps: Array<{
    title: string;
    objective: string;
    instructions?: string;
  }>;
};

export type PersistedTeachingStep = {
  id: string;
  sequence: number;
  url?: string;
  title: string;
  hostname?: string;
  capturedAt: string;
  userNote?: string;
};

export type PersistedTeachingSession = {
  id?: string;
  status: "idle" | "recording" | "review";
  captureMode?: "observed_browser_session" | "written_instructions";
  writtenInstructions?: string;
  startedAt?: string;
  finishedAt?: string;
  steps: PersistedTeachingStep[];
};

export type WorkspaceEvidenceRun = {
  id: string;
  companyName: string;
  status: ResearchRun["status"];
  revision: number;
  updatedAt: string;
};

export type WorkspaceEvidenceSource = RunResultSource & {
  runId: string;
  companyName: string;
  revision: number;
};

export type WorkspaceEvidenceItem = RunResultEvidence & {
  runId: string;
  companyName: string;
  revision: number;
  capturedAt: string;
};

export type WorkspaceHistory = {
  generatedAt: string;
  playbookVersions: Array<PlaybookVersionSummary & { playbookName: string }>;
  planRevisions: Array<{
    runId: string;
    companyName: string;
    revision: number;
    reason: string;
    createdAt: string;
    current: boolean;
  }>;
  interventions: Array<SourceIntervention & { companyName: string }>;
  events: Array<{
    id: number;
    runId: string;
    companyName: string;
    revision: number;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
};

export type WorkspaceEvidenceClaim = RunResultClaim & {
  runId: string;
  companyName: string;
  revision: number;
  createdAt: string;
};

export type WorkspaceEvidenceIndex = {
  generatedAt: string;
  runs: WorkspaceEvidenceRun[];
  sources: WorkspaceEvidenceSource[];
  evidence: WorkspaceEvidenceItem[];
  claims: WorkspaceEvidenceClaim[];
};

export class SupabaseAgentRepository implements AgentRepository {
  readonly #client: SupabaseClient;
  readonly #userId: string;
  readonly #workerId: string;

  constructor(options: SupabaseAgentRepositoryOptions) {
    if (!options.supabaseUrl.trim()) throw new Error("SUPABASE_URL is required");
    if (!options.serviceRoleKey.trim()) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
    }
    if (!options.userId.trim()) throw new Error("SWITCHPATH_DEMO_USER_ID is required");

    this.#client = createClient(options.supabaseUrl, options.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    this.#userId = options.userId;
    this.#workerId = options.workerId ?? `switchpath-worker-${process.pid}`;
  }

  async resolveOrCreateWorkspaceUser(input: {
    externalAuthId: string;
    email: string;
    displayName: string;
  }): Promise<WorkspaceUserContext> {
    const existingResponse = await this.#client
      .from("users")
      .select("id,workspace_id,display_name,email,role")
      .eq("external_auth_id", input.externalAuthId)
      .maybeSingle();
    assertSupabase(existingResponse.error, "Unable to resolve the signed-in Switchpath user");
    if (existingResponse.data) return mapWorkspaceUser(existingResponse.data as JsonObject);

    const workspaceResponse = await this.#client
      .from("workspaces")
      .insert({ name: `${input.displayName.trim() || input.email}'s workspace` })
      .select("id")
      .single();
    assertSupabase(workspaceResponse.error, "Unable to create the user's Switchpath workspace");
    const workspaceId = stringValue((workspaceResponse.data as JsonObject).id);
    const userResponse = await this.#client
      .from("users")
      .insert({
        workspace_id: workspaceId,
        external_auth_id: input.externalAuthId,
        display_name: input.displayName.trim() || input.email,
        email: input.email.trim().toLowerCase(),
        role: "account_executive",
      })
      .select("id,workspace_id,display_name,email,role")
      .single();
    assertSupabase(userResponse.error, "Unable to create the signed-in Switchpath user");
    return mapWorkspaceUser(userResponse.data as JsonObject);
  }

  async createRun(input: CreateResearchRunInput): Promise<ResearchRun> {
    const { data, error } = await this.#client
      .from("research_runs")
      .insert({
        workspace_id: input.workspaceId,
        user_id: this.#userId,
        playbook_version_id: input.playbookVersionId,
        company_name: input.companyName,
        company_domain: input.companyDomain ?? null,
        meeting_context: input.meetingContext,
        research_goal: input.researchGoal,
        sales_stage: "initial_prospecting",
      })
      .select("*")
      .single();
    assertSupabase(error, "Unable to create research run");
    return mapRun(data as JsonObject);
  }

  async getActiveRun(workspaceId: string): Promise<ResearchRun | undefined> {
    const { data, error } = await this.#client
      .from("research_runs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .in("status", [
        "planning",
        "running",
        "pause_requested",
        "paused",
        "comparing",
        "awaiting_approval",
        "replanning",
      ])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assertSupabase(error, "Unable to load the active research run");
    return data ? mapRun(data as JsonObject) : undefined;
  }

  async getNextWorkerRun(workspaceId?: string): Promise<ResearchRun | undefined> {
    const pendingCommands = await this.#client
      .from("run_commands")
      .select("run_id")
      .eq("status", "pending")
      .order("id", { ascending: true })
      .limit(25);
    assertSupabase(pendingCommands.error, "Unable to discover pending run commands");
    for (const rowValue of pendingCommands.data ?? []) {
      const run = await this.getRun(stringValue((rowValue as JsonObject).run_id));
      if ((!workspaceId || run.workspaceId === workspaceId) && !run.demoHidden) return run;
    }

    if (workspaceId) {
      const active = await this.getActiveRun(workspaceId);
      if (active) return active;
    } else {
      const activeResponse = await this.#client
        .from("research_runs")
        .select("*")
        .in("status", ["planning", "running", "pause_requested", "paused", "comparing", "awaiting_approval", "replanning"])
        .order("updated_at", { ascending: true })
        .limit(25);
      assertSupabase(activeResponse.error, "Unable to load active workspace research");
      const active = ((activeResponse.data ?? []) as JsonObject[]).find((row) => !isDemoHidden(row));
      if (active) return mapRun(active);
    }

    let draftQuery = this.#client
      .from("research_runs")
      .select("*")
      .eq("status", "draft")
      .order("created_at", { ascending: true })
      .limit(25);
    if (workspaceId) draftQuery = draftQuery.eq("workspace_id", workspaceId);
    const { data, error } = await draftQuery;
    assertSupabase(error, "Unable to load the next draft research run");
    const draft = ((data ?? []) as JsonObject[]).find((row) => !isDemoHidden(row));
    return draft ? mapRun(draft) : undefined;
  }

  async recoverWorkerState(): Promise<void> {
    const { error } = await this.#client.rpc("recover_switchpath_worker", {
      p_worker_id: this.#workerId,
    });
    assertSupabase(error, `Unable to recover worker ${this.#workerId}`);
  }

  async listEvents(runId: string, afterId = 0): Promise<PersistedRunEvent[]> {
    const { data, error } = await this.#client
      .from("run_events")
      .select("*")
      .eq("run_id", runId)
      .gt("id", afterId)
      .order("id", { ascending: true })
      .limit(250);
    assertSupabase(error, `Unable to load events for run ${runId}`);
    return (data ?? []).map((row) => mapPersistedEvent(row as JsonObject));
  }

  async getRunResults(runId: string, requestedRevision?: number): Promise<RunResults> {
    const run = await this.getRun(runId);
    const revision = requestedRevision ?? run.planRevision;
    if (!Number.isInteger(revision) || revision < 0 || revision > run.planRevision) {
      throw new Error(`Invalid revision ${revision} for run ${runId}`);
    }
    if (revision < 1) {
      return {
        runId,
        revision: 0,
        sources: [],
        evidence: [],
        claims: [],
        uncertainties: [],
      };
    }

    const [sourcesResponse, evidenceResponse, claimsResponse, plan] = await Promise.all([
      this.#client
        .from("sources")
        .select("*")
        .eq("run_id", runId)
        .eq("plan_revision", revision)
        .order("created_at", { ascending: true }),
      this.#client
        .from("evidence_items")
        .select("*")
        .eq("run_id", runId)
        .eq("plan_revision", revision)
        .order("captured_at", { ascending: true }),
      this.#client
        .from("claims")
        .select("*")
        .eq("run_id", runId)
        .eq("plan_revision", revision)
        .order("created_at", { ascending: true }),
      this.getPlan(runId, revision),
    ]);
    assertSupabase(sourcesResponse.error, `Unable to load sources for run ${runId}`);
    assertSupabase(evidenceResponse.error, `Unable to load evidence for run ${runId}`);
    assertSupabase(claimsResponse.error, `Unable to load claims for run ${runId}`);

    const sources: RunResultSource[] = (sourcesResponse.data ?? []).map((rowValue) => {
      const row = rowValue as JsonObject;
      const metadata = objectValue(row.metadata);
      return {
        id: stringValue(row.id),
        url: stringValue(row.canonical_url),
        title: optionalString(row.title) ?? stringValue(row.domain),
        domain: stringValue(row.domain),
        kind: stringValue(row.kind),
        retrievalStatus: stringValue(row.retrieval_status),
        summary: optionalString(metadata.summary),
        retrievedAt: optionalString(row.retrieved_at),
        promptInjectionSignals: stringArray(metadata.promptInjectionSignals),
      };
    });
    const sourceById = new Map(sources.map((source) => [source.id, source]));

    const evidence: RunResultEvidence[] = (evidenceResponse.data ?? []).map((rowValue) => {
      const row = rowValue as JsonObject;
      const sourceId = stringValue(row.source_id);
      const source = sourceById.get(sourceId);
      return {
        id: stringValue(row.id),
        sourceId,
        sourceUrl: source?.url ?? "",
        sourceTitle: source?.title ?? "Unknown source",
        excerpt: stringValue(row.excerpt),
        locator: optionalString(row.locator),
        relevanceScore: optionalNumber(row.relevance_score),
        credibilityScore: optionalNumber(row.credibility_score),
      };
    });
    const evidenceById = new Map(evidence.map((item) => [item.id, item]));

    const claimRows = (claimsResponse.data ?? []) as JsonObject[];
    const claimIds = claimRows.map((row) => stringValue(row.id));
    const linksByClaim = new Map<string, Array<{ evidenceId: string; relationship: string }>>();
    if (claimIds.length > 0) {
      const linksResponse = await this.#client
        .from("claim_evidence")
        .select("claim_id,evidence_id,relationship")
        .in("claim_id", claimIds);
      assertSupabase(linksResponse.error, `Unable to load claim evidence for run ${runId}`);
      for (const rowValue of linksResponse.data ?? []) {
        const row = rowValue as JsonObject;
        const claimId = stringValue(row.claim_id);
        const links = linksByClaim.get(claimId) ?? [];
        links.push({
          evidenceId: stringValue(row.evidence_id),
          relationship: stringValue(row.relationship),
        });
        linksByClaim.set(claimId, links);
      }
    }

    const claims: RunResultClaim[] = claimRows.map((row) => {
      const id = stringValue(row.id);
      return {
        id,
        kind: row.kind as RunResultClaim["kind"],
        status: stringValue(row.status),
        statement: stringValue(row.statement),
        rationale: optionalString(row.rationale),
        confidence: optionalNumber(row.confidence),
        evidence: (linksByClaim.get(id) ?? []).flatMap((link) => {
          const item = evidenceById.get(link.evidenceId);
          return item ? [{ ...item, relationship: link.relationship }] : [];
        }),
      };
    });

    const completedResults = (plan?.actions ?? [])
      .filter((action) => action.status === "completed" && action.result)
      .map((action) => action.result!);
    const uncertainties = [...new Set(
      completedResults.flatMap((result) => result.uncertainties).filter(Boolean),
    )];
    const latestSummary = [...completedResults]
      .reverse()
      .map((result) => result.summary.trim())
      .find(Boolean);

    return {
      runId,
      revision,
      latestSummary,
      sources,
      evidence,
      claims,
      uncertainties,
    };
  }

  async getRunRevisionImpact(runId: string): Promise<RunRevisionImpact | undefined> {
    const run = await this.getRun(runId);
    const intervention = await this.getLatestIntervention(runId);
    if (!intervention || intervention.status !== "applied") return undefined;
    const toRevision = intervention.resultingRevision ?? intervention.baseRevision + 1;
    if (toRevision > run.planRevision) return undefined;

    const [previous, current] = await Promise.all([
      this.getRunResults(runId, intervention.baseRevision),
      this.getRunResults(runId, toRevision),
    ]);
    const unmatchedPrevious = new Set(previous.claims.map((claim) => claim.id));
    const retained: RunResultClaim[] = [];
    const changed: RunRevisionImpact["changed"] = [];

    for (const currentClaim of current.claims) {
      const candidates = previous.claims
        .filter((claim) => unmatchedPrevious.has(claim.id))
        .map((claim) => ({ claim, score: statementSimilarity(claim.statement, currentClaim.statement) }))
        .sort((left, right) => right.score - left.score);
      const best = candidates[0];
      if (best && best.score >= 0.82) {
        unmatchedPrevious.delete(best.claim.id);
        retained.push(currentClaim);
      } else if (best && best.score >= 0.42) {
        unmatchedPrevious.delete(best.claim.id);
        changed.push({ kind: "revised", previous: best.claim, current: currentClaim });
      } else {
        changed.push({ kind: "added", current: currentClaim });
      }
    }
    for (const previousClaim of previous.claims) {
      if (unmatchedPrevious.has(previousClaim.id)) {
        changed.push({ kind: "removed", previous: previousClaim });
      }
    }

    const evidenceById = new Map<string, RunRevisionImpact["evidence"][number]>();
    const proposedUrl = normalizedComparableUrl(intervention.proposedUrl);
    for (const item of current.evidence) {
      if (normalizedComparableUrl(item.sourceUrl) === proposedUrl) {
        evidenceById.set(item.id, { ...item, introducedSource: true });
      }
    }
    for (const item of changed.flatMap((change) => change.current?.evidence ?? [])) {
      if (!evidenceById.has(item.id)) {
        evidenceById.set(item.id, {
          ...item,
          introducedSource: normalizedComparableUrl(item.sourceUrl) === proposedUrl,
        });
      }
    }

    return {
      runId,
      companyName: run.companyName,
      fromRevision: intervention.baseRevision,
      toRevision,
      status: run.planRevision === toRevision && ["running", "replanning"].includes(run.status)
        ? "processing"
        : "ready",
      intervention: {
        id: intervention.id,
        proposedUrl: intervention.proposedUrl,
        proposedPageTitle: intervention.proposedPageTitle,
        instruction: intervention.instruction,
      },
      changed,
      retained,
      evidence: [...evidenceById.values()].slice(0, 8),
    };
  }

  async resetDemoWorkspace(workspaceId: string): Promise<DemoResetResult> {
    const runsResponse = await this.#client
      .from("research_runs")
      .select("id,status,agent_state")
      .eq("workspace_id", workspaceId);
    assertSupabase(runsResponse.error, "Unable to inspect demo research runs");
    const runRows = ((runsResponse.data ?? []) as JsonObject[]).filter((row) => !isDemoHidden(row));
    const activeRun = runRows.find((row) => !["completed", "failed", "cancelled"].includes(stringValue(row.status)));
    if (activeRun) {
      throw new Error("Stop the active research run before resetting the demo workspace");
    }
    const runIds = runRows.map((row) => stringValue(row.id));
    if (runIds.length === 0) return { removedRuns: 0, removedLearnedRules: 0 };

    const interventionsResponse = await this.#client
      .from("interventions")
      .select("id")
      .in("run_id", runIds);
    assertSupabase(interventionsResponse.error, "Unable to inspect demo interventions");
    const interventionIds = (interventionsResponse.data ?? []).map((row) => stringValue((row as JsonObject).id));

    let removedLearnedRules = 0;
    if (interventionIds.length > 0) {
      const deactivated = await this.#client
        .from("source_rules")
        .update({ active: false })
        .in("origin_intervention_id", interventionIds)
        .select("id");
      assertSupabase(deactivated.error, "Unable to deactivate demo learned routes");
      removedLearnedRules = deactivated.data?.length ?? 0;
    }

    const hiddenAt = new Date().toISOString();
    for (const row of runRows) {
      const agentState = objectValue(row.agent_state);
      const hidden = await this.#client
        .from("research_runs")
        .update({ agent_state: { ...agentState, demoHidden: true, demoHiddenAt: hiddenAt } })
        .eq("id", stringValue(row.id));
      assertSupabase(hidden.error, `Unable to archive demo run ${stringValue(row.id)}`);
    }
    return { removedRuns: runIds.length, removedLearnedRules };
  }

  async getRun(runId: string): Promise<ResearchRun> {
    const { data, error } = await this.#client
      .from("research_runs")
      .select("*")
      .eq("id", runId)
      .maybeSingle();
    assertSupabase(error, `Unable to load run ${runId}`);
    if (!data) throw new Error(`Unknown run ${runId}`);
    return mapRun(data as JsonObject);
  }

  async getLatestRun(workspaceId: string): Promise<ResearchRun | undefined> {
    const { data, error } = await this.#client
      .from("research_runs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);
    assertSupabase(error, "Unable to load the latest research run");
    const row = ((data ?? []) as JsonObject[]).find((candidate) => !isDemoHidden(candidate));
    return row ? mapRun(row) : undefined;
  }

  async listRunSummaries(workspaceId: string): Promise<ResearchRunSummary[]> {
    const runsResponse = await this.#client
      .from("research_runs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);
    assertSupabase(runsResponse.error, "Unable to list research runs");
    const rows = ((runsResponse.data ?? []) as JsonObject[]).filter((row) => !isDemoHidden(row));
    if (rows.length === 0) return [];

    const runIds = rows.map((row) => stringValue(row.id));
    const [sourcesResponse, claimsResponse, interventionsResponse, reportsResponse] = await Promise.all([
      this.#client.from("sources").select("run_id,plan_revision").in("run_id", runIds),
      this.#client.from("claims").select("run_id,plan_revision,status").in("run_id", runIds),
      this.#client.from("interventions").select("run_id").in("run_id", runIds),
      this.#client
        .from("reports")
        .select("run_id,plan_revision,structured_content,pdf_storage_path")
        .in("run_id", runIds),
    ]);
    assertSupabase(sourcesResponse.error, "Unable to count research-run sources");
    assertSupabase(claimsResponse.error, "Unable to count research-run claims");
    assertSupabase(interventionsResponse.error, "Unable to count research-run interventions");
    assertSupabase(reportsResponse.error, "Unable to inspect research-run reports");

    return rows.map((row) => {
      const id = stringValue(row.id);
      const revision = numberValue(row.plan_revision);
      const report = (reportsResponse.data ?? []).find((value) => {
        const candidate = value as JsonObject;
        return candidate.run_id === id && numberValue(candidate.plan_revision) === revision;
      }) as JsonObject | undefined;
      return {
        id,
        companyName: stringValue(row.company_name),
        companyDomain: optionalString(row.company_domain),
        meetingContext: stringValue(row.meeting_context),
        researchGoal: stringValue(row.research_goal),
        status: row.status as ResearchRun["status"],
        planRevision: revision,
        failureMessage: optionalString(row.failure_message),
        createdAt: stringValue(row.created_at),
        updatedAt: stringValue(row.updated_at),
        completedAt: optionalString(row.completed_at),
        sourceCount: (sourcesResponse.data ?? []).filter((value) => {
          const candidate = value as JsonObject;
          return candidate.run_id === id && numberValue(candidate.plan_revision) === revision;
        }).length,
        claimCount: (claimsResponse.data ?? []).filter((value) => {
          const candidate = value as JsonObject;
          return candidate.run_id === id
            && numberValue(candidate.plan_revision) === revision
            && candidate.status === "active";
        }).length,
        interventionCount: (interventionsResponse.data ?? []).filter(
          (value) => (value as JsonObject).run_id === id,
        ).length,
        briefReady: Boolean(report?.structured_content),
        pdfReady: Boolean(report?.pdf_storage_path),
      };
    });
  }

  async getPlaybookDetails(
    workspaceId: string,
    playbookVersionId: string,
  ): Promise<PlaybookDetails> {
    const versionResponse = await this.#client
      .from("playbook_versions")
      .select("*")
      .eq("id", playbookVersionId)
      .maybeSingle();
    assertSupabase(versionResponse.error, "Unable to load the playbook version");
    if (!versionResponse.data) throw new Error(`Unknown playbook version ${playbookVersionId}`);
    const versionRow = versionResponse.data as JsonObject;

    const [playbookResponse, stepsResponse, rulesResponse] = await Promise.all([
      this.#client
        .from("playbooks")
        .select("*")
        .eq("id", stringValue(versionRow.playbook_id))
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      this.#client
        .from("playbook_steps")
        .select("*")
        .eq("playbook_version_id", playbookVersionId)
        .order("position", { ascending: true }),
      this.#client
        .from("source_rules")
        .select("*")
        .eq("playbook_version_id", playbookVersionId)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    assertSupabase(playbookResponse.error, "Unable to load the workspace playbook");
    assertSupabase(stepsResponse.error, "Unable to load playbook steps");
    assertSupabase(rulesResponse.error, "Unable to load learned source rules");
    if (!playbookResponse.data) throw new Error("The playbook does not belong to this workspace");

    const ruleRows = (rulesResponse.data ?? []) as JsonObject[];
    const interventionIds = ruleRows
      .map((row) => optionalString(row.origin_intervention_id))
      .filter((id): id is string => Boolean(id));
    const origins = new Map<string, PlaybookSourceRuleSummary["origin"]>();
    if (interventionIds.length > 0) {
      const interventionsResponse = await this.#client
        .from("interventions")
        .select("id,run_id,proposed_url,proposed_page_title")
        .in("id", interventionIds);
      assertSupabase(interventionsResponse.error, "Unable to load learned-rule origins");
      const interventionRows = (interventionsResponse.data ?? []) as JsonObject[];
      const originRunIds = [...new Set(interventionRows.map((row) => stringValue(row.run_id)))];
      const companyByRun = new Map<string, string>();
      if (originRunIds.length > 0) {
        const runsResponse = await this.#client
          .from("research_runs")
          .select("id,company_name")
          .in("id", originRunIds);
        assertSupabase(runsResponse.error, "Unable to load learned-rule companies");
        for (const value of runsResponse.data ?? []) {
          const row = value as JsonObject;
          companyByRun.set(stringValue(row.id), stringValue(row.company_name));
        }
      }
      for (const row of interventionRows) {
        const runId = stringValue(row.run_id);
        origins.set(stringValue(row.id), {
          interventionId: stringValue(row.id),
          runId,
          companyName: companyByRun.get(runId),
          proposedUrl: optionalString(row.proposed_url),
          proposedPageTitle: optionalString(row.proposed_page_title),
        });
      }
    }

    const playbookRow = playbookResponse.data as JsonObject;
    return {
      id: stringValue(playbookRow.id),
      name: stringValue(playbookRow.name),
      description: optionalString(playbookRow.description),
      status: stringValue(playbookRow.status),
      version: {
        id: stringValue(versionRow.id),
        number: numberValue(versionRow.version_number),
        sourceKind: stringValue(versionRow.source_kind),
        status: stringValue(versionRow.status),
        changeSummary: optionalString(versionRow.change_summary),
        approvedAt: optionalString(versionRow.approved_at),
        createdAt: stringValue(versionRow.created_at),
        isCurrent: optionalString(playbookRow.current_version_id) === playbookVersionId,
      },
      steps: ((stepsResponse.data ?? []) as JsonObject[]).map((row) => ({
        id: stringValue(row.id),
        position: numberValue(row.position),
        title: stringValue(row.title),
        objective: stringValue(row.objective),
        instructions: optionalString(row.instructions),
        actionHint: optionalString(row.action_hint),
        approvalRequired: Boolean(row.approval_required),
      })),
      sourceRules: ruleRows.map((row) => {
        const interventionId = optionalString(row.origin_intervention_id);
        return {
          id: stringValue(row.id),
          title: stringValue(row.title),
          ruleDefinition: row.rule_definition as GeneralizedSourceRule,
          priority: numberValue(row.priority),
          active: Boolean(row.active),
          createdAt: stringValue(row.created_at),
          origin: interventionId ? origins.get(interventionId) : undefined,
        };
      }),
    };
  }

  async listPlaybooks(workspaceId: string): Promise<PlaybookDetails[]> {
    const response = await this.#client
      .from("playbooks")
      .select("id,current_version_id,updated_at")
      .eq("workspace_id", workspaceId)
      .not("current_version_id", "is", null)
      .order("updated_at", { ascending: false });
    assertSupabase(response.error, "Unable to list workspace playbooks");
    const versionIds = ((response.data ?? []) as JsonObject[])
      .map((row) => optionalString(row.current_version_id))
      .filter((id): id is string => Boolean(id));
    return Promise.all(versionIds.map((versionId) => this.getPlaybookDetails(workspaceId, versionId)));
  }

  async getActiveTeachingSession(workspaceId: string): Promise<PersistedTeachingSession> {
    const sessionResponse = await this.#client
      .from("teaching_sessions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("user_id", this.#userId)
      .in("status", ["recording", "reviewing"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assertSupabase(sessionResponse.error, "Unable to load the active teaching session");
    if (!sessionResponse.data) return { status: "idle", steps: [] };
    const sessionRow = sessionResponse.data as JsonObject;
    const sessionId = stringValue(sessionRow.id);
    const eventsResponse = await this.#client
      .from("teaching_events")
      .select("*")
      .eq("teaching_session_id", sessionId)
      .order("sequence", { ascending: true });
    assertSupabase(eventsResponse.error, "Unable to load captured teaching steps");
    const captureMode = stringValue(sessionRow.capture_mode) as PersistedTeachingSession["captureMode"];
    return {
      id: sessionId,
      status: sessionRow.status === "reviewing" ? "review" : "recording",
      captureMode,
      writtenInstructions: optionalString(sessionRow.written_instructions),
      startedAt: stringValue(sessionRow.started_at),
      finishedAt: optionalString(sessionRow.finished_at),
      steps: ((eventsResponse.data ?? []) as JsonObject[]).map((row) => {
        const pageUrl = optionalString(row.page_url);
        return {
          id: String(row.id),
          sequence: numberValue(row.sequence),
          url: pageUrl,
          title: optionalString(row.page_title) ?? optionalString(row.user_note) ?? `Step ${numberValue(row.sequence)}`,
          hostname: pageUrl ? new URL(pageUrl).hostname.replace(/^www\./i, "") : undefined,
          capturedAt: stringValue(row.captured_at),
          userNote: optionalString(row.user_note),
        };
      }),
    };
  }

  async startTeachingSession(
    workspaceId: string,
    captureMode: "observed_browser_session" | "written_instructions",
    writtenInstructions?: string,
    writtenSteps: string[] = [],
  ): Promise<PersistedTeachingSession> {
    const active = await this.getActiveTeachingSession(workspaceId);
    if (active.status !== "idle") throw new Error("Finish or discard the existing teaching session first");
    if (captureMode === "written_instructions" && writtenSteps.length === 0) {
      throw new Error("Write at least one workflow step");
    }
    const finishedAt = captureMode === "written_instructions" ? new Date().toISOString() : null;
    const sessionResponse = await this.#client
      .from("teaching_sessions")
      .insert({
        workspace_id: workspaceId,
        user_id: this.#userId,
        status: captureMode === "written_instructions" ? "reviewing" : "recording",
        capture_mode: captureMode,
        written_instructions: writtenInstructions?.trim() || null,
        finished_at: finishedAt,
      })
      .select("id")
      .single();
    assertSupabase(sessionResponse.error, "Unable to start the teaching session");
    const sessionId = stringValue((sessionResponse.data as JsonObject).id);
    if (writtenSteps.length > 0) {
      const eventsResponse = await this.#client.from("teaching_events").insert(
        writtenSteps.map((step, index) => ({
          teaching_session_id: sessionId,
          sequence: index + 1,
          event_type: "written_instruction",
          user_note: step,
          explicitly_captured: true,
          metadata: { source: "written_workflow" },
        })),
      );
      assertSupabase(eventsResponse.error, "Unable to save the written workflow steps");
    }
    return this.getActiveTeachingSession(workspaceId);
  }

  async appendTeachingPage(
    workspaceId: string,
    page: { url: string; title: string },
  ): Promise<PersistedTeachingSession> {
    const session = await this.getActiveTeachingSession(workspaceId);
    if (session.status !== "recording" || !session.id) return session;
    if (session.captureMode !== "observed_browser_session") return session;
    if (session.steps.at(-1)?.url === page.url) return session;
    const response = await this.#client.from("teaching_events").insert({
      teaching_session_id: session.id,
      sequence: session.steps.length + 1,
      event_type: "page_navigation",
      page_url: page.url,
      page_title: page.title,
      explicitly_captured: false,
      metadata: { capturedBy: "chrome_extension" },
    });
    assertSupabase(response.error, "Unable to persist the captured teaching page");
    return this.getActiveTeachingSession(workspaceId);
  }

  async finishTeachingSession(workspaceId: string): Promise<PersistedTeachingSession> {
    const session = await this.getActiveTeachingSession(workspaceId);
    if (session.status !== "recording" || !session.id) {
      throw new Error("No teaching session is currently recording");
    }
    if (session.steps.length === 0) throw new Error("Visit at least one public page before finishing");
    const response = await this.#client
      .from("teaching_sessions")
      .update({ status: "reviewing", finished_at: new Date().toISOString() })
      .eq("id", session.id)
      .eq("workspace_id", workspaceId)
      .select("id");
    assertSupabase(response.error, "Unable to finish the teaching session");
    if (!response.data || response.data.length !== 1) throw new Error("The teaching session was not found");
    return this.getActiveTeachingSession(workspaceId);
  }

  async discardTeachingSession(workspaceId: string): Promise<PersistedTeachingSession> {
    const session = await this.getActiveTeachingSession(workspaceId);
    if (session.status === "idle" || !session.id) return session;
    const response = await this.#client
      .from("teaching_sessions")
      .update({ status: "discarded", finished_at: session.finishedAt ?? new Date().toISOString() })
      .eq("id", session.id)
      .eq("workspace_id", workspaceId)
      .select("id");
    assertSupabase(response.error, "Unable to discard the teaching session");
    return { status: "idle", steps: [] };
  }

  async approveTeachingSession(
    workspaceId: string,
    sessionId: string,
    playbookVersionId: string,
  ): Promise<void> {
    const response = await this.#client
      .from("teaching_sessions")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        draft_playbook_version_id: playbookVersionId,
      })
      .eq("id", sessionId)
      .eq("workspace_id", workspaceId)
      .eq("user_id", this.#userId)
      .eq("status", "reviewing")
      .select("id");
    assertSupabase(response.error, "Unable to approve the teaching session");
    if (!response.data || response.data.length !== 1) throw new Error("The teaching session is no longer available for review");
  }

  async listPlaybookVersions(
    workspaceId: string,
    playbookId: string,
  ): Promise<PlaybookVersionSummary[]> {
    const playbookResponse = await this.#client
      .from("playbooks")
      .select("id,current_version_id")
      .eq("id", playbookId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    assertSupabase(playbookResponse.error, "Unable to load the workspace playbook");
    if (!playbookResponse.data) throw new Error("The playbook does not belong to this workspace");
    const playbookRow = playbookResponse.data as JsonObject;
    const currentVersionId = optionalString(playbookRow.current_version_id);
    const versionsResponse = await this.#client
      .from("playbook_versions")
      .select("id,playbook_id,version_number,source_kind,status,change_summary,approved_at,created_at")
      .eq("playbook_id", playbookId)
      .order("version_number", { ascending: false });
    assertSupabase(versionsResponse.error, "Unable to list playbook versions");
    return ((versionsResponse.data ?? []) as JsonObject[]).map((row) => ({
      id: stringValue(row.id),
      playbookId: stringValue(row.playbook_id),
      number: numberValue(row.version_number),
      sourceKind: stringValue(row.source_kind),
      status: stringValue(row.status),
      changeSummary: optionalString(row.change_summary),
      approvedAt: optionalString(row.approved_at),
      createdAt: stringValue(row.created_at),
      isCurrent: stringValue(row.id) === currentVersionId,
    }));
  }

  async savePlaybookVersion(input: SavePlaybookVersionInput): Promise<PlaybookDetails> {
    const name = input.name.trim();
    const changeSummary = input.changeSummary.trim();
    if (!name) throw new Error("A playbook name is required");
    if (!changeSummary) throw new Error("Explain what changed in this revision");
    if (input.steps.length === 0) throw new Error("A playbook needs at least one step");
    for (const [index, step] of input.steps.entries()) {
      if (!step.title.trim() || !step.objective.trim()) {
        throw new Error(`Step ${index + 1} needs both a title and an objective`);
      }
    }

    const playbookResponse = await this.#client
      .from("playbooks")
      .select("id,current_version_id")
      .eq("id", input.playbookId)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle();
    assertSupabase(playbookResponse.error, "Unable to load the playbook being edited");
    if (!playbookResponse.data) throw new Error("The playbook does not belong to this workspace");

    const baseVersionResponse = await this.#client
      .from("playbook_versions")
      .select("id,playbook_id,source_kind")
      .eq("id", input.baseVersionId)
      .eq("playbook_id", input.playbookId)
      .maybeSingle();
    assertSupabase(baseVersionResponse.error, "Unable to load the base playbook revision");
    if (!baseVersionResponse.data) throw new Error("The selected base revision does not belong to this playbook");

    const latestVersionResponse = await this.#client
      .from("playbook_versions")
      .select("version_number")
      .eq("playbook_id", input.playbookId)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();
    assertSupabase(latestVersionResponse.error, "Unable to determine the next playbook version");
    const nextVersion = numberValue((latestVersionResponse.data as JsonObject).version_number) + 1;
    const approvedAt = new Date().toISOString();
    const versionResponse = await this.#client
      .from("playbook_versions")
      .insert({
        playbook_id: input.playbookId,
        version_number: nextVersion,
        source_kind: stringValue((baseVersionResponse.data as JsonObject).source_kind),
        status: "approved",
        change_summary: changeSummary,
        created_by: this.#userId,
        approved_by: this.#userId,
        approved_at: approvedAt,
      })
      .select("id")
      .single();
    assertSupabase(versionResponse.error, "Unable to create the new playbook revision");
    const versionId = stringValue((versionResponse.data as JsonObject).id);

    const stepsResponse = await this.#client
      .from("playbook_steps")
      .insert(input.steps.map((step, index) => ({
        playbook_version_id: versionId,
        position: index + 1,
        title: step.title.trim(),
        objective: step.objective.trim(),
        instructions: step.instructions?.trim() || null,
        action_hint: step.actionHint?.trim() || null,
        approval_required: Boolean(step.approvalRequired),
      })))
      .select("id,position");
    assertSupabase(stepsResponse.error, "Unable to save the new playbook steps");

    const baseRulesResponse = await this.#client
      .from("source_rules")
      .select("playbook_step_id,title,rule_definition,priority,active,origin_intervention_id")
      .eq("playbook_version_id", input.baseVersionId);
    assertSupabase(baseRulesResponse.error, "Unable to copy learned routes into the new revision");
    const baseStepsResponse = await this.#client
      .from("playbook_steps")
      .select("id,position")
      .eq("playbook_version_id", input.baseVersionId);
    assertSupabase(baseStepsResponse.error, "Unable to match learned routes to the edited steps");
    const baseStepPositions = new Map(
      ((baseStepsResponse.data ?? []) as JsonObject[]).map((row) => [stringValue(row.id), numberValue(row.position)]),
    );
    const newStepIds = new Map(
      ((stepsResponse.data ?? []) as JsonObject[]).map((row) => [numberValue(row.position), stringValue(row.id)]),
    );
    const copiedRules = ((baseRulesResponse.data ?? []) as JsonObject[]).map((row) => {
      const oldStepId = optionalString(row.playbook_step_id);
      const position = oldStepId ? baseStepPositions.get(oldStepId) : undefined;
      return {
        playbook_version_id: versionId,
        playbook_step_id: position ? newStepIds.get(position) ?? null : null,
        title: stringValue(row.title),
        rule_definition: row.rule_definition,
        priority: numberValue(row.priority),
        active: Boolean(row.active),
        origin_intervention_id: optionalString(row.origin_intervention_id) ?? null,
      };
    });
    if (copiedRules.length > 0) {
      const copyRulesResponse = await this.#client.from("source_rules").insert(copiedRules);
      assertSupabase(copyRulesResponse.error, "Unable to preserve learned routes in the new revision");
    }

    const updateResponse = await this.#client
      .from("playbooks")
      .update({
        name,
        description: input.description?.trim() || null,
        current_version_id: versionId,
        updated_at: approvedAt,
      })
      .eq("id", input.playbookId)
      .eq("workspace_id", input.workspaceId)
      .select("id");
    assertSupabase(updateResponse.error, "Unable to activate the new playbook revision");
    if (!updateResponse.data || updateResponse.data.length !== 1) {
      throw new Error("The new playbook revision could not be activated");
    }
    return this.getPlaybookDetails(input.workspaceId, versionId);
  }

  async activatePlaybookVersion(
    workspaceId: string,
    playbookId: string,
    versionId: string,
  ): Promise<PlaybookDetails> {
    const details = await this.getPlaybookDetails(workspaceId, versionId);
    if (details.id !== playbookId) throw new Error("The selected revision does not belong to this playbook");
    if (details.version.status !== "approved") throw new Error("Only approved revisions can be made current");
    const response = await this.#client
      .from("playbooks")
      .update({ current_version_id: versionId, updated_at: new Date().toISOString() })
      .eq("id", playbookId)
      .eq("workspace_id", workspaceId)
      .select("id");
    assertSupabase(response.error, "Unable to make the selected revision current");
    if (!response.data || response.data.length !== 1) throw new Error("The selected playbook was not found");
    return this.getPlaybookDetails(workspaceId, versionId);
  }

  async saveObservedPlaybook(input: SaveObservedPlaybookInput): Promise<PlaybookDetails> {
    if (!input.name.trim()) throw new Error("A playbook name is required");
    if (input.steps.length === 0) throw new Error("A playbook needs at least one step");
    const playbookResponse = await this.#client
      .from("playbooks")
      .insert({
        workspace_id: input.workspaceId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        status: "active",
        created_by: this.#userId,
      })
      .select("id")
      .single();
    assertSupabase(playbookResponse.error, "Unable to create the observed playbook");
    const playbookId = stringValue((playbookResponse.data as JsonObject).id);
    const approvedAt = new Date().toISOString();
    const versionResponse = await this.#client
      .from("playbook_versions")
      .insert({
        playbook_id: playbookId,
        version_number: 1,
        source_kind: input.sourceKind ?? "observed_browser_session",
        status: "approved",
        change_summary: input.sourceKind === "written_instructions"
          ? "Created from reviewed written workflow instructions."
          : "Created from a reviewed Chrome teaching session.",
        created_by: this.#userId,
        approved_by: this.#userId,
        approved_at: approvedAt,
      })
      .select("id")
      .single();
    assertSupabase(versionResponse.error, "Unable to create the observed playbook version");
    const versionId = stringValue((versionResponse.data as JsonObject).id);
    const stepsResponse = await this.#client
      .from("playbook_steps")
      .insert(input.steps.map((step, index) => ({
        playbook_version_id: versionId,
        position: index + 1,
        title: step.title.trim(),
        objective: step.objective.trim(),
        instructions: step.instructions?.trim() || null,
        action_hint: "search_web",
        approval_required: false,
      })));
    assertSupabase(stepsResponse.error, "Unable to save the observed playbook steps");
    const currentVersionResponse = await this.#client
      .from("playbooks")
      .update({ current_version_id: versionId })
      .eq("id", playbookId)
      .eq("workspace_id", input.workspaceId)
      .select("id");
    assertSupabase(currentVersionResponse.error, "Unable to activate the observed playbook version");
    if (!currentVersionResponse.data || currentVersionResponse.data.length !== 1) {
      throw new Error("The observed playbook could not be activated");
    }
    return this.getPlaybookDetails(input.workspaceId, versionId);
  }

  async setSourceRuleActive(
    workspaceId: string,
    ruleId: string,
    active: boolean,
  ): Promise<void> {
    const ruleResponse = await this.#client
      .from("source_rules")
      .select("id,playbook_version_id")
      .eq("id", ruleId)
      .maybeSingle();
    assertSupabase(ruleResponse.error, `Unable to load source rule ${ruleId}`);
    if (!ruleResponse.data) throw new Error(`Unknown source rule ${ruleId}`);
    const playbookVersionId = stringValue((ruleResponse.data as JsonObject).playbook_version_id);
    const playbook = await this.getPlaybookDetails(workspaceId, playbookVersionId);
    if (!playbook.sourceRules.some((rule) => rule.id === ruleId)) {
      throw new Error(`Unknown source rule ${ruleId}`);
    }
    const { data, error } = await this.#client
      .from("source_rules")
      .update({ active })
      .eq("id", ruleId)
      .eq("playbook_version_id", playbookVersionId)
      .select("id");
    assertSupabase(error, `Unable to ${active ? "activate" : "deactivate"} source rule ${ruleId}`);
    if (!data || data.length !== 1) throw new Error(`Unknown source rule ${ruleId}`);
  }

  async getWorkspaceEvidenceIndex(workspaceId: string): Promise<WorkspaceEvidenceIndex> {
    const runsResponse = await this.#client
      .from("research_runs")
      .select("id,company_name,status,plan_revision,updated_at,agent_state")
      .eq("workspace_id", workspaceId)
      .gt("plan_revision", 0)
      .order("updated_at", { ascending: false })
      .limit(50);
    assertSupabase(runsResponse.error, "Unable to load evidence-index runs");

    const runRows = ((runsResponse.data ?? []) as JsonObject[]).filter((row) => !isDemoHidden(row));
    const runs: WorkspaceEvidenceRun[] = runRows.map((row) => ({
      id: stringValue(row.id),
      companyName: stringValue(row.company_name),
      status: row.status as ResearchRun["status"],
      revision: numberValue(row.plan_revision),
      updatedAt: stringValue(row.updated_at),
    }));
    if (runs.length === 0) {
      return { generatedAt: new Date().toISOString(), runs: [], sources: [], evidence: [], claims: [] };
    }

    const runIds = runs.map((run) => run.id);
    const runById = new Map(runs.map((run) => [run.id, run]));
    const [sourcesResponse, evidenceResponse, claimsResponse] = await Promise.all([
      this.#client.from("sources").select("*").in("run_id", runIds),
      this.#client.from("evidence_items").select("*").in("run_id", runIds),
      this.#client.from("claims").select("*").in("run_id", runIds).eq("status", "active"),
    ]);
    assertSupabase(sourcesResponse.error, "Unable to load workspace sources");
    assertSupabase(evidenceResponse.error, "Unable to load workspace evidence");
    assertSupabase(claimsResponse.error, "Unable to load workspace claims");

    const currentRows = (rows: unknown[] | null) => (rows ?? []).filter((value) => {
      const row = value as JsonObject;
      const run = runById.get(stringValue(row.run_id));
      return Boolean(run && numberValue(row.plan_revision) === run.revision);
    }) as JsonObject[];

    const sources: WorkspaceEvidenceSource[] = currentRows(sourcesResponse.data).map((row) => {
      const run = runById.get(stringValue(row.run_id));
      if (!run) throw new Error("Evidence index source references an unknown run");
      const metadata = objectValue(row.metadata);
      return {
        id: stringValue(row.id),
        runId: run.id,
        companyName: run.companyName,
        revision: run.revision,
        url: stringValue(row.canonical_url),
        title: optionalString(row.title) ?? stringValue(row.domain),
        domain: stringValue(row.domain),
        kind: stringValue(row.kind),
        retrievalStatus: stringValue(row.retrieval_status),
        summary: optionalString(metadata.summary),
        retrievedAt: optionalString(row.retrieved_at),
        promptInjectionSignals: stringArray(metadata.promptInjectionSignals),
      };
    });
    const sourceById = new Map(sources.map((source) => [source.id, source]));

    const evidence: WorkspaceEvidenceItem[] = currentRows(evidenceResponse.data).map((row) => {
      const run = runById.get(stringValue(row.run_id));
      if (!run) throw new Error("Evidence item references an unknown run");
      const sourceId = stringValue(row.source_id);
      const source = sourceById.get(sourceId);
      return {
        id: stringValue(row.id),
        runId: run.id,
        companyName: run.companyName,
        revision: run.revision,
        sourceId,
        sourceUrl: source?.url ?? "",
        sourceTitle: source?.title ?? "Unknown source",
        excerpt: stringValue(row.excerpt),
        locator: optionalString(row.locator),
        relevanceScore: optionalNumber(row.relevance_score),
        credibilityScore: optionalNumber(row.credibility_score),
        capturedAt: stringValue(row.captured_at),
      };
    });
    const evidenceById = new Map(evidence.map((item) => [item.id, item]));

    const claimRows = currentRows(claimsResponse.data);
    const claimIds = claimRows.map((row) => stringValue(row.id));
    const linksByClaim = new Map<string, Array<{ evidenceId: string; relationship: string }>>();
    if (claimIds.length > 0) {
      const linksResponse = await this.#client
        .from("claim_evidence")
        .select("claim_id,evidence_id,relationship")
        .in("claim_id", claimIds);
      assertSupabase(linksResponse.error, "Unable to connect workspace claims to evidence");
      for (const value of linksResponse.data ?? []) {
        const row = value as JsonObject;
        const claimId = stringValue(row.claim_id);
        const links = linksByClaim.get(claimId) ?? [];
        links.push({
          evidenceId: stringValue(row.evidence_id),
          relationship: stringValue(row.relationship),
        });
        linksByClaim.set(claimId, links);
      }
    }

    const claims: WorkspaceEvidenceClaim[] = claimRows.map((row) => {
      const run = runById.get(stringValue(row.run_id));
      if (!run) throw new Error("Claim references an unknown run");
      const id = stringValue(row.id);
      return {
        id,
        runId: run.id,
        companyName: run.companyName,
        revision: run.revision,
        kind: row.kind as RunResultClaim["kind"],
        status: stringValue(row.status),
        statement: stringValue(row.statement),
        rationale: optionalString(row.rationale),
        confidence: optionalNumber(row.confidence),
        createdAt: stringValue(row.created_at),
        evidence: (linksByClaim.get(id) ?? []).flatMap((link) => {
          const item = evidenceById.get(link.evidenceId);
          return item ? [{ ...item, relationship: link.relationship }] : [];
        }),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      runs,
      sources,
      evidence,
      claims,
    };
  }

  async getWorkspaceHistory(workspaceId: string): Promise<WorkspaceHistory> {
    const [runsResponse, playbooksResponse] = await Promise.all([
      this.#client
        .from("research_runs")
        .select("id,company_name,plan_revision,agent_state")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(50),
      this.#client
        .from("playbooks")
        .select("id,name,current_version_id")
        .eq("workspace_id", workspaceId),
    ]);
    assertSupabase(runsResponse.error, "Unable to load workspace history runs");
    assertSupabase(playbooksResponse.error, "Unable to load workspace history playbooks");
    const runRows = ((runsResponse.data ?? []) as JsonObject[]).filter((row) => !isDemoHidden(row));
    const runIds = runRows.map((row) => stringValue(row.id));
    const companyByRun = new Map(runRows.map((row) => [stringValue(row.id), stringValue(row.company_name)]));
    const currentRevisionByRun = new Map(runRows.map((row) => [stringValue(row.id), numberValue(row.plan_revision)]));
    const playbookRows = (playbooksResponse.data ?? []) as JsonObject[];
    const playbookIds = playbookRows.map((row) => stringValue(row.id));
    const playbookNameById = new Map(playbookRows.map((row) => [stringValue(row.id), stringValue(row.name)]));
    const currentVersionByPlaybook = new Map(playbookRows.map((row) => [
      stringValue(row.id),
      optionalString(row.current_version_id),
    ]));

    const [versionsResponse, revisionsResponse, interventionsResponse, eventsResponse] = await Promise.all([
      playbookIds.length > 0
        ? this.#client.from("playbook_versions").select("*").in("playbook_id", playbookIds).order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      runIds.length > 0
        ? this.#client.from("plan_revisions").select("run_id,revision,reason,created_at").in("run_id", runIds).order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      runIds.length > 0
        ? this.#client.from("interventions").select("*").in("run_id", runIds).order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      runIds.length > 0
        ? this.#client.from("run_events").select("id,run_id,plan_revision,event_type,payload,created_at").in("run_id", runIds).order("created_at", { ascending: false }).limit(500)
        : Promise.resolve({ data: [], error: null }),
    ]);
    assertSupabase(versionsResponse.error, "Unable to load playbook revision history");
    assertSupabase(revisionsResponse.error, "Unable to load research-plan history");
    assertSupabase(interventionsResponse.error, "Unable to load intervention history");
    assertSupabase(eventsResponse.error, "Unable to load research event history");

    return {
      generatedAt: new Date().toISOString(),
      playbookVersions: ((versionsResponse.data ?? []) as JsonObject[]).map((row) => {
        const playbookId = stringValue(row.playbook_id);
        return {
          id: stringValue(row.id),
          playbookId,
          playbookName: playbookNameById.get(playbookId) ?? "Unknown playbook",
          number: numberValue(row.version_number),
          sourceKind: stringValue(row.source_kind),
          status: stringValue(row.status),
          changeSummary: optionalString(row.change_summary),
          approvedAt: optionalString(row.approved_at),
          createdAt: stringValue(row.created_at),
          isCurrent: currentVersionByPlaybook.get(playbookId) === stringValue(row.id),
        };
      }),
      planRevisions: ((revisionsResponse.data ?? []) as JsonObject[]).map((row) => {
        const runId = stringValue(row.run_id);
        const revision = numberValue(row.revision);
        return {
          runId,
          companyName: companyByRun.get(runId) ?? "Unknown account",
          revision,
          reason: stringValue(row.reason),
          createdAt: stringValue(row.created_at),
          current: currentRevisionByRun.get(runId) === revision,
        };
      }),
      interventions: ((interventionsResponse.data ?? []) as JsonObject[]).map((row) => {
        const intervention = mapIntervention(row);
        return { ...intervention, companyName: companyByRun.get(intervention.runId) ?? "Unknown account" };
      }),
      events: ((eventsResponse.data ?? []) as JsonObject[]).map((row) => {
        const runId = stringValue(row.run_id);
        return {
          id: numberValue(row.id),
          runId,
          companyName: companyByRun.get(runId) ?? "Unknown account",
          revision: numberValue(row.plan_revision),
          type: stringValue(row.event_type),
          payload: objectValue(row.payload),
          createdAt: stringValue(row.created_at),
        };
      }),
    };
  }

  async getMeetingBrief(runId: string, revision: number): Promise<MeetingBrief | undefined> {
    const { data, error } = await this.#client
      .from("reports")
      .select("structured_content")
      .eq("run_id", runId)
      .eq("plan_revision", revision)
      .maybeSingle();
    assertSupabase(error, `Unable to load meeting brief for run ${runId}`);
    const content = data && (data as JsonObject).structured_content;
    return content && typeof content === "object"
      ? (content as unknown as MeetingBrief)
      : undefined;
  }

  async saveMeetingBrief(brief: MeetingBrief): Promise<void> {
    const { error } = await this.#client
      .from("reports")
      .upsert({
        run_id: brief.runId,
        plan_revision: brief.revision,
        status: "pending",
        structured_content: brief,
        generated_at: brief.generatedAt,
        failure_message: null,
      }, { onConflict: "run_id,plan_revision" });
    assertSupabase(error, `Unable to save meeting brief for run ${brief.runId}`);
  }

  async markMeetingBriefPdfReady(
    runId: string,
    revision: number,
    storagePath: string,
  ): Promise<void> {
    const { data, error } = await this.#client
      .from("reports")
      .update({
        status: "ready",
        pdf_storage_path: storagePath,
        generated_at: new Date().toISOString(),
        failure_message: null,
      })
      .eq("run_id", runId)
      .eq("plan_revision", revision)
      .not("structured_content", "is", null)
      .select("id");
    assertSupabase(error, `Unable to mark meeting brief PDF ready for run ${runId}`);
    if (!data || data.length !== 1) {
      throw new Error(`Meeting brief content is missing for run ${runId} revision ${revision}`);
    }
  }

  async listActiveSourceRulesForRun(runId: string): Promise<SavedSourceRule[]> {
    const runResponse = await this.#client
      .from("research_runs")
      .select("playbook_version_id")
      .eq("id", runId)
      .maybeSingle();
    assertSupabase(runResponse.error, `Unable to resolve playbook for run ${runId}`);
    if (!runResponse.data) throw new Error(`Unknown run ${runId}`);

    const rulesResponse = await this.#client
      .from("source_rules")
      .select("*")
      .eq(
        "playbook_version_id",
        stringValue((runResponse.data as JsonObject).playbook_version_id),
      )
      .eq("active", true)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(5);
    assertSupabase(rulesResponse.error, `Unable to load learned routes for run ${runId}`);

    const ruleRows = (rulesResponse.data ?? []) as JsonObject[];
    const interventionIds = ruleRows
      .map((row) => optionalString(row.origin_intervention_id))
      .filter((id): id is string => Boolean(id));
    const originByIntervention = new Map<
      string,
      { runId: string; companyName?: string }
    >();

    if (interventionIds.length > 0) {
      const interventionsResponse = await this.#client
        .from("interventions")
        .select("id,run_id")
        .in("id", interventionIds);
      assertSupabase(
        interventionsResponse.error,
        `Unable to load learned-route origins for run ${runId}`,
      );
      const interventionRows = (interventionsResponse.data ?? []) as JsonObject[];
      const originRunIds = [...new Set(interventionRows.map((row) => stringValue(row.run_id)))];
      const companyByRun = new Map<string, string>();
      if (originRunIds.length > 0) {
        const originsResponse = await this.#client
          .from("research_runs")
          .select("id,company_name")
          .in("id", originRunIds);
        assertSupabase(
          originsResponse.error,
          `Unable to load learned-route companies for run ${runId}`,
        );
        for (const rowValue of originsResponse.data ?? []) {
          const row = rowValue as JsonObject;
          companyByRun.set(stringValue(row.id), stringValue(row.company_name));
        }
      }
      for (const row of interventionRows) {
        const originRunId = stringValue(row.run_id);
        originByIntervention.set(stringValue(row.id), {
          runId: originRunId,
          companyName: companyByRun.get(originRunId),
        });
      }
    }

    return ruleRows.map((row) => {
      const rule = mapSourceRule(row);
      const origin = rule.originInterventionId
        ? originByIntervention.get(rule.originInterventionId)
        : undefined;
      return {
        ...rule,
        originRunId: origin?.runId,
        originCompanyName: origin?.companyName,
      };
    });
  }

  async listPlaybookStepsForRun(runId: string): Promise<ApprovedPlaybookStep[]> {
    const runResponse = await this.#client
      .from("research_runs")
      .select("playbook_version_id")
      .eq("id", runId)
      .maybeSingle();
    assertSupabase(runResponse.error, `Unable to resolve playbook for run ${runId}`);
    if (!runResponse.data) throw new Error(`Unknown run ${runId}`);

    const stepsResponse = await this.#client
      .from("playbook_steps")
      .select("*")
      .eq(
        "playbook_version_id",
        stringValue((runResponse.data as JsonObject).playbook_version_id),
      )
      .order("position", { ascending: true });
    assertSupabase(stepsResponse.error, `Unable to load playbook steps for run ${runId}`);

    return ((stepsResponse.data ?? []) as JsonObject[]).map((row) => ({
      id: stringValue(row.id),
      position: numberValue(row.position),
      title: stringValue(row.title),
      objective: stringValue(row.objective),
      instructions: optionalString(row.instructions),
      actionHint: optionalString(row.action_hint) as ApprovedPlaybookStep["actionHint"],
      approvalRequired: Boolean(row.approval_required),
    }));
  }

  async compareAndSetRun(
    runId: string,
    expectedStatus: RunStatus,
    nextState: RunState,
  ): Promise<ResearchRun> {
    const { data, error } = await this.#client
      .from("research_runs")
      .update({
        status: nextState.status,
        plan_revision: nextState.planRevision,
        resume_status: nextState.resumeStatus ?? null,
        retry_status: nextState.retryStatus ?? null,
        failure_message: nextState.failureMessage ?? null,
      })
      .eq("id", runId)
      .eq("status", expectedStatus)
      .select("*");
    assertSupabase(error, `Unable to transition run ${runId}`);
    if (!data || data.length !== 1) {
      const current = await this.getRun(runId);
      throw new Error(
        `Concurrent run update: expected ${expectedStatus}, found ${current.status}`,
      );
    }
    return mapRun(data[0] as JsonObject);
  }

  async savePlan(plan: ResearchPlan): Promise<void> {
    const { error } = await this.#client.rpc("save_research_plan", {
      p_run_id: plan.runId,
      p_revision: plan.revision,
      p_reason: plan.reason,
      p_plan: plan,
      p_actions: plan.actions,
    });
    assertSupabase(error, `Unable to save plan revision ${plan.revision}`);
  }

  async getPlan(runId: string, revision: number): Promise<ResearchPlan | undefined> {
    const [planResponse, actionsResponse] = await Promise.all([
      this.#client
        .from("plan_revisions")
        .select("reason")
        .eq("run_id", runId)
        .eq("revision", revision)
        .maybeSingle(),
      this.#client
        .from("research_actions")
        .select("*")
        .eq("run_id", runId)
        .eq("plan_revision", revision)
        .order("sequence", { ascending: true }),
    ]);
    assertSupabase(planResponse.error, `Unable to load plan revision ${revision}`);
    assertSupabase(actionsResponse.error, `Unable to load actions for revision ${revision}`);
    if (!planResponse.data) return undefined;

    return {
      runId,
      revision,
      reason: stringValue((planResponse.data as JsonObject).reason),
      actions: (actionsResponse.data ?? []).map((row) => mapAction(row as JsonObject)),
    };
  }

  async getNextAction(
    runId: string,
    revision: number,
  ): Promise<PlannedAction | undefined> {
    const plan = await this.getPlan(runId, revision);
    if (!plan) return undefined;
    const completed = new Set(
      plan.actions
        .filter((action) => action.status === "completed")
        .map((action) => action.id),
    );
    return plan.actions.find(
      (action) =>
        action.status === "pending"
        && action.dependsOn.every((dependency) => completed.has(dependency)),
    );
  }

  async updateAction(action: PlannedAction): Promise<void> {
    const now = new Date().toISOString();
    const running = action.status === "running";
    const { data, error } = await this.#client
      .from("research_actions")
      .update({
        status: action.status,
        output: action.result ?? null,
        error_message: action.errorMessage ?? null,
        lease_owner: running ? this.#workerId : null,
        lease_expires_at: running
          ? new Date(Date.now() + 5 * 60_000).toISOString()
          : null,
        started_at: running ? now : undefined,
        completed_at: ["completed", "failed", "cancelled", "discarded"].includes(
          action.status,
        )
          ? now
          : undefined,
      })
      .eq("id", action.id)
      .select("id");
    assertSupabase(error, `Unable to update action ${action.id}`);
    if (!data || data.length !== 1) throw new Error(`Unknown action ${action.id}`);
  }

  async persistActionArtifacts(input: {
    runId: string;
    revision: number;
    actionId: string;
    result: ActionResult;
  }): Promise<void> {
    const sourceIds = new Map<string, string>();

    for (const source of input.result.sources) {
      const existing = await this.#client
        .from("sources")
        .select("id")
        .eq("run_id", input.runId)
        .eq("plan_revision", input.revision)
        .eq("canonical_url", source.canonicalUrl)
        .maybeSingle();
      assertSupabase(existing.error, `Unable to find source ${source.canonicalUrl}`);

      const values = {
        run_id: input.runId,
        plan_revision: input.revision,
        original_url: source.originalUrl,
        canonical_url: source.canonicalUrl,
        domain: source.domain,
        title: source.title,
        kind: source.sourceKind,
        added_by: source.sourceKind === "user_supplied" ? "user" : "agent",
        retrieval_status: source.retrievalStatus,
        retrieved_at: source.retrievedAt ?? null,
        content_hash: source.contentHash ?? null,
        metadata: {
          actionId: input.actionId,
          summary: source.summary,
          extractedText: source.extractedText,
          contentType: source.contentType,
          truncated: source.truncated,
          promptInjectionSignals: source.promptInjectionSignals,
        },
      };

      if (existing.data) {
        const id = stringValue((existing.data as JsonObject).id);
        const updated = await this.#client.from("sources").update(values).eq("id", id);
        assertSupabase(updated.error, `Unable to update source ${source.canonicalUrl}`);
        sourceIds.set(source.originalUrl, id);
        sourceIds.set(source.canonicalUrl, id);
      } else {
        const inserted = await this.#client
          .from("sources")
          .insert(values)
          .select("id")
          .single();
        assertSupabase(inserted.error, `Unable to save source ${source.canonicalUrl}`);
        const id = stringValue((inserted.data as JsonObject).id);
        sourceIds.set(source.originalUrl, id);
        sourceIds.set(source.canonicalUrl, id);
      }
    }

    // Evidence and claims are intentionally produced in later actions than page
    // retrieval. Resolve sources saved by earlier actions in the same revision so
    // provenance remains linked across the durable plan.
    const persistedSources = await this.#client
      .from("sources")
      .select("id, original_url, canonical_url")
      .eq("run_id", input.runId)
      .eq("plan_revision", input.revision);
    assertSupabase(persistedSources.error, "Unable to resolve persisted research sources");
    for (const rowValue of persistedSources.data ?? []) {
      const row = rowValue as JsonObject;
      const id = stringValue(row.id);
      sourceIds.set(stringValue(row.original_url), id);
      sourceIds.set(stringValue(row.canonical_url), id);
    }

    const urlsBySourceId = new Map<string, string[]>();
    for (const [url, sourceId] of sourceIds) {
      const urls = urlsBySourceId.get(sourceId) ?? [];
      urls.push(url);
      urlsBySourceId.set(sourceId, urls);
    }

    const evidenceIds = new Map<string, string>();
    const persistedEvidence = await this.#client
      .from("evidence_items")
      .select("id, source_id, excerpt")
      .eq("run_id", input.runId)
      .eq("plan_revision", input.revision);
    assertSupabase(persistedEvidence.error, "Unable to resolve persisted evidence");
    for (const rowValue of persistedEvidence.data ?? []) {
      const row = rowValue as JsonObject;
      const id = stringValue(row.id);
      const excerpt = stringValue(row.excerpt);
      for (const url of urlsBySourceId.get(stringValue(row.source_id)) ?? []) {
        evidenceIds.set(evidenceKey(url, excerpt), id);
      }
    }

    for (const evidence of input.result.evidence) {
      const sourceId = sourceIds.get(evidence.sourceUrl);
      if (!sourceId) {
        throw new Error(`Evidence source was not persisted: ${evidence.sourceUrl}`);
      }
      const key = evidenceKey(evidence.sourceUrl, evidence.excerpt);
      if (evidenceIds.has(key)) continue;
      const inserted = await this.#client
        .from("evidence_items")
        .insert({
          run_id: input.runId,
          source_id: sourceId,
          plan_revision: input.revision,
          excerpt: evidence.excerpt,
          locator: evidence.locator ?? null,
          relevance_score: evidence.relevanceScore ?? null,
          credibility_score: evidence.credibilityScore ?? null,
        })
        .select("id")
        .single();
      assertSupabase(inserted.error, "Unable to save evidence");
      evidenceIds.set(key, stringValue((inserted.data as JsonObject).id));
    }

    const claimIds = new Map<string, string>();
    const persistedClaims = await this.#client
      .from("claims")
      .select("id, kind, statement")
      .eq("run_id", input.runId)
      .eq("plan_revision", input.revision);
    assertSupabase(persistedClaims.error, "Unable to resolve persisted claims");
    for (const rowValue of persistedClaims.data ?? []) {
      const row = rowValue as JsonObject;
      claimIds.set(
        claimKey(stringValue(row.kind), stringValue(row.statement)),
        stringValue(row.id),
      );
    }

    for (const claim of input.result.claims) {
      const key = claimKey(claim.kind, claim.statement);
      let claimId = claimIds.get(key);
      if (!claimId) {
        const inserted = await this.#client
          .from("claims")
          .insert({
            run_id: input.runId,
            plan_revision: input.revision,
            kind: claim.kind,
            statement: claim.statement,
            rationale: claim.rationale ?? null,
            confidence: claim.confidence ?? null,
            created_by: "agent",
          })
          .select("id")
          .single();
        assertSupabase(inserted.error, "Unable to save claim");
        claimId = stringValue((inserted.data as JsonObject).id);
        claimIds.set(key, claimId);
      }
      const links = claim.evidence.map((evidence) => {
        const evidenceId = evidenceIds.get(evidenceKey(evidence.sourceUrl, evidence.excerpt));
        if (!evidenceId) {
          throw new Error(`Claim references evidence that was not persisted: ${evidence.excerpt}`);
        }
        return { claim_id: claimId, evidence_id: evidenceId, relationship: "supports" };
      });
      if (links.length > 0) {
        const linked = await this.#client.from("claim_evidence").upsert(links, {
          onConflict: "claim_id,evidence_id",
          ignoreDuplicates: true,
        });
        assertSupabase(linked.error, "Unable to link claim evidence");
      }
    }
  }

  async enqueueCommand(
    command: Omit<RunCommand, "id" | "status">,
  ): Promise<RunCommand> {
    const { data, error } = await this.#client
      .from("run_commands")
      .insert({
        run_id: command.runId,
        issued_by: this.#userId,
        kind: command.kind,
        payload: command.payload,
      })
      .select("*")
      .single();
    assertSupabase(error, `Unable to enqueue ${command.kind} command`);
    return mapCommand(data as JsonObject);
  }

  async takeNextCommand(runId: string): Promise<RunCommand | undefined> {
    const { data, error } = await this.#client.rpc("claim_next_run_command", {
      p_run_id: runId,
      p_worker_id: this.#workerId,
    });
    assertSupabase(error, `Unable to claim command for run ${runId}`);
    const row = Array.isArray(data) ? data[0] : data;
    return row ? mapCommand(row as JsonObject) : undefined;
  }

  async finishCommand(
    commandId: string,
    status: "applied" | "rejected",
    reason?: string,
  ): Promise<void> {
    const { data, error } = await this.#client
      .from("run_commands")
      .update({
        status,
        handled_at: new Date().toISOString(),
        rejection_reason: reason ?? null,
      })
      .eq("id", commandId)
      .eq("status", "claimed")
      .select("id");
    assertSupabase(error, `Unable to finish command ${commandId}`);
    if (!data || data.length !== 1) throw new Error(`Unknown claimed command ${commandId}`);
  }

  async appendEvent(event: RunEventRecord): Promise<void> {
    const { error } = await this.#client.from("run_events").insert({
      run_id: event.runId,
      plan_revision: event.revision,
      event_type: event.type,
      payload: event.payload ?? {},
    });
    assertSupabase(error, `Unable to append ${event.type} event`);
  }

  async createIntervention(
    input: Omit<SourceIntervention, "id" | "status">,
  ): Promise<SourceIntervention> {
    const { data, error } = await this.#client
      .from("interventions")
      .insert({
        run_id: input.runId,
        requested_by: input.requestedBy ?? this.#userId,
        base_plan_revision: input.baseRevision,
        intervention_type: input.interventionType,
        input_mode: input.inputMode,
        proposed_url: input.proposedUrl,
        proposed_page_title: input.proposedPageTitle ?? null,
        selected_text: input.selectedText ?? null,
        instruction: input.instruction,
      })
      .select("*")
      .single();
    assertSupabase(error, "Unable to create source intervention");
    return mapIntervention(data as JsonObject);
  }

  async getActiveIntervention(runId: string): Promise<SourceIntervention | undefined> {
    const { data, error } = await this.#client
      .from("interventions")
      .select("*")
      .eq("run_id", runId)
      .in("status", [
        "submitted",
        "validating",
        "comparing",
        "awaiting_approval",
        "approved",
      ])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assertSupabase(error, `Unable to load active intervention for run ${runId}`);
    return data ? mapIntervention(data as JsonObject) : undefined;
  }

  async getLatestIntervention(runId: string): Promise<SourceIntervention | undefined> {
    const { data, error } = await this.#client
      .from("interventions")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assertSupabase(error, `Unable to load latest intervention for run ${runId}`);
    return data ? mapIntervention(data as JsonObject) : undefined;
  }

  async getPendingMemoryCandidate(
    workspaceId: string,
    runId?: string,
  ): Promise<PendingMemoryCandidate | undefined> {
    let query = this.#client
      .from("interventions")
      .select("*")
      .eq("status", "applied")
      .eq("memory_decision", "undecided")
      .order("applied_at", { ascending: false })
      .limit(25);
    if (runId) query = query.eq("run_id", runId);
    const { data, error } = await query;
    assertSupabase(error, "Unable to discover pending intervention memory decisions");
    for (const rowValue of data ?? []) {
      const intervention = mapIntervention(rowValue as JsonObject);
      const run = await this.getRun(intervention.runId);
      if (run.workspaceId === workspaceId && !run.demoHidden && run.status === "completed") {
        return { run, intervention };
      }
    }
    return undefined;
  }

  async decideInterventionMemory(input: {
    runId: string;
    decision: "this_run_only" | "save_generalized_rule";
    ruleDraft?: GeneralizedSourceRule;
  }): Promise<{ intervention: SourceIntervention; sourceRule?: PersistedSourceRule }> {
    const run = await this.getRun(input.runId);
    if (run.status !== "completed") {
      throw new Error("A source-route memory decision can only be saved after research completes");
    }
    const intervention = await this.getLatestIntervention(input.runId);
    if (!intervention || intervention.status !== "applied") {
      throw new Error("The completed run has no applied source intervention");
    }
    if (intervention.memoryDecision && intervention.memoryDecision !== "undecided") {
      if (intervention.memoryDecision !== input.decision) {
        throw new Error("This intervention already has a different memory decision");
      }
      const sourceRule = input.decision === "save_generalized_rule"
        ? await this.#getSourceRuleForIntervention(intervention.id)
        : undefined;
      return { intervention, sourceRule };
    }

    let sourceRule: PersistedSourceRule | undefined;
    if (input.decision === "save_generalized_rule") {
      if (!input.ruleDraft) throw new Error("A generalized rule draft is required");
      sourceRule = await this.#getSourceRuleForIntervention(intervention.id);
      if (!sourceRule) {
        const { data: runRow, error: runError } = await this.#client
          .from("research_runs")
          .select("playbook_version_id")
          .eq("id", input.runId)
          .single();
        assertSupabase(runError, "Unable to resolve the run playbook version");
        const inserted = await this.#client
          .from("source_rules")
          .insert({
            playbook_version_id: stringValue((runRow as JsonObject).playbook_version_id),
            title: input.ruleDraft.title,
            rule_definition: input.ruleDraft,
            priority: 100,
            active: true,
            origin_intervention_id: intervention.id,
          })
          .select("*")
          .single();
        assertSupabase(inserted.error, "Unable to save the generalized source rule");
        sourceRule = mapSourceRule(inserted.data as JsonObject);
      }
    }

    const { data, error } = await this.#client
      .from("interventions")
      .update({
        memory_decision: input.decision,
        generalized_rule_draft: input.ruleDraft ?? null,
      })
      .eq("id", intervention.id)
      .eq("memory_decision", "undecided")
      .select("*");
    assertSupabase(error, "Unable to save the intervention memory decision");
    if (!data || data.length !== 1) {
      throw new Error("The intervention memory decision changed concurrently");
    }
    const updated = mapIntervention(data[0] as JsonObject);
    await this.appendEvent({
      runId: run.id,
      revision: run.planRevision,
      type: input.decision === "save_generalized_rule"
        ? "intervention.memory_saved"
        : "intervention.memory_skipped",
      payload: {
        interventionId: intervention.id,
        sourceRuleId: sourceRule?.id,
      },
    });
    return { intervention: updated, sourceRule };
  }

  async #getSourceRuleForIntervention(
    interventionId: string,
  ): Promise<PersistedSourceRule | undefined> {
    const { data, error } = await this.#client
      .from("source_rules")
      .select("*")
      .eq("origin_intervention_id", interventionId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    assertSupabase(error, "Unable to load the intervention source rule");
    return data ? mapSourceRule(data as JsonObject) : undefined;
  }

  async updateIntervention(intervention: SourceIntervention): Promise<void> {
    const now = new Date().toISOString();
    const { data, error } = await this.#client
      .from("interventions")
      .update({
        status: intervention.status,
        comparison: intervention.comparison ?? null,
        resulting_plan_revision:
          intervention.status === "applied" ? intervention.baseRevision + 1 : null,
        decided_at: ["approved", "rejected"].includes(intervention.status) ? now : undefined,
        applied_at: intervention.status === "applied" ? now : undefined,
        undone_at: intervention.undoneAt ?? null,
        undo_run_id: intervention.undoRunId ?? null,
        undo_plan_revision: intervention.undoRevision ?? null,
      })
      .eq("id", intervention.id)
      .select("id");
    assertSupabase(error, `Unable to update intervention ${intervention.id}`);
    if (!data || data.length !== 1) {
      throw new Error(`Unknown intervention ${intervention.id}`);
    }
  }
}

export function createSupabaseAgentRepositoryFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  userId = env.SWITCHPATH_DEMO_USER_ID ?? "",
): SupabaseAgentRepository {
  return new SupabaseAgentRepository({
    supabaseUrl: env.SUPABASE_URL ?? "",
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    userId,
    workerId: env.SWITCHPATH_WORKER_ID,
  });
}

function mapWorkspaceUser(row: JsonObject): WorkspaceUserContext {
  return {
    userId: stringValue(row.id),
    workspaceId: stringValue(row.workspace_id),
    displayName: stringValue(row.display_name),
    email: stringValue(row.email),
    role: stringValue(row.role),
  };
}

function mapRun(row: JsonObject): ResearchRun {
  return {
    id: stringValue(row.id),
    workspaceId: stringValue(row.workspace_id),
    playbookVersionId: optionalString(row.playbook_version_id),
    demoHidden: isDemoHidden(row),
    companyName: stringValue(row.company_name),
    companyDomain: optionalString(row.company_domain),
    meetingContext: stringValue(row.meeting_context),
    researchGoal: stringValue(row.research_goal),
    salesStage: "initial_prospecting",
    status: row.status as ResearchRun["status"],
    planRevision: numberValue(row.plan_revision),
    lastTransitionAt: stringValue(row.updated_at),
    resumeStatus: optionalString(row.resume_status) as ResearchRun["resumeStatus"],
    retryStatus: optionalString(row.retry_status) as ResearchRun["retryStatus"],
    failureMessage: optionalString(row.failure_message),
  };
}

function mapAction(row: JsonObject): PlannedAction {
  const input = objectValue(row.input);
  return {
    id: stringValue(row.id),
    revision: numberValue(row.plan_revision),
    sequence: numberValue(row.sequence),
    kind: row.kind as PlannedAction["kind"],
    title: stringValue(row.title),
    objective: stringValue(input.objective),
    dependsOn: stringArray(input.dependsOn),
    completionCriteria: stringValue(input.completionCriteria),
    allowedSourceKinds: stringArray(input.allowedSourceKinds),
    appliedSourceRuleIds: stringArray(input.appliedSourceRuleIds),
    directUrl: optionalString(input.directUrl),
    playbookStepId: optionalString(input.playbookStepId),
    status: row.status as PlannedAction["status"],
    result: row.output ? (row.output as ActionResult) : undefined,
    errorMessage: optionalString(row.error_message),
  };
}

function mapCommand(row: JsonObject): RunCommand {
  return {
    id: String(row.id),
    runId: stringValue(row.run_id),
    issuedBy: optionalString(row.issued_by),
    kind: row.kind as RunCommand["kind"],
    payload: objectValue(row.payload),
    status: row.status as RunCommand["status"],
    rejectionReason: optionalString(row.rejection_reason),
  };
}

function mapIntervention(row: JsonObject): SourceIntervention {
  return {
    id: stringValue(row.id),
    runId: stringValue(row.run_id),
    requestedBy: optionalString(row.requested_by),
    baseRevision: numberValue(row.base_plan_revision),
    proposedUrl: stringValue(row.proposed_url),
    proposedPageTitle: optionalString(row.proposed_page_title),
    selectedText: optionalString(row.selected_text),
    interventionType: (optionalString(row.intervention_type) ?? "add_source") as SourceIntervention["interventionType"],
    instruction: stringValue(row.instruction),
    inputMode: row.input_mode === "voice" ? "voice" : "typed",
    status: row.status as SourceIntervention["status"],
    comparison: row.comparison
      ? (row.comparison as SourceIntervention["comparison"])
      : undefined,
    resultingRevision: optionalNumber(row.resulting_plan_revision),
    generalizedRuleDraft: row.generalized_rule_draft
      ? (row.generalized_rule_draft as GeneralizedSourceRule)
      : undefined,
    memoryDecision: (optionalString(row.memory_decision) ?? "undecided") as SourceIntervention["memoryDecision"],
    undoneAt: optionalString(row.undone_at),
    undoRunId: optionalString(row.undo_run_id),
    undoRevision: optionalNumber(row.undo_plan_revision),
    createdAt: optionalString(row.created_at),
  };
}

function mapSourceRule(row: JsonObject): PersistedSourceRule {
  return {
    id: stringValue(row.id),
    title: stringValue(row.title),
    ruleDefinition: row.rule_definition as GeneralizedSourceRule,
    priority: numberValue(row.priority),
    active: Boolean(row.active),
    originInterventionId: optionalString(row.origin_intervention_id),
  };
}

function mapPersistedEvent(row: JsonObject): PersistedRunEvent {
  return {
    id: numberValue(row.id),
    runId: stringValue(row.run_id),
    revision: numberValue(row.plan_revision),
    type: stringValue(row.event_type),
    payload: objectValue(row.payload),
    createdAt: stringValue(row.created_at),
  };
}

function evidenceKey(sourceUrl: string, excerpt: string): string {
  return `${sourceUrl}\u0000${excerpt}`;
}

function claimKey(kind: string, statement: string): string {
  return `${kind}\u0000${statement}`;
}

function normalizedComparableUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}${url.search}`;
  } catch {
    return value.trim().toLowerCase().replace(/\/$/, "");
  }
}

function statementSimilarity(left: string, right: string): number {
  const leftWords = statementWords(left);
  const rightWords = statementWords(right);
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;
  return union === 0 ? 0 : intersection / union;
}

function statementWords(value: string): Set<string> {
  const ignored = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "that", "the", "to", "with"]);
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1 && !ignored.has(word)),
  );
}

function isDemoHidden(row: JsonObject): boolean {
  return objectValue(row.agent_state).demoHidden === true;
}

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected database string value");
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function numberValue(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error("Expected database number value");
  return number;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return numberValue(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function assertSupabase(
  error: { message?: string; code?: string } | null,
  context: string,
): void {
  if (!error) return;
  const suffix = error.code ? ` (${error.code})` : "";
  throw new Error(`${context}: ${error.message ?? "Supabase request failed"}${suffix}`);
}
