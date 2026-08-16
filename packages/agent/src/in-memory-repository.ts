import type { RunState, RunStatus } from "../../shared/src/domain-types.ts";

import type {
  ApprovedPlaybookStep,
  AgentRepository,
  PlannedAction,
  ResearchPlan,
  ResearchRun,
  RunCommand,
  RunEventRecord,
  SavedSourceRule,
  SourceIntervention,
} from "./contracts.ts";

export class InMemoryAgentRepository implements AgentRepository {
  readonly runs = new Map<string, ResearchRun>();
  readonly plans = new Map<string, ResearchPlan>();
  readonly commands: RunCommand[] = [];
  readonly events: RunEventRecord[] = [];
  readonly playbookSteps: ApprovedPlaybookStep[] = [];
  readonly interventions: SourceIntervention[] = [];
  readonly sourceRules: SavedSourceRule[] = [];
  readonly sourceRecords: Array<{
    id: string;
    runId: string;
    revision: number;
    actionId: string;
    source: import("./contracts.ts").SourceArtifact;
  }> = [];
  readonly evidenceRecords: Array<{
    id: string;
    runId: string;
    revision: number;
    actionId: string;
    sourceId: string;
    evidence: import("./contracts.ts").EvidenceDraft;
  }> = [];
  readonly claimRecords: Array<{
    id: string;
    runId: string;
    revision: number;
    actionId: string;
    claim: import("./contracts.ts").ClaimDraft;
    evidenceIds: string[];
  }> = [];
  #sequence = 0;

  createRun(input: Omit<ResearchRun, "status" | "planRevision" | "lastTransitionAt">): ResearchRun {
    const run: ResearchRun = {
      ...input,
      status: "draft",
      planRevision: 0,
      lastTransitionAt: new Date(0).toISOString(),
    };
    this.runs.set(run.id, clone(run));
    return clone(run);
  }

  async getRun(runId: string): Promise<ResearchRun> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Unknown run ${runId}`);
    return clone(run);
  }

  async listActiveSourceRulesForRun(runId: string): Promise<SavedSourceRule[]> {
    await this.getRun(runId);
    return this.sourceRules
      .filter((rule) => rule.active)
      .sort((left, right) => right.priority - left.priority)
      .map(clone);
  }

  async listPlaybookStepsForRun(runId: string): Promise<ApprovedPlaybookStep[]> {
    await this.getRun(runId);
    return this.playbookSteps
      .slice()
      .sort((left, right) => left.position - right.position)
      .map(clone);
  }

  async compareAndSetRun(
    runId: string,
    expectedStatus: RunStatus,
    nextState: RunState,
  ): Promise<ResearchRun> {
    const current = this.runs.get(runId);
    if (!current) throw new Error(`Unknown run ${runId}`);
    if (current.status !== expectedStatus) {
      throw new Error(
        `Concurrent run update: expected ${expectedStatus}, found ${current.status}`,
      );
    }
    const updated: ResearchRun = { ...current, ...nextState };
    this.runs.set(runId, clone(updated));
    return clone(updated);
  }

  async savePlan(plan: ResearchPlan): Promise<void> {
    const key = planKey(plan.runId, plan.revision);
    if (this.plans.has(key)) {
      throw new Error(`Plan revision ${plan.revision} already exists`);
    }
    this.plans.set(key, clone(plan));
  }

  async getPlan(runId: string, revision: number): Promise<ResearchPlan | undefined> {
    const plan = this.plans.get(planKey(runId, revision));
    return plan ? clone(plan) : undefined;
  }

  async getNextAction(
    runId: string,
    revision: number,
  ): Promise<PlannedAction | undefined> {
    const plan = this.plans.get(planKey(runId, revision));
    if (!plan) return undefined;
    const completed = new Set(
      plan.actions
        .filter((action) => action.status === "completed")
        .map((action) => action.id),
    );
    const next = plan.actions
      .filter(
        (action) =>
          action.status === "pending" &&
          action.dependsOn.every((dependency) => completed.has(dependency)),
      )
      .sort((left, right) => left.sequence - right.sequence)[0];
    return next ? clone(next) : undefined;
  }

  async updateAction(action: PlannedAction): Promise<void> {
    for (const [key, plan] of this.plans) {
      const index = plan.actions.findIndex((candidate) => candidate.id === action.id);
      if (index >= 0) {
        plan.actions[index] = clone(action);
        this.plans.set(key, plan);
        return;
      }
    }
    throw new Error(`Unknown action ${action.id}`);
  }

  async persistActionArtifacts(input: {
    runId: string;
    revision: number;
    actionId: string;
    result: import("./contracts.ts").ActionResult;
  }): Promise<void> {
    for (const source of input.result.sources) {
      const existing = this.sourceRecords.find(
        (record) =>
          record.runId === input.runId
          && record.revision === input.revision
          && record.source.canonicalUrl === source.canonicalUrl,
      );
      if (existing) {
        existing.source = clone(source);
        existing.actionId = input.actionId;
      } else {
        this.sourceRecords.push({
          id: this.#id("source"),
          runId: input.runId,
          revision: input.revision,
          actionId: input.actionId,
          source: clone(source),
        });
      }
    }

    for (const evidence of input.result.evidence) {
      const source = this.sourceRecords.find(
        (record) =>
          record.runId === input.runId
          && record.revision === input.revision
          && [record.source.originalUrl, record.source.canonicalUrl].includes(evidence.sourceUrl),
      );
      if (!source || source.source.retrievalStatus !== "available") {
        throw new Error(`Evidence source was not safely extracted: ${evidence.sourceUrl}`);
      }
      const existing = this.evidenceRecords.find(
        (record) =>
          record.runId === input.runId
          && record.revision === input.revision
          && record.evidence.sourceUrl === evidence.sourceUrl
          && record.evidence.excerpt === evidence.excerpt,
      );
      if (!existing) {
        this.evidenceRecords.push({
          id: this.#id("evidence"),
          runId: input.runId,
          revision: input.revision,
          actionId: input.actionId,
          sourceId: source.id,
          evidence: clone(evidence),
        });
      }
    }

    for (const claim of input.result.claims) {
      const evidenceIds = claim.evidence.map((evidence) => {
        const record = this.evidenceRecords.find(
          (candidate) =>
            candidate.runId === input.runId
            && candidate.revision === input.revision
            && candidate.evidence.sourceUrl === evidence.sourceUrl
            && candidate.evidence.excerpt === evidence.excerpt,
        );
        if (!record) throw new Error(`Claim references evidence that was not persisted: ${evidence.excerpt}`);
        return record.id;
      });
      this.claimRecords.push({
        id: this.#id("claim"),
        runId: input.runId,
        revision: input.revision,
        actionId: input.actionId,
        claim: clone(claim),
        evidenceIds,
      });
    }
  }

  async enqueueCommand(
    input: Omit<RunCommand, "id" | "status">,
  ): Promise<RunCommand> {
    const command: RunCommand = {
      ...clone(input),
      id: this.#id("command"),
      status: "pending",
    };
    this.commands.push(command);
    return clone(command);
  }

  async takeNextCommand(runId: string): Promise<RunCommand | undefined> {
    const command = this.commands.find(
      (candidate) => candidate.runId === runId && candidate.status === "pending",
    );
    if (!command) return undefined;
    command.status = "claimed";
    return clone(command);
  }

  async finishCommand(
    commandId: string,
    status: "applied" | "rejected",
    reason?: string,
  ): Promise<void> {
    const command = this.commands.find((candidate) => candidate.id === commandId);
    if (!command) throw new Error(`Unknown command ${commandId}`);
    command.status = status;
    command.rejectionReason = reason;
  }

  async appendEvent(event: RunEventRecord): Promise<void> {
    this.events.push(clone(event));
  }

  async createIntervention(
    input: Omit<SourceIntervention, "id" | "status">,
  ): Promise<SourceIntervention> {
    const intervention: SourceIntervention = {
      ...clone(input),
      id: this.#id("intervention"),
      status: "submitted",
    };
    this.interventions.push(intervention);
    return clone(intervention);
  }

  async getActiveIntervention(runId: string): Promise<SourceIntervention | undefined> {
    const intervention = [...this.interventions]
      .reverse()
      .find(
        (candidate) =>
          candidate.runId === runId &&
          !["rejected", "applied", "failed"].includes(candidate.status),
      );
    return intervention ? clone(intervention) : undefined;
  }

  async getLatestIntervention(runId: string): Promise<SourceIntervention | undefined> {
    const intervention = [...this.interventions]
      .reverse()
      .find((candidate) => candidate.runId === runId);
    return intervention ? clone(intervention) : undefined;
  }

  async updateIntervention(intervention: SourceIntervention): Promise<void> {
    const index = this.interventions.findIndex(
      (candidate) => candidate.id === intervention.id,
    );
    if (index < 0) throw new Error(`Unknown intervention ${intervention.id}`);
    this.interventions[index] = clone(intervention);
  }

  #id(prefix: string): string {
    this.#sequence += 1;
    return `${prefix}_${this.#sequence}`;
  }
}

function planKey(runId: string, revision: number): string {
  return `${runId}:${revision}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
