import {
  canTransition,
  isResultCurrent,
  transitionRun,
  type RunEvent,
} from "../../shared/src/run-state-machine.ts";

import type {
  ActionResult,
  AgentRepository,
  IdGenerator,
  InterventionType,
  InterventionComparator,
  OrchestratorOutcome,
  PlanDraft,
  PlannedAction,
  ResearchActionExecutor,
  ResearchPlan,
  ResearchPlanner,
  ResearchRun,
  RunCommand,
  SourceIntervention,
} from "./contracts.ts";

export type AgentOrchestratorDependencies = {
  repository: AgentRepository;
  planner: ResearchPlanner;
  executor: ResearchActionExecutor;
  comparator: InterventionComparator;
  ids: IdGenerator;
  now?: () => string;
};

export class AgentOrchestrator {
  readonly #repository: AgentRepository;
  readonly #planner: ResearchPlanner;
  readonly #executor: ResearchActionExecutor;
  readonly #comparator: InterventionComparator;
  readonly #ids: IdGenerator;
  readonly #now: () => string;
  readonly #activeActions = new Map<string, AbortController>();

  constructor(dependencies: AgentOrchestratorDependencies) {
    this.#repository = dependencies.repository;
    this.#planner = dependencies.planner;
    this.#executor = dependencies.executor;
    this.#comparator = dependencies.comparator;
    this.#ids = dependencies.ids;
    this.#now = dependencies.now ?? (() => new Date().toISOString());
  }

  async tick(runId: string): Promise<OrchestratorOutcome> {
    let run = await this.#repository.getRun(runId);
    const command = await this.#repository.takeNextCommand(runId);

    if (command) {
      return this.#applyCommand(run, command);
    }

    switch (run.status) {
      case "draft":
        await this.#move(run, { type: "START", at: this.#now() }, "run.started");
        return "progressed";
      case "planning":
        return this.#createInitialPlan(run);
      case "running":
        return this.#executeNextAction(run);
      case "pause_requested":
        await this.#move(
          run,
          { type: "REACH_SAFE_CHECKPOINT", at: this.#now() },
          "run.paused",
        );
        return "paused";
      case "paused":
        return "paused";
      case "comparing":
        return this.#compareIntervention(run);
      case "awaiting_approval":
        return "awaiting_approval";
      case "replanning":
        return this.#createRevisedPlan(run);
      case "completed":
        return "completed";
      case "failed":
        return "failed";
      case "cancelled":
        return "cancelled";
    }
  }

  async enqueueCommand(
    command: Omit<RunCommand, "id" | "status">,
  ): Promise<RunCommand> {
    const saved = await this.#repository.enqueueCommand(command);
    if (command.kind === "pause" || command.kind === "cancel") {
      this.#activeActions.get(command.runId)?.abort(command.kind);
    }
    return saved;
  }

  async runUntilBlocked(runId: string, maxTicks = 100): Promise<OrchestratorOutcome> {
    for (let index = 0; index < maxTicks; index += 1) {
      const outcome = await this.tick(runId);
      if (outcome !== "progressed") {
        return outcome;
      }
    }

    throw new Error(`Run ${runId} exceeded the ${maxTicks}-tick safety limit`);
  }

  async #createInitialPlan(run: ResearchRun): Promise<OrchestratorOutcome> {
    try {
      const [sourceRules, playbookSteps] = await Promise.all([
        this.#repository.listActiveSourceRulesForRun(run.id),
        this.#repository.listPlaybookStepsForRun(run.id),
      ]);
      const draft = await this.#planner.createInitialPlan(run, sourceRules, playbookSteps);
      const plan = this.#materializePlan(
        run,
        draft,
        1,
        sourceRules.length > 0
          ? `Initial approved playbook plan with ${sourceRules.length} learned source route${sourceRules.length === 1 ? "" : "s"}`
          : "Initial approved playbook plan",
      );
      await this.#repository.savePlan(plan);
      await this.#move(
        run,
        { type: "PLAN_SAVED", at: this.#now() },
        "plan.created",
        {
          actionCount: plan.actions.length,
          revision: 1,
          learnedSourceRules: sourceRules.map((rule) => ({
            id: rule.id,
            title: rule.title,
            originCompanyName: rule.originCompanyName,
          })),
          playbookSteps: playbookSteps.map((step) => ({
            id: step.id,
            position: step.position,
            title: step.title,
          })),
        },
      );
      return "progressed";
    } catch (error) {
      return this.#fail(run, error);
    }
  }

  async #createRevisedPlan(run: ResearchRun): Promise<OrchestratorOutcome> {
    try {
      const intervention = await this.#requireIntervention(run.id);
      if (!intervention.comparison) {
        throw new Error("Approved intervention has no comparison");
      }
      const previousPlan = await this.#requirePlan(run.id, run.planRevision - 1);
      const draft = await this.#planner.createRevisedPlan({
        run,
        previousPlan,
        intervention,
        comparison: intervention.comparison,
      });
      const plan = this.#materializePlan(
        run,
        draft,
        run.planRevision,
        `Approved source intervention ${intervention.id}`,
      );
      await this.#repository.savePlan(plan);
      await this.#move(
        run,
        { type: "REPLAN_SAVED", at: this.#now() },
        "plan.revised",
        { actionCount: plan.actions.length, revision: run.planRevision },
      );
      intervention.status = "applied";
      intervention.resultingRevision = run.planRevision;
      await this.#repository.updateIntervention(intervention);
      return "progressed";
    } catch (error) {
      return this.#fail(run, error);
    }
  }

  async #executeNextAction(run: ResearchRun): Promise<OrchestratorOutcome> {
    const plan = await this.#requirePlan(run.id, run.planRevision);
    const action = await this.#repository.getNextAction(run.id, run.planRevision);

    if (!action) {
      const pending = plan.actions.some((candidate) => candidate.status === "pending");
      if (pending) {
        return this.#fail(run, new Error("Research plan has an unresolved dependency"));
      }

      await this.#move(run, { type: "COMPLETE", at: this.#now() }, "run.completed");
      return "completed";
    }

    action.status = "running";
    await this.#repository.updateAction(action);
    await this.#event(run, "action.started", {
      actionId: action.id,
      kind: action.kind,
      title: action.title,
    });

    const controller = new AbortController();
    this.#activeActions.set(run.id, controller);
    try {
      const currentPlan = await this.#requirePlan(run.id, run.planRevision);
      const completedActions = currentPlan.actions.filter(
        (candidate) => candidate.status === "completed",
      );
      const result = await this.#executor.execute({
        run,
        plan: currentPlan,
        action,
        completedActions,
        signal: controller.signal,
      });
      assertActionResult(result);

      const currentRun = await this.#repository.getRun(run.id);
      if (!isResultCurrent(action.revision, currentRun)) {
        action.status = "discarded";
        await this.#repository.updateAction(action);
        await this.#event(currentRun, "action.discarded", {
          actionId: action.id,
          actionRevision: action.revision,
          currentRevision: currentRun.planRevision,
        });
        return "progressed";
      }

      await this.#repository.persistActionArtifacts({
        runId: run.id,
        revision: action.revision,
        actionId: action.id,
        result,
      });
      action.status = "completed";
      action.result = result;
      await this.#repository.updateAction(action);
      await this.#event(currentRun, "action.completed", {
        actionId: action.id,
        claimCount: result.claims.length,
        uncertaintyCount: result.uncertainties.length,
      });
      return "progressed";
    } catch (error) {
      if (controller.signal.aborted) {
        action.status = "pending";
        action.errorMessage = undefined;
        await this.#repository.updateAction(action);
        await this.#event(await this.#repository.getRun(run.id), "action.interrupted", {
          actionId: action.id,
          reason: String(controller.signal.reason ?? "control command"),
        });
        return "progressed";
      }
      action.status = "failed";
      action.errorMessage = errorMessage(error);
      await this.#repository.updateAction(action);
      return this.#fail(await this.#repository.getRun(run.id), error);
    } finally {
      if (this.#activeActions.get(run.id) === controller) {
        this.#activeActions.delete(run.id);
      }
    }
  }

  async #compareIntervention(run: ResearchRun): Promise<OrchestratorOutcome> {
    try {
      const intervention = await this.#requireIntervention(run.id);
      const plan = await this.#requirePlan(run.id, run.planRevision);
      intervention.status = "comparing";
      await this.#repository.updateIntervention(intervention);
      intervention.comparison = await this.#comparator.compare({
        run,
        plan,
        intervention,
      });
      intervention.status = "awaiting_approval";
      await this.#repository.updateIntervention(intervention);
      await this.#move(
        run,
        { type: "COMPARISON_READY", at: this.#now() },
        "intervention.compared",
        { interventionId: intervention.id, recommendation: intervention.comparison.recommendation },
      );
      return "awaiting_approval";
    } catch (error) {
      return this.#fail(run, error);
    }
  }

  async #applyCommand(
    run: ResearchRun,
    command: RunCommand,
  ): Promise<OrchestratorOutcome> {
    try {
      switch (command.kind) {
        case "pause":
          await this.#move(
            run,
            { type: "REQUEST_PAUSE", at: this.#now() },
            "run.pause_requested",
          );
          break;
        case "resume":
          await this.#move(run, { type: "RESUME", at: this.#now() }, "run.resumed");
          break;
        case "cancel":
          await this.#move(run, { type: "CANCEL", at: this.#now() }, "run.cancelled");
          break;
        case "retry":
          transitionRun(run, { type: "RETRY", at: this.#now() });
          if (run.planRevision > 0) {
            const plan = await this.#repository.getPlan(run.id, run.planRevision);
            for (const action of plan?.actions ?? []) {
              if (action.status !== "failed") continue;
              action.status = "pending";
              action.errorMessage = undefined;
              await this.#repository.updateAction(action);
            }
          }
          await this.#move(run, { type: "RETRY", at: this.#now() }, "run.retried");
          break;
        case "submit_source":
          await this.#submitSource(run, command);
          break;
        case "approve_route":
          await this.#decideRoute(run, true);
          break;
        case "reject_route":
          await this.#decideRoute(run, false);
          break;
        case "undo_intervention":
          await this.#undoLatestIntervention(run);
          break;
      }
      await this.#repository.finishCommand(command.id, "applied");
      return "progressed";
    } catch (error) {
      await this.#repository.finishCommand(command.id, "rejected", errorMessage(error));
      await this.#event(run, "command.rejected", {
        commandId: command.id,
        kind: command.kind,
        reason: errorMessage(error),
      });
      return this.#outcomeFor(run.status);
    }
  }

  async #submitSource(run: ResearchRun, command: RunCommand): Promise<void> {
    const proposedUrl = requiredString(command.payload, "proposedUrl");
    const instruction = requiredString(command.payload, "instruction");
    const inputMode = command.payload.inputMode === "voice" ? "voice" : "typed";
    const interventionType = interventionTypeValue(command.payload.interventionType);
    transitionRun(run, { type: "SUBMIT_SOURCE", at: this.#now() });
    const intervention = await this.#repository.createIntervention({
      runId: run.id,
      requestedBy: command.issuedBy,
      baseRevision: run.planRevision,
      proposedUrl,
      proposedPageTitle: optionalString(command.payload.proposedPageTitle),
      selectedText: optionalString(command.payload.selectedText),
      interventionType,
      instruction,
      inputMode,
    });
    await this.#move(
      run,
      { type: "SUBMIT_SOURCE", at: this.#now() },
      "intervention.submitted",
      { interventionId: intervention.id, proposedUrl },
    );
  }

  async #decideRoute(run: ResearchRun, approved: boolean): Promise<void> {
    const intervention = await this.#requireIntervention(run.id);
    transitionRun(run, {
      type: approved ? "APPROVE_ROUTE" : "REJECT_ROUTE",
      at: this.#now(),
    });
    intervention.status = approved ? "approved" : "rejected";
    await this.#repository.updateIntervention(intervention);
    await this.#move(
      run,
      {
        type: approved ? "APPROVE_ROUTE" : "REJECT_ROUTE",
        at: this.#now(),
      },
      approved ? "intervention.approved" : "intervention.rejected",
      { interventionId: intervention.id },
    );
  }

  async #undoLatestIntervention(run: ResearchRun): Promise<void> {
    if (run.status !== "paused") {
      throw new Error("Pause research before undoing an applied intervention");
    }
    const intervention = await this.#repository.getLatestIntervention(run.id);
    if (!intervention || intervention.status !== "applied") {
      throw new Error("There is no applied intervention to undo");
    }
    if (intervention.undoneAt) throw new Error("The latest intervention has already been undone");
    if (intervention.resultingRevision !== run.planRevision) {
      throw new Error("Only the intervention that produced the current revision can be undone");
    }
    const basePlan = await this.#requirePlan(run.id, intervention.baseRevision);
    const keysById = new Map(basePlan.actions.map((action) => [action.id, `restore_${action.sequence}`]));
    const draft: PlanDraft = {
      rationale: `Restore the route from revision ${intervention.baseRevision}`,
      actions: basePlan.actions.map((action) => ({
        key: keysById.get(action.id)!,
        kind: action.kind,
        title: action.title,
        objective: action.objective,
        dependsOn: action.dependsOn.map((dependencyId) => {
          const key = keysById.get(dependencyId);
          if (!key) throw new Error("The original route contains an unknown dependency");
          return key;
        }),
        completionCriteria: action.completionCriteria,
        allowedSourceKinds: action.allowedSourceKinds,
        appliedSourceRuleIds: action.appliedSourceRuleIds,
        directUrl: action.directUrl,
        playbookStepId: action.playbookStepId,
      })),
    };

    let current = await this.#move(
      run,
      { type: "SUBMIT_SOURCE", at: this.#now() },
      "intervention.undo_started",
      { interventionId: intervention.id, restoringRevision: intervention.baseRevision },
    );
    current = await this.#move(
      current,
      { type: "COMPARISON_READY", at: this.#now() },
      "intervention.undo_confirmed",
      { interventionId: intervention.id },
    );
    current = await this.#move(
      current,
      { type: "APPROVE_ROUTE", at: this.#now() },
      "intervention.undo_revision_created",
      { interventionId: intervention.id },
    );
    const restoredPlan = this.#materializePlan(
      current,
      draft,
      current.planRevision,
      `Undo intervention ${intervention.id}`,
    );
    await this.#repository.savePlan(restoredPlan);
    current = await this.#move(
      current,
      { type: "REPLAN_SAVED", at: this.#now() },
      "plan.restored",
      { interventionId: intervention.id, revision: current.planRevision },
    );
    intervention.undoneAt = this.#now();
    intervention.undoRunId = run.id;
    intervention.undoRevision = current.planRevision;
    await this.#repository.updateIntervention(intervention);
    await this.#event(current, "intervention.undone", {
      interventionId: intervention.id,
      restoredFromRevision: intervention.baseRevision,
      undoRevision: current.planRevision,
    });
  }

  #materializePlan(
    run: ResearchRun,
    draft: PlanDraft,
    revision: number,
    reason: string,
  ): ResearchPlan {
    if (draft.actions.length === 0 || draft.actions.length > 12) {
      throw new Error("A research plan must contain between 1 and 12 actions");
    }

    const keys = new Set<string>();
    const idsByKey = new Map<string, string>();
    const sequenceByKey = new Map<string, number>();
    for (const [index, action] of draft.actions.entries()) {
      if (!action.key || keys.has(action.key)) {
        throw new Error(`Plan action key must be unique: ${action.key || "<empty>"}`);
      }
      keys.add(action.key);
      idsByKey.set(action.key, this.#ids.next("action"));
      sequenceByKey.set(action.key, index + 1);
    }

    const actions: PlannedAction[] = draft.actions.map((action, index) => {
      const dependencies = action.dependsOn.map((key) => {
        const dependency = idsByKey.get(key);
        if (!dependency) {
          throw new Error(`Unknown action dependency: ${key}`);
        }
        if ((sequenceByKey.get(key) ?? 0) >= index + 1) {
          throw new Error(`Action ${action.key} depends on a non-earlier action: ${key}`);
        }
        return dependency;
      });
      return {
        id: idsByKey.get(action.key)!,
        revision,
        sequence: index + 1,
        kind: action.kind,
        title: action.title,
        objective: action.objective,
        dependsOn: dependencies,
        completionCriteria: action.completionCriteria,
        allowedSourceKinds: action.allowedSourceKinds,
        appliedSourceRuleIds: action.appliedSourceRuleIds ?? [],
        directUrl: action.directUrl,
        playbookStepId: action.playbookStepId,
        status: "pending",
      };
    });

    return {
      runId: run.id,
      revision,
      reason: `${reason}: ${draft.rationale}`,
      actions,
    };
  }

  async #move(
    run: ResearchRun,
    event: RunEvent,
    eventType: string,
    payload?: Record<string, unknown>,
  ): Promise<ResearchRun> {
    const next = transitionRun(run, event);
    const updated = await this.#repository.compareAndSetRun(run.id, run.status, next);
    await this.#event(updated, eventType, payload);
    return updated;
  }

  async #fail(run: ResearchRun, error: unknown): Promise<OrchestratorOutcome> {
    if (!canTransition(run.status, "FAIL")) {
      return this.#outcomeFor(run.status);
    }
    await this.#move(
      run,
      { type: "FAIL", at: this.#now(), message: errorMessage(error) },
      "run.failed",
      { message: errorMessage(error) },
    );
    return "failed";
  }

  async #event(
    run: ResearchRun,
    type: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await this.#repository.appendEvent({
      runId: run.id,
      revision: run.planRevision,
      type,
      payload,
    });
  }

  async #requirePlan(runId: string, revision: number): Promise<ResearchPlan> {
    const plan = await this.#repository.getPlan(runId, revision);
    if (!plan) {
      throw new Error(`Missing plan revision ${revision} for run ${runId}`);
    }
    return plan;
  }

  async #requireIntervention(runId: string): Promise<SourceIntervention> {
    const intervention = await this.#repository.getActiveIntervention(runId);
    if (!intervention) {
      throw new Error(`Run ${runId} has no active source intervention`);
    }
    return intervention;
  }

  #outcomeFor(status: ResearchRun["status"]): OrchestratorOutcome {
    if (status === "paused" || status === "pause_requested") return "paused";
    if (status === "awaiting_approval") return "awaiting_approval";
    if (status === "completed") return "completed";
    if (status === "failed") return "failed";
    if (status === "cancelled") return "cancelled";
    return "idle";
  }
}

export class SequentialIdGenerator implements IdGenerator {
  #value = 0;

  next(prefix: string): string {
    this.#value += 1;
    return `${prefix}_${this.#value}`;
  }
}

export class UuidGenerator implements IdGenerator {
  next(_prefix: string): string {
    return crypto.randomUUID();
  }
}

function assertActionResult(result: ActionResult): void {
  if (!result.summary.trim()) {
    throw new Error("Action result requires a summary");
  }
  for (const source of result.sources) {
    assertPublicArtifactUrl(source.originalUrl, "source original URL");
    assertPublicArtifactUrl(source.canonicalUrl, "source canonical URL");
    if (
      source.retrievalStatus === "available"
      && (!source.extractedText || !source.contentHash || !source.retrievedAt)
    ) {
      throw new Error("An available source requires extracted text, hash, and retrieval time");
    }
  }
  for (const evidence of result.evidence) {
    assertPublicArtifactUrl(evidence.sourceUrl, "evidence source URL");
    if (!evidence.excerpt.trim()) throw new Error("Evidence requires a non-empty excerpt");
    for (const [field, value] of [
      ["relevance", evidence.relevanceScore],
      ["credibility", evidence.credibilityScore],
    ] as const) {
      if (value !== undefined && (value < 0 || value > 1)) {
        throw new Error(`Evidence ${field} score must be between 0 and 1`);
      }
    }
  }
  for (const claim of result.claims) {
    if (claim.confidence !== undefined && (claim.confidence < 0 || claim.confidence > 1)) {
      throw new Error("Claim confidence must be between 0 and 1");
    }
    if (claim.kind === "sourced_fact" && claim.evidence.length === 0) {
      throw new Error("A sourced fact requires evidence");
    }
    if (claim.kind === "agent_interpretation") {
      if (!claim.rationale?.trim() || claim.evidence.length === 0) {
        throw new Error("An agent interpretation requires rationale and evidence");
      }
    }
  }
}

function assertPublicArtifactUrl(value: string, label: string): void {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error(`${label} must be an HTTP or HTTPS URL`);
  }
}

function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Command payload requires ${key}`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function interventionTypeValue(value: unknown): InterventionType {
  if (
    value === "add_source"
    || value === "replace_source"
    || value === "change_objective"
    || value === "challenge_conclusion"
  ) {
    return value;
  }
  return "add_source";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
