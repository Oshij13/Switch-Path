import assert from "node:assert/strict";
import test from "node:test";

import type {
  ActionResult,
  PlannedAction,
  ResearchPlan,
  ResearchRun,
} from "./contracts.ts";
import { LiveResearchExecutor } from "./live-research-executor.ts";
import type { ExtractedPublicPage } from "./public-page-extractor.ts";
import type { EvidenceAnalyzer, WebDiscoveryClient } from "./research-tools.ts";

test("executes discovery, safe opening, evidence extraction, and claim synthesis", async () => {
  const page = pageFixture();
  const discovery: WebDiscoveryClient = {
    async search() {
      return {
        summary: "Found the official sustainability page.",
        sources: [
          {
            originalUrl: page.originalUrl,
            canonicalUrl: page.canonicalUrl,
            domain: page.domain,
            title: page.title,
            sourceKind: "official_company",
            retrievalStatus: "pending",
            promptInjectionSignals: [],
          },
        ],
      };
    },
  };
  const evidence = {
    sourceUrl: page.canonicalUrl,
    sourceTitle: page.title,
    excerpt: "Reduce operational emissions by 2030.",
    relevanceScore: 0.95,
    credibilityScore: 0.9,
  };
  const analyzer: EvidenceAnalyzer = {
    async extractEvidence() {
      return { summary: "Extracted one target.", evidence: [evidence], uncertainties: [] };
    },
    async synthesizeClaims() {
      return {
        summary: "Built one sourced claim.",
        claims: [
          {
            statement: "The source states a 2030 operational-emissions target.",
            kind: "sourced_fact",
            confidence: 0.9,
            evidence: [evidence],
          },
        ],
        uncertainties: ["Direct subsidiary applicability needs confirmation."],
      };
    },
  };
  const executor = new LiveResearchExecutor({
    discovery,
    extractor: { async extract() { return page; } } as never,
    analyzer,
  });
  const completed: PlannedAction[] = [];

  for (const action of [
    actionFixture("search_web", 1),
    actionFixture("open_public_page", 2),
    actionFixture("extract_evidence", 3),
    actionFixture("create_or_update_claim", 4),
  ]) {
    const result = await executor.execute({
      run: runFixture(),
      plan: planFixture(),
      action,
      completedActions: completed,
      signal: new AbortController().signal,
    });
    action.status = "completed";
    action.result = result;
    completed.push(action);
  }

  assert.equal(completed[0]?.result?.sources[0]?.retrievalStatus, "pending");
  assert.equal(completed[1]?.result?.sources[0]?.retrievalStatus, "available");
  assert.equal(completed[2]?.result?.evidence[0]?.excerpt, evidence.excerpt);
  assert.equal(completed[3]?.result?.claims[0]?.kind, "sourced_fact");
});

test("records a blocked source transparently instead of inventing evidence", async () => {
  const executor = new LiveResearchExecutor({
    discovery: { async search() { throw new Error("unused"); } },
    extractor: {
      async extract() {
        throw new Error("Source resolves to a blocked network address: 10.0.0.8");
      },
    } as never,
    analyzer: {
      async extractEvidence() { throw new Error("unused"); },
      async synthesizeClaims() { throw new Error("unused"); },
    },
  });
  const discoveryAction = actionFixture("search_web", 1);
  discoveryAction.status = "completed";
  discoveryAction.result = resultFixture({
    sources: [
      {
        originalUrl: "https://malicious.example",
        canonicalUrl: "https://malicious.example/",
        domain: "malicious.example",
        title: "Candidate",
        sourceKind: "search_result",
        retrievalStatus: "pending",
        promptInjectionSignals: [],
      },
    ],
  });

  const result = await executor.execute({
    run: runFixture(),
    plan: planFixture(),
    action: actionFixture("open_public_page", 2),
    completedActions: [discoveryAction],
    signal: new AbortController().signal,
  });

  assert.equal(result.sources[0]?.retrievalStatus, "blocked");
  assert.equal(result.evidence.length, 0);
  assert.equal(result.claims.length, 0);
  assert.match(result.uncertainties[0] ?? "", /blocked network/);
});

function actionFixture(kind: PlannedAction["kind"], sequence: number): PlannedAction {
  return {
    id: `action_${sequence}`,
    revision: 1,
    sequence,
    kind,
    title: kind,
    objective: "Find and support the target company's carbon reduction priority.",
    dependsOn: [],
    completionCriteria: "Return evidence or an explicit unknown.",
    allowedSourceKinds: ["official_company", "public_report"],
    status: "pending",
  };
}

function resultFixture(overrides: Partial<ActionResult>): ActionResult {
  return {
    summary: "fixture",
    sources: [],
    evidence: [],
    claims: [],
    uncertainties: [],
    ...overrides,
  };
}

function runFixture(): ResearchRun {
  return {
    id: "run_1",
    workspaceId: "workspace_1",
    companyName: "Blinkit",
    companyDomain: "blinkit.com",
    meetingContext: "Discovery meeting",
    researchGoal: "Prepare a sourced account brief",
    salesStage: "initial_prospecting",
    status: "running",
    planRevision: 1,
    lastTransitionAt: "2026-08-13T16:00:00.000Z",
  };
}

function planFixture(): ResearchPlan {
  return { runId: "run_1", revision: 1, reason: "fixture", actions: [] };
}

function pageFixture(): ExtractedPublicPage {
  return {
    originalUrl: "https://blinkit.com/sustainability",
    canonicalUrl: "https://blinkit.com/sustainability",
    domain: "blinkit.com",
    title: "Sustainability roadmap",
    sourceKind: "official_company",
    retrievalStatus: "available",
    extractedText: "Reduce operational emissions by 2030.",
    contentHash: "a".repeat(64),
    retrievedAt: "2026-08-13T16:00:00.000Z",
    contentType: "text/html",
    truncated: false,
    promptInjectionSignals: [],
  };
}
