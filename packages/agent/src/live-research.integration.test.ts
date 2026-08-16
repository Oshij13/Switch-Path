import assert from "node:assert/strict";
import test from "node:test";

import type {
  EvidenceDraft,
  InterventionComparator,
  PlanDraft,
  ResearchPlanner,
} from "./contracts.ts";
import { InMemoryAgentRepository } from "./in-memory-repository.ts";
import { LiveResearchExecutor } from "./live-research-executor.ts";
import { AgentOrchestrator, SequentialIdGenerator } from "./orchestrator.ts";
import type { ExtractedPublicPage } from "./public-page-extractor.ts";
import type { EvidenceAnalyzer, WebDiscoveryClient } from "./research-tools.ts";

test("orchestrator persists live sources, evidence, claims, and their links", async () => {
  const repository = new InMemoryAgentRepository();
  repository.createRun({
    id: "run_live",
    workspaceId: "workspace_1",
    companyName: "Blinkit",
    companyDomain: "blinkit.com",
    meetingContext: "Initial supplier discovery meeting",
    researchGoal: "Find evidence relevant to a sustainable paper pitch",
    salesStage: "initial_prospecting",
  });
  const page = pageFixture();
  const evidence: EvidenceDraft = {
    sourceUrl: page.canonicalUrl,
    sourceTitle: page.title,
    excerpt: "Reduce operational emissions by 2030.",
    relevanceScore: 0.95,
    credibilityScore: 0.9,
  };
  const discovery: WebDiscoveryClient = {
    async search() {
      return {
        summary: "Found an official target page.",
        sources: [
          {
            originalUrl: page.originalUrl,
            canonicalUrl: page.canonicalUrl,
            domain: page.domain,
            title: page.title,
            sourceKind: page.sourceKind,
            retrievalStatus: "pending",
            promptInjectionSignals: [],
          },
        ],
      };
    },
  };
  const analyzer: EvidenceAnalyzer = {
    async extractEvidence() {
      return { summary: "Captured one exact excerpt.", evidence: [evidence], uncertainties: [] };
    },
    async synthesizeClaims() {
      return {
        summary: "Created one sourced claim.",
        claims: [
          {
            statement: "The source states a 2030 operational-emissions target.",
            kind: "sourced_fact",
            confidence: 0.9,
            evidence: [evidence],
          },
        ],
        uncertainties: ["Confirm target-company applicability in the meeting."],
      };
    },
  };
  const executor = new LiveResearchExecutor({
    discovery,
    extractor: { async extract() { return page; } } as never,
    analyzer,
  });
  const plan: PlanDraft = {
    rationale: "Use an official source and retain exact evidence.",
    actions: [
      step("discover", "search_web", []),
      step("open", "open_public_page", ["discover"]),
      step("extract", "extract_evidence", ["open"]),
      step("claim", "create_or_update_claim", ["extract"]),
      step("finish", "complete_research", ["claim"]),
    ],
  };
  const planner: ResearchPlanner = {
    async createInitialPlan() { return plan; },
    async createRevisedPlan() { return plan; },
  };
  const comparator: InterventionComparator = {
    async compare() { throw new Error("No intervention expected"); },
  };
  const orchestrator = new AgentOrchestrator({
    repository,
    planner,
    executor,
    comparator,
    ids: new SequentialIdGenerator(),
    now: () => "2026-08-13T16:00:00.000Z",
  });

  assert.equal(await orchestrator.runUntilBlocked("run_live"), "completed");
  assert.equal(repository.sourceRecords.length, 1);
  assert.equal(repository.sourceRecords[0]?.source.retrievalStatus, "available");
  assert.equal(repository.evidenceRecords.length, 1);
  assert.equal(repository.claimRecords.length, 1);
  assert.deepEqual(
    repository.claimRecords[0]?.evidenceIds,
    [repository.evidenceRecords[0]?.id],
  );
  assert.equal(repository.claimRecords[0]?.claim.kind, "sourced_fact");
});

function step(
  key: string,
  kind: PlanDraft["actions"][number]["kind"],
  dependsOn: string[],
): PlanDraft["actions"][number] {
  return {
    key,
    kind,
    title: key,
    objective: "Find and support the target company's carbon reduction priority.",
    dependsOn,
    completionCriteria: "Return exact evidence or an explicit unknown.",
    allowedSourceKinds: ["official_company", "public_report"],
  };
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
