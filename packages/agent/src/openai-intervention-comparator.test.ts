import assert from "node:assert/strict";
import test from "node:test";

import type { ResearchPlan, ResearchRun, SourceIntervention } from "./contracts.ts";
import { OpenAIInterventionComparator } from "./openai-intervention-comparator.ts";
import type { PublicPageExtractor } from "./public-page-extractor.ts";

test("compares the exact proposed page with the completed route", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const extractor = {
    async extract(input: { url: string }) {
      assert.equal(input.url, "https://example.com/sustainability");
      return {
        originalUrl: input.url,
        canonicalUrl: input.url,
        domain: "example.com",
        title: "Sustainability plan",
        sourceKind: "user_supplied" as const,
        retrievalStatus: "available" as const,
        extractedText: "The company targets lower emissions by 2030.",
        contentHash: "hash",
        retrievedAt: "2026-08-14T00:00:00.000Z",
        contentType: "text/html",
        truncated: false,
        promptInjectionSignals: [],
      };
    },
  } as unknown as PublicPageExtractor;
  const comparator = new OpenAIInterventionComparator({
    apiKey: "test-key",
    extractor,
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          previousRoute: "General public search",
          proposedRoute: "Open the supplied sustainability plan directly",
          retainedConclusions: ["The company has a sustainability program"],
          conclusionsToRecheck: ["The target year"],
          expectedBenefit: "More direct evidence",
          risks: ["Company-authored source"],
          recommendation: "use_new_route",
        }),
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const result = await comparator.compare({
    run: runFixture(),
    plan: planFixture(),
    intervention: interventionFixture(),
  });

  assert.equal(result.recommendation, "use_new_route");
  const requestInput = JSON.parse(String(requestBody?.input)) as Record<string, unknown>;
  assert.match(JSON.stringify(requestInput), /lower emissions by 2030/);
  assert.match(JSON.stringify(requestInput), /Existing conclusion/);
  const text = requestBody?.text as { format?: { schema?: Record<string, unknown> } };
  assert.equal(JSON.stringify(text.format?.schema).includes("uniqueItems"), false);
});

function runFixture(): ResearchRun {
  return {
    id: "run-1",
    workspaceId: "workspace-1",
    companyName: "Example",
    meetingContext: "Discovery meeting",
    researchGoal: "Find sustainability priorities",
    salesStage: "initial_prospecting",
    status: "paused",
    planRevision: 1,
    lastTransitionAt: "2026-08-14T00:00:00.000Z",
  };
}

function planFixture(): ResearchPlan {
  return {
    runId: "run-1",
    revision: 1,
    reason: "Initial plan",
    actions: [{
      id: "action-1",
      revision: 1,
      sequence: 1,
      kind: "extract_evidence",
      title: "Review current route",
      objective: "Find priorities",
      dependsOn: [],
      completionCriteria: "Evidence found",
      allowedSourceKinds: ["official_company"],
      status: "completed",
      result: {
        summary: "Existing conclusion",
        sources: [],
        evidence: [],
        claims: [],
        uncertainties: [],
      },
    }],
  };
}

function interventionFixture(): SourceIntervention {
  return {
    id: "intervention-1",
    runId: "run-1",
    baseRevision: 1,
    proposedUrl: "https://example.com/sustainability",
    interventionType: "add_source",
    instruction: "Use this source",
    inputMode: "typed",
    status: "submitted",
  };
}
