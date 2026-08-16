import assert from "node:assert/strict";
import test from "node:test";

import type { ResearchRun, SourceIntervention } from "./contracts.ts";
import { OpenAISourceRuleGeneralizer } from "./openai-source-rule-generalizer.ts";

test("generalizes an intervention without memorizing its exact URL", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const generalizer = new OpenAISourceRuleGeneralizer({
    apiKey: "test-key",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          title: "Prefer official sustainability and impact sources",
          domainStrategy: "target_or_verified_parent_official_domain",
          sourceCategory: "official_sustainability_or_impact",
          pathKeywords: ["sustainability", "impact", "waste", "packaging"],
          queryTemplate: "site:{official_domain} {company} {research_goal} sustainability impact",
          discoveryInstruction: "Resolve the official target or verified-parent domain and search its impact section.",
          useWhen: ["The research goal concerns sustainability or packaging."],
          applicabilityChecks: ["Confirm parent-level statements explicitly apply to the target."],
          avoidWhen: ["The source is not an official domain."],
          rationale: "The approved route added official context with scope checks.",
        }),
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const rule = await generalizer.generalize({ run: runFixture(), intervention: interventionFixture() });
  assert.equal(rule.domainStrategy, "target_or_verified_parent_official_domain");
  assert.match(rule.queryTemplate, /\{official_domain\}/);
  assert.equal(JSON.stringify(rule).includes("eternal.com"), false);
  const text = requestBody?.text as { format?: { schema?: Record<string, unknown> } };
  assert.equal(JSON.stringify(text.format?.schema).includes("uniqueItems"), false);
});

function runFixture(): ResearchRun {
  return {
    id: "run-1",
    workspaceId: "workspace-1",
    companyName: "Blinkit",
    companyDomain: "blinkit.com",
    meetingContext: "Packaging discovery",
    researchGoal: "Find sustainability priorities",
    salesStage: "initial_prospecting",
    status: "completed",
    planRevision: 2,
    lastTransitionAt: "2026-08-14T00:00:00.000Z",
  };
}

function interventionFixture(): SourceIntervention {
  return {
    id: "intervention-1",
    runId: "run-1",
    baseRevision: 1,
    resultingRevision: 2,
    proposedUrl: "https://www.eternal.com/investor-relations/impact/waste-free-world/",
    interventionType: "replace_source",
    proposedPageTitle: "Waste-free world",
    instruction: "Use this parent sustainability source with scope checks.",
    inputMode: "typed",
    status: "applied",
    comparison: {
      previousRoute: "Blinkit sources",
      proposedRoute: "Add parent sustainability context",
      retainedConclusions: [],
      conclusionsToRecheck: ["Parent applicability"],
      expectedBenefit: "Official context",
      risks: ["Parent claims may not apply"],
      recommendation: "use_as_context",
    },
  };
}
