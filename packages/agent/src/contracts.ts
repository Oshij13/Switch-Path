import type { RunState, RunStatus } from "../../shared/src/domain-types.ts";

export type ResearchActionKind =
  | "search_web"
  | "open_public_page"
  | "extract_evidence"
  | "compare_evidence"
  | "create_or_update_claim"
  | "suggest_plan_change"
  | "ask_for_approval"
  | "complete_research"
  | "generate_report";

export type ResearchRun = RunState & {
  id: string;
  workspaceId: string;
  playbookVersionId?: string;
  demoHidden?: boolean;
  companyName: string;
  companyDomain?: string;
  meetingContext: string;
  researchGoal: string;
  salesStage: "initial_prospecting";
};

export type ApprovedPlaybookStep = {
  id: string;
  position: number;
  title: string;
  objective: string;
  instructions?: string;
  actionHint?: ResearchActionKind;
  approvalRequired: boolean;
};

export type PlannedAction = {
  id: string;
  revision: number;
  sequence: number;
  kind: ResearchActionKind;
  title: string;
  objective: string;
  dependsOn: string[];
  completionCriteria: string;
  allowedSourceKinds: string[];
  appliedSourceRuleIds?: string[];
  directUrl?: string;
  playbookStepId?: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "discarded";
  result?: ActionResult;
  errorMessage?: string;
};

export type PlanActionDraft = {
  key: string;
  kind: ResearchActionKind;
  title: string;
  objective: string;
  dependsOn: string[];
  completionCriteria: string;
  allowedSourceKinds: string[];
  appliedSourceRuleIds?: string[];
  directUrl?: string;
  playbookStepId?: string;
};

export type PlanDraft = {
  rationale: string;
  actions: PlanActionDraft[];
};

export type ResearchPlan = {
  runId: string;
  revision: number;
  reason: string;
  actions: PlannedAction[];
};

export type EvidenceDraft = {
  sourceUrl: string;
  sourceTitle: string;
  excerpt: string;
  locator?: string;
  relevanceScore?: number;
  credibilityScore?: number;
};

export type SourceArtifact = {
  originalUrl: string;
  canonicalUrl: string;
  domain: string;
  title: string;
  sourceKind:
    | "official_company"
    | "public_filing"
    | "public_report"
    | "news"
    | "public_article"
    | "search_result"
    | "user_supplied"
    | "other";
  retrievalStatus:
    | "pending"
    | "available"
    | "blocked"
    | "inaccessible"
    | "unsupported"
    | "failed";
  summary?: string;
  extractedText?: string;
  contentHash?: string;
  retrievedAt?: string;
  contentType?: string;
  truncated?: boolean;
  promptInjectionSignals: string[];
};

export type ClaimDraft = {
  statement: string;
  kind: "sourced_fact" | "agent_interpretation" | "unsupported_hypothesis";
  rationale?: string;
  confidence?: number;
  evidence: EvidenceDraft[];
};

export type ActionResult = {
  summary: string;
  sources: SourceArtifact[];
  evidence: EvidenceDraft[];
  claims: ClaimDraft[];
  uncertainties: string[];
  recommendedNextAction?: string;
};

export type CommandKind =
  | "pause"
  | "resume"
  | "cancel"
  | "submit_source"
  | "approve_route"
  | "reject_route"
  | "undo_intervention"
  | "retry";

export type RunCommand = {
  id: string;
  runId: string;
  issuedBy?: string;
  kind: CommandKind;
  payload: Record<string, unknown>;
  status: "pending" | "claimed" | "applied" | "rejected";
  rejectionReason?: string;
};

export type InterventionType =
  | "add_source"
  | "replace_source"
  | "change_objective"
  | "challenge_conclusion";

export type SourceIntervention = {
  id: string;
  runId: string;
  requestedBy?: string;
  baseRevision: number;
  proposedUrl: string;
  proposedPageTitle?: string;
  selectedText?: string;
  interventionType: InterventionType;
  instruction: string;
  inputMode: "typed" | "voice";
  status: "submitted" | "comparing" | "awaiting_approval" | "approved" | "rejected" | "applied" | "failed";
  comparison?: InterventionComparison;
  resultingRevision?: number;
  generalizedRuleDraft?: GeneralizedSourceRule;
  memoryDecision?: "undecided" | "this_run_only" | "save_generalized_rule";
  undoneAt?: string;
  undoRunId?: string;
  undoRevision?: number;
  createdAt?: string;
};

export type GeneralizedSourceRule = {
  title: string;
  domainStrategy:
    | "target_official_domain"
    | "verified_parent_official_domain"
    | "target_or_verified_parent_official_domain";
  sourceCategory:
    | "official_sustainability_or_impact"
    | "official_investor_relations"
    | "public_filing"
    | "official_operational_update"
    | "other_official_source";
  pathKeywords: string[];
  queryTemplate: string;
  discoveryInstruction: string;
  useWhen: string[];
  applicabilityChecks: string[];
  avoidWhen: string[];
  rationale: string;
};

export type SavedSourceRule = {
  id: string;
  title: string;
  ruleDefinition: GeneralizedSourceRule;
  priority: number;
  active: boolean;
  originInterventionId?: string;
  originRunId?: string;
  originCompanyName?: string;
};

export type InterventionComparison = {
  previousRoute: string;
  proposedRoute: string;
  retainedConclusions: string[];
  conclusionsToRecheck: string[];
  expectedBenefit: string;
  risks: string[];
  recommendation: "use_new_route" | "keep_existing_route" | "use_as_context";
};

export type RunEventRecord = {
  runId: string;
  revision: number;
  type: string;
  payload?: Record<string, unknown>;
};

export interface AgentRepository {
  getRun(runId: string): Promise<ResearchRun>;
  listPlaybookStepsForRun(runId: string): Promise<ApprovedPlaybookStep[]>;
  listActiveSourceRulesForRun(runId: string): Promise<SavedSourceRule[]>;
  compareAndSetRun(
    runId: string,
    expectedStatus: RunStatus,
    nextState: RunState,
  ): Promise<ResearchRun>;
  savePlan(plan: ResearchPlan): Promise<void>;
  getPlan(runId: string, revision: number): Promise<ResearchPlan | undefined>;
  getNextAction(runId: string, revision: number): Promise<PlannedAction | undefined>;
  updateAction(action: PlannedAction): Promise<void>;
  persistActionArtifacts(input: {
    runId: string;
    revision: number;
    actionId: string;
    result: ActionResult;
  }): Promise<void>;
  enqueueCommand(command: Omit<RunCommand, "id" | "status">): Promise<RunCommand>;
  takeNextCommand(runId: string): Promise<RunCommand | undefined>;
  finishCommand(commandId: string, status: "applied" | "rejected", reason?: string): Promise<void>;
  appendEvent(event: RunEventRecord): Promise<void>;
  createIntervention(input: Omit<SourceIntervention, "id" | "status">): Promise<SourceIntervention>;
  getActiveIntervention(runId: string): Promise<SourceIntervention | undefined>;
  getLatestIntervention(runId: string): Promise<SourceIntervention | undefined>;
  updateIntervention(intervention: SourceIntervention): Promise<void>;
}

export interface ResearchPlanner {
  createInitialPlan(
    run: ResearchRun,
    sourceRules: SavedSourceRule[],
    playbookSteps: ApprovedPlaybookStep[],
  ): Promise<PlanDraft>;
  createRevisedPlan(input: {
    run: ResearchRun;
    previousPlan: ResearchPlan;
    intervention: SourceIntervention;
    comparison: InterventionComparison;
  }): Promise<PlanDraft>;
}

export interface ResearchActionExecutor {
  execute(input: {
    run: ResearchRun;
    plan: ResearchPlan;
    action: PlannedAction;
    completedActions: PlannedAction[];
    signal: AbortSignal;
  }): Promise<ActionResult>;
}

export interface InterventionComparator {
  compare(input: {
    run: ResearchRun;
    plan: ResearchPlan;
    intervention: SourceIntervention;
  }): Promise<InterventionComparison>;
}

export interface SourceRuleGeneralizer {
  generalize(input: {
    run: ResearchRun;
    intervention: SourceIntervention;
  }): Promise<GeneralizedSourceRule>;
}

export interface IdGenerator {
  next(prefix: string): string;
}

export type OrchestratorOutcome =
  | "progressed"
  | "paused"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "idle";
