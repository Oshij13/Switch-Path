import assert from "node:assert/strict";
import test from "node:test";

import { OpenAIEvidenceAnalyzer } from "./openai-evidence-analyzer.ts";
import type { ExtractedPublicPage } from "./public-page-extractor.ts";

test("accepts only evidence excerpts present in the extracted page", async () => {
  let captured: Record<string, unknown> | undefined;
  const analyzer = new OpenAIEvidenceAnalyzer({
    apiKey: "test-key",
    fetch: async (_input, init) => {
      captured = JSON.parse(String(init?.body));
      return structuredResponse({
        summary: "One material target was found.",
        evidence: [
          {
            sourceIndex: 0,
            excerpt: "Reduce operational emissions by 2030.",
            locator: "Climate roadmap",
            relevanceScore: 0.95,
            credibilityScore: 0.9,
          },
        ],
        uncertainties: ["Applicability to the subsidiary needs confirmation."],
      });
    },
  });

  const result = await analyzer.extractEvidence({
    companyName: "Blinkit",
    objective: "Find carbon reduction priorities",
    pages: [pageFixture()],
    signal: new AbortController().signal,
  });

  assert.equal(result.evidence[0]?.sourceUrl, "https://company.example/sustainability");
  assert.equal(result.evidence[0]?.relevanceScore, 0.95);
  assert.equal(
    ((captured?.text as { format?: { type?: string } })?.format?.type),
    "json_schema",
  );
  assert.equal(captured?.store, false);
  assert.match(String(captured?.input), /promptInjectionSignals/);
});

test("rejects a model-generated excerpt that is absent from the page", async () => {
  const analyzer = new OpenAIEvidenceAnalyzer({
    apiKey: "test-key",
    fetch: async () =>
      structuredResponse({
        summary: "Bad excerpt",
        evidence: [
          {
            sourceIndex: 0,
            excerpt: "The company promises net zero next year.",
            locator: null,
            relevanceScore: 1,
            credibilityScore: 1,
          },
        ],
        uncertainties: [],
      }),
  });

  await assert.rejects(
    () =>
      analyzer.extractEvidence({
        companyName: "Blinkit",
        objective: "Find carbon reduction priorities",
        pages: [pageFixture()],
        signal: new AbortController().signal,
      }),
    /excerpt was not found/,
  );
});

test("maps claim evidence indexes back to exact evidence records", async () => {
  let captured: Record<string, unknown> | undefined;
  const analyzer = new OpenAIEvidenceAnalyzer({
    apiKey: "test-key",
    fetch: async (_input, init) => {
      captured = JSON.parse(String(init?.body));
      return structuredResponse({
        summary: "The source supports a dated operational target.",
        claims: [
          {
            statement: "The organization states a 2030 operational-emissions target.",
            kind: "sourced_fact",
            rationale: null,
            confidence: 0.91,
            evidenceIndexes: [0],
          },
        ],
        uncertainties: [],
        recommendedNextAction: "Confirm direct applicability to Blinkit.",
      });
    },
  });
  const evidence = {
    sourceUrl: "https://company.example/sustainability",
    sourceTitle: "Sustainability",
    excerpt: "Reduce operational emissions by 2030.",
  };

  const result = await analyzer.synthesizeClaims({
    companyName: "Blinkit",
    objective: "Build the meeting claim",
    evidence: [evidence],
    signal: new AbortController().signal,
  });

  assert.deepEqual(result.claims[0]?.evidence, [evidence]);
  assert.equal(result.recommendedNextAction, "Confirm direct applicability to Blinkit.");
  assert.doesNotMatch(JSON.stringify(captured?.text), /uniqueItems/);
});

function pageFixture(): ExtractedPublicPage {
  return {
    originalUrl: "https://company.example/sustainability",
    canonicalUrl: "https://company.example/sustainability",
    domain: "company.example",
    title: "Sustainability",
    sourceKind: "public_report",
    retrievalStatus: "available",
    extractedText: "Climate roadmap\nReduce operational emissions by 2030.",
    contentHash: "a".repeat(64),
    retrievedAt: "2026-08-13T16:00:00.000Z",
    contentType: "text/html",
    truncated: false,
    promptInjectionSignals: ["ignore_previous_instructions"],
  };
}

function structuredResponse(value: unknown): Response {
  return Response.json({
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(value) }],
      },
    ],
  });
}
