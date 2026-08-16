import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryAgentRepository } from "./in-memory-repository.ts";
import { AgentOrchestrator, SequentialIdGenerator } from "./orchestrator.ts";
import type {
  ActionResult,
  InterventionComparator,
  PlanDraft,
  ResearchActionExecutor,
  ResearchPlanner,
  SavedSourceRule,
} from "./contracts.ts";

const now = "2026-08-13T15:00:00.000Z";

test("executes a bounded plan one action at a time and completes", async () => {
  const fixture = createFixture();

  const outcome = await fixture.orchestrator.runUntilBlocked("run_1");

  assert.equal(outcome, "completed");
  const run = await fixture.repository.getRun("run_1");
  assert.equal(run.status, "completed");
  assert.equal(run.planRevision, 1);
  const plan = await fixture.repository.getPlan("run_1", 1);
  assert.deepEqual(
    plan?.actions.map((action) => action.status),
    ["completed", "completed"],
  );
  assert.deepEqual(
    fixture.repository.events.map((event) => event.type),
    [
      "run.started",
      "plan.created",
      "action.started",
      "action.completed",
      "action.started",
      "action.completed",
      "run.completed",
    ],
  );
});

test("loads active learned routes before creating the next account plan", async () => {
  let receivedRules: SavedSourceRule[] = [];
  const planner: ResearchPlanner = {
    async createInitialPlan(_run, sourceRules) {
      receivedRules = sourceRules;
      return {
        rationale: "Apply the learned route to the new account.",
        actions: [
          {
            key: "learned_route",
            kind: "search_web",
            title: "Rediscover the learned route",
            objective: "Find the analogous official source for the current company.",
            dependsOn: [],
            completionCriteria: "The analogous source is found or marked unavailable.",
            allowedSourceKinds: ["official_company", "public_report"],
            appliedSourceRuleIds: ["rule_1"],
          },
        ],
      };
    },
    async createRevisedPlan() {
      throw new Error("Not used in this test");
    },
  };
  const fixture = createFixture({ planner });
  fixture.repository.sourceRules.push(sourceRuleFixture());

  assert.equal(await fixture.orchestrator.runUntilBlocked("run_1"), "completed");
  assert.equal(receivedRules[0]?.originCompanyName, "Blinkit");
  const plan = await fixture.repository.getPlan("run_1", 1);
  assert.deepEqual(plan?.actions[0]?.appliedSourceRuleIds, ["rule_1"]);
  const planEvent = fixture.repository.events.find((event) => event.type === "plan.created");
  assert.deepEqual(planEvent?.payload?.learnedSourceRules, [
    { id: "rule_1", title: "Prefer official sustainability disclosures", originCompanyName: "Blinkit" },
  ]);
});

test("demonstrates pause, source comparison, approval, replan, and resume", async () => {
  const fixture = createFixture();

  await fixture.orchestrator.tick("run_1");
  await fixture.orchestrator.tick("run_1");
  await fixture.orchestrator.tick("run_1");
  await fixture.repository.enqueueCommand({
    runId: "run_1",
    kind: "pause",
    payload: {},
  });

  assert.equal(await fixture.orchestrator.runUntilBlocked("run_1"), "paused");
  let run = await fixture.repository.getRun("run_1");
  assert.equal(run.status, "paused");
  assert.equal(run.resumeStatus, "running");
  const originalPlan = await fixture.repository.getPlan("run_1", 1);
  assert.deepEqual(
    originalPlan?.actions.map((action) => action.status),
    ["completed", "pending"],
  );

  await fixture.repository.enqueueCommand({
    runId: "run_1",
    kind: "submit_source",
    payload: {
      proposedUrl: "https://example.com/sustainability",
      proposedPageTitle: "Sustainability roadmap",
      instruction: "Use this source to evaluate the prospect's carbon reduction priority.",
      inputMode: "voice",
    },
  });

  assert.equal(
    await fixture.orchestrator.runUntilBlocked("run_1"),
    "awaiting_approval",
  );
  run = await fixture.repository.getRun("run_1");
  assert.equal(run.status, "awaiting_approval");
  assert.equal(run.planRevision, 1);
  assert.equal(fixture.repository.interventions[0]?.comparison?.recommendation, "use_new_route");

  await fixture.repository.enqueueCommand({
    runId: "run_1",
    kind: "approve_route",
    payload: {},
  });

  assert.equal(await fixture.orchestrator.runUntilBlocked("run_1"), "completed");
  run = await fixture.repository.getRun("run_1");
  assert.equal(run.status, "completed");
  assert.equal(run.planRevision, 2);
  const revisedPlan = await fixture.repository.getPlan("run_1", 2);
  assert.equal(revisedPlan?.actions.length, 1);
  assert.equal(revisedPlan?.actions[0]?.status, "completed");
  assert.equal(fixture.repository.interventions[0]?.status, "applied");

  const eventTypes = fixture.repository.events.map((event) => event.type);
  assert.deepEqual(
    eventTypes.filter((type) =>
      [
        "run.pause_requested",
        "run.paused",
        "intervention.submitted",
        "intervention.compared",
        "intervention.approved",
        "plan.revised",
      ].includes(type),
    ),
    [
      "run.pause_requested",
      "run.paused",
      "intervention.submitted",
      "intervention.compared",
      "intervention.approved",
      "plan.revised",
    ],
  );
});

test("undoes the latest applied intervention by restoring the prior route as a new revision", async () => {
  const fixture = createFixture();

  await fixture.orchestrator.tick("run_1");
  await fixture.orchestrator.tick("run_1");
  await fixture.orchestrator.tick("run_1");
  await fixture.repository.enqueueCommand({ runId: "run_1", kind: "pause", payload: {} });
  assert.equal(await fixture.orchestrator.runUntilBlocked("run_1"), "paused");

  await fixture.repository.enqueueCommand({
    runId: "run_1",
    kind: "submit_source",
    payload: {
      proposedUrl: "https://example.com/impact",
      instruction: "Replace the current source with this official impact report.",
      interventionType: "replace_source",
      selectedText: "Net-zero packaging target",
      inputMode: "typed",
    },
  });
  assert.equal(await fixture.orchestrator.runUntilBlocked("run_1"), "awaiting_approval");
  assert.equal(fixture.repository.interventions[0]?.interventionType, "replace_source");
  assert.equal(fixture.repository.interventions[0]?.selectedText, "Net-zero packaging target");

  await fixture.repository.enqueueCommand({ runId: "run_1", kind: "approve_route", payload: {} });
  await fixture.orchestrator.tick("run_1");
  await fixture.orchestrator.tick("run_1");
  let run = await fixture.repository.getRun("run_1");
  assert.equal(run.planRevision, 2);
  assert.equal(run.status, "running");

  await fixture.repository.enqueueCommand({ runId: "run_1", kind: "pause", payload: {} });
  assert.equal(await fixture.orchestrator.runUntilBlocked("run_1"), "paused");
  await fixture.repository.enqueueCommand({ runId: "run_1", kind: "undo_intervention", payload: {} });
  assert.equal(await fixture.orchestrator.runUntilBlocked("run_1"), "completed");

  run = await fixture.repository.getRun("run_1");
  const restoredPlan = await fixture.repository.getPlan("run_1", 3);
  assert.equal(run.planRevision, 3);
  assert.deepEqual(restoredPlan?.actions.map((action) => action.title), [
    "Verify account identity",
    "Build strategic-priority claim",
  ]);
  assert.equal(fixture.repository.interventions[0]?.undoRevision, 3);
  assert.equal(fixture.repository.interventions[0]?.undoRunId, "run_1");
  assert.equal(Boolean(fixture.repository.interventions[0]?.undoneAt), true);
  assert.equal(fixture.repository.events.some((event) => event.type === "intervention.undone"), true);
});

test("rejects an unsupported sourced fact instead of persisting it", async () => {
  const fixture = createFixture({
    executor: {
      async execute() {
        return {
          summary: "Claim without proof",
          sources: [],
          evidence: [],
          claims: [
            {
              statement: "Unsupported fact",
              kind: "sourced_fact",
              evidence: [],
            },
          ],
          uncertainties: [],
        };
      },
    },
  });

  assert.equal(await fixture.orchestrator.runUntilBlocked("run_1"), "failed");
  const run = await fixture.repository.getRun("run_1");
  assert.equal(run.status, "failed");
  assert.match(run.failureMessage ?? "", /requires evidence/);
});

test("a pause command aborts an in-flight action and safely retries it later", async () => {
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const fixture = createFixture({
    executor: {
      async execute({ signal }) {
        signalStarted();
        return new Promise<ActionResult>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Interrupted", "AbortError")),
            { once: true },
          );
        });
      },
    },
  });

  await fixture.orchestrator.tick("run_1");
  await fixture.orchestrator.tick("run_1");
  const activeTick = fixture.orchestrator.tick("run_1");
  await started;
  await fixture.orchestrator.enqueueCommand({
    runId: "run_1",
    kind: "pause",
    payload: {},
  });

  assert.equal(await activeTick, "progressed");
  assert.equal(await fixture.orchestrator.runUntilBlocked("run_1"), "paused");
  const plan = await fixture.repository.getPlan("run_1", 1);
  assert.equal(plan?.actions[0]?.status, "pending");
  assert.equal(
    fixture.repository.events.some((event) => event.type === "action.interrupted"),
    true,
  );
});

test("rejects invalid commands without corrupting the run", async () => {
  const fixture = createFixture();
  await fixture.orchestrator.tick("run_1");
  await fixture.repository.enqueueCommand({
    runId: "run_1",
    kind: "resume",
    payload: {},
  });

  assert.equal(await fixture.orchestrator.tick("run_1"), "idle");
  const run = await fixture.repository.getRun("run_1");
  assert.equal(run.status, "planning");
  assert.equal(fixture.repository.commands[0]?.status, "rejected");
  assert.match(
    fixture.repository.commands[0]?.rejectionReason ?? "",
    /Invalid research-run transition/,
  );
});

function createFixture(overrides?: {
  executor?: ResearchActionExecutor;
  planner?: ResearchPlanner;
}) {
  const repository = new InMemoryAgentRepository();
  repository.createRun({
    id: "run_1",
    workspaceId: "workspace_1",
    companyName: "Blinkit",
    companyDomain: "blinkit.com",
    meetingContext: "Initial discovery meeting",
    researchGoal: "Find strategic priorities relevant to sustainable paper supply",
    salesStage: "initial_prospecting",
  });

  const initialPlan: PlanDraft = {
    rationale: "Verify the account before forming a sales hypothesis.",
    actions: [
      {
        key: "identity",
        kind: "search_web",
        title: "Verify account identity",
        objective: "Confirm the official company identity and domain.",
        dependsOn: [],
        completionCriteria: "Official identity is confirmed or marked unknown.",
        allowedSourceKinds: ["official_company"],
      },
      {
        key: "priority",
        kind: "create_or_update_claim",
        title: "Build strategic-priority claim",
        objective: "Connect verified priorities to the meeting goal.",
        dependsOn: ["identity"],
        completionCriteria: "A sourced claim or explicit unknown is recorded.",
        allowedSourceKinds: ["official_company", "public_report"],
      },
    ],
  };

  const revisedPlan: PlanDraft = {
    rationale: "Use the approved sustainability route for the affected conclusion.",
    actions: [
      {
        key: "recheck_priority",
        kind: "create_or_update_claim",
        title: "Recheck sustainability priority",
        objective: "Use the approved source to rebuild the affected claim.",
        dependsOn: [],
        completionCriteria: "The changed claim is sourced or marked unknown.",
        allowedSourceKinds: ["official_company", "user_supplied"],
      },
    ],
  };

  const planner: ResearchPlanner = overrides?.planner ?? {
    async createInitialPlan() {
      return initialPlan;
    },
    async createRevisedPlan() {
      return revisedPlan;
    },
  };
  const executor = overrides?.executor ?? new FixtureExecutor();
  const comparator: InterventionComparator = {
    async compare() {
      return {
        previousRoute: "General company search",
        proposedRoute: "Official sustainability roadmap",
        retainedConclusions: ["Account identity"],
        conclusionsToRecheck: ["Sustainability priority"],
        expectedBenefit: "More direct evidence for the meeting hypothesis",
        risks: ["Confirm that the roadmap applies to Blinkit"],
        recommendation: "use_new_route",
      };
    },
  };
  const orchestrator = new AgentOrchestrator({
    repository,
    planner,
    executor,
    comparator,
    ids: new SequentialIdGenerator(),
    now: () => now,
  });
  return { repository, orchestrator };
}

function sourceRuleFixture(): SavedSourceRule {
  return {
    id: "rule_1",
    title: "Prefer official sustainability disclosures",
    priority: 100,
    active: true,
    originInterventionId: "intervention_blinkit",
    originRunId: "run_blinkit",
    originCompanyName: "Blinkit",
    ruleDefinition: {
      title: "Prefer official sustainability disclosures",
      domainStrategy: "target_or_verified_parent_official_domain",
      sourceCategory: "official_sustainability_or_impact",
      pathKeywords: ["sustainability", "impact", "ESG"],
      queryTemplate: "site:{official_domain} sustainability impact ESG",
      discoveryInstruction: "Rediscover the relevant source for each current company.",
      useWhen: ["Researching sustainability priorities"],
      applicabilityChecks: ["Confirm parent-company applicability"],
      avoidWhen: ["The source concerns another subsidiary"],
      rationale: "First-party evidence is stronger.",
    },
  };
}

class FixtureExecutor implements ResearchActionExecutor {
  async execute(): Promise<ActionResult> {
    return {
      summary: "Bounded action completed",
      sources: [],
      evidence: [],
      claims: [
        {
          statement: "A research hypothesis remains to be verified.",
          kind: "unsupported_hypothesis",
          evidence: [],
        },
      ],
      uncertainties: ["Live public evidence is added in the research-tools step."],
    };
  }
}
