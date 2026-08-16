import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_AGENT_MODEL, OpenAIResearchPlanner } from "./openai-planner.ts";
import type { ApprovedPlaybookStep, ResearchRun, SavedSourceRule } from "./contracts.ts";

test("sends a strict structured-output request to the Responses API", async () => {
  let capturedUrl = "";
  let capturedBody: Record<string, unknown> | undefined;
  const planner = new OpenAIResearchPlanner({
    apiKey: "test-key",
    fetch: async (input, init) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body));
      return Response.json({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  rationale: "Start with the official account source.",
                  actions: [
                    {
                      key: "identity",
                      kind: "search_web",
                      title: "Verify identity",
                      objective: "Find the official company domain.",
                      dependsOn: [],
                      completionCriteria: "Identity is verified or unknown.",
                      allowedSourceKinds: ["official_company"],
                    },
                  ],
                }),
              },
            ],
          },
        ],
      });
    },
  });

  const plan = await planner.createInitialPlan(runFixture());

  assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
  assert.equal(capturedBody?.model, DEFAULT_AGENT_MODEL);
  assert.deepEqual(capturedBody?.reasoning, { effort: "medium" });
  assert.equal(
    ((capturedBody?.text as { format?: { type?: string } })?.format?.type),
    "json_schema",
  );
  assert.equal(plan.actions[0]?.key, "identity");
});

test("surfaces API errors without exposing the API key", async () => {
  const planner = new OpenAIResearchPlanner({
    apiKey: "secret-key-that-must-not-appear",
    fetch: async () =>
      Response.json(
        { error: { message: "rate limit reached" } },
        { status: 429 },
      ),
  });

  await assert.rejects(
    () => planner.createInitialPlan(runFixture()),
    /planning request failed \(429\): rate limit reached/,
  );
});

test("passes learned source behaviour into planning and requires it to shape discovery", async () => {
  let capturedContext: Record<string, unknown> | undefined;
  const planner = new OpenAIResearchPlanner({
    apiKey: "test-key",
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { input: string };
      capturedContext = (JSON.parse(request.input) as { context: Record<string, unknown> }).context;
      return Response.json({
        output_text: JSON.stringify({
          rationale: "Rediscover the learned sustainability route for this account.",
          actions: [
            {
              key: "learned_sustainability_route",
              kind: "search_web",
              title: "Find the current account sustainability source",
              objective: "Discover an analogous official sustainability or impact page.",
              dependsOn: [],
              completionCriteria: "The analogous official source is found or marked unavailable.",
              allowedSourceKinds: ["official_company", "public_report"],
              appliedSourceRuleIds: ["rule_1"],
              directUrl: null,
            },
          ],
        }),
      });
    },
  });

  const plan = await planner.createInitialPlan(runFixture(), [sourceRuleFixture()]);

  assert.deepEqual(plan.actions[0]?.appliedSourceRuleIds, ["rule_1"]);
  assert.deepEqual(
    (capturedContext?.learnedSourceRules as Array<Record<string, unknown>>)[0]?.learnedFromCompany,
    "Blinkit",
  );
  assert.equal(JSON.stringify(capturedContext).includes("blinkit.com/sustainability"), false);
});

test("rejects a plan that silently ignores learned source behaviour", async () => {
  const planner = new OpenAIResearchPlanner({
    apiKey: "test-key",
    fetch: async () => Response.json({
      output_text: JSON.stringify({
        rationale: "Generic route only.",
        actions: [
          {
            key: "generic_search",
            kind: "search_web",
            title: "Generic search",
            objective: "Search the company.",
            dependsOn: [],
            completionCriteria: "Search completes.",
            allowedSourceKinds: ["official_company"],
            appliedSourceRuleIds: [],
            directUrl: null,
          },
        ],
      }),
    }),
  });

  await assert.rejects(
    () => planner.createInitialPlan(runFixture(), [sourceRuleFixture()]),
    /did not apply learned source rule/,
  );
});

test("passes the selected playbook workflow into planning and preserves its step order", async () => {
  let capturedContext: Record<string, unknown> | undefined;
  const steps = playbookStepFixtures();
  const planner = new OpenAIResearchPlanner({
    apiKey: "test-key",
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { input: string };
      capturedContext = (JSON.parse(request.input) as { context: Record<string, unknown> }).context;
      return Response.json({
        output_text: JSON.stringify({
          rationale: "Adapt the approved route to this account.",
          actions: steps.map((step, index) => ({
            key: `step_${index + 1}`,
            kind: "search_web",
            title: step.title,
            objective: step.objective,
            dependsOn: index === 0 ? [] : [`step_${index}`],
            completionCriteria: "The approved workflow objective is completed or marked unknown.",
            allowedSourceKinds: ["official_company"],
            appliedSourceRuleIds: [],
            directUrl: null,
            playbookStepId: step.id,
          })),
        }),
      });
    },
  });

  const plan = await planner.createInitialPlan(runFixture(), [], steps);

  assert.deepEqual(
    plan.actions.map((action) => action.playbookStepId),
    steps.map((step) => step.id),
  );
  assert.deepEqual(
    (capturedContext?.approvedWorkflow as Array<Record<string, unknown>>).map((step) => step.id),
    steps.map((step) => step.id),
  );
});

test("rejects a plan that omits a selected playbook step", async () => {
  const steps = playbookStepFixtures();
  const planner = new OpenAIResearchPlanner({
    apiKey: "test-key",
    fetch: async () => Response.json({
      output_text: JSON.stringify({
        rationale: "Incomplete route.",
        actions: [{
          key: "step_1",
          kind: "search_web",
          title: steps[0].title,
          objective: steps[0].objective,
          dependsOn: [],
          completionCriteria: "First step completes.",
          allowedSourceKinds: ["official_company"],
          appliedSourceRuleIds: [],
          directUrl: null,
          playbookStepId: steps[0].id,
        }],
      }),
    }),
  });

  await assert.rejects(
    () => planner.createInitialPlan(runFixture(), [], steps),
    /did not preserve the selected playbook workflow/,
  );
});

function runFixture(): ResearchRun {
  return {
    id: "run_1",
    workspaceId: "workspace_1",
    companyName: "Blinkit",
    companyDomain: "blinkit.com",
    meetingContext: "Discovery meeting",
    researchGoal: "Prepare a sourced account brief",
    salesStage: "initial_prospecting",
    status: "planning",
    planRevision: 0,
    lastTransitionAt: "2026-08-13T15:00:00.000Z",
  };
}

function playbookStepFixtures(): ApprovedPlaybookStep[] {
  return [
    {
      id: "playbook_step_1",
      position: 1,
      title: "Understand the business",
      objective: "Find the official company sources.",
      instructions: "Start with the company's official site.",
      actionHint: "search_web",
      approvalRequired: false,
    },
    {
      id: "playbook_step_2",
      position: 2,
      title: "Find strategic priorities",
      objective: "Find current priorities from authoritative sources.",
      actionHint: "search_web",
      approvalRequired: false,
    },
  ];
}

function sourceRuleFixture(): SavedSourceRule {
  return {
    id: "rule_1",
    title: "Prefer official sustainability disclosures",
    priority: 100,
    active: true,
    originInterventionId: "intervention_1",
    originRunId: "run_blinkit",
    originCompanyName: "Blinkit",
    ruleDefinition: {
      title: "Prefer official sustainability disclosures",
      domainStrategy: "target_or_verified_parent_official_domain",
      sourceCategory: "official_sustainability_or_impact",
      pathKeywords: ["sustainability", "impact", "ESG"],
      queryTemplate: "site:{official_domain} sustainability impact ESG",
      discoveryInstruction: "Find the relevant official source for the current company.",
      useWhen: ["Researching sustainability priorities"],
      applicabilityChecks: ["Confirm parent-company disclosures apply to the target"],
      avoidWhen: ["The source applies to a different subsidiary"],
      rationale: "First-party disclosures provide stronger evidence.",
    },
  };
}
