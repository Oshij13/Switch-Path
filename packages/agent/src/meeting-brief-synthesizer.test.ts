import assert from "node:assert/strict";
import test from "node:test";

import { OpenAIMeetingBriefSynthesizer } from "./meeting-brief-synthesizer.ts";

const fixedNow = "2026-08-15T12:00:00.000Z";

test("creates a cited meeting brief only from supplied claim ids", async () => {
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const synthesizer = new OpenAIMeetingBriefSynthesizer({
    apiKey: "test-key",
    now: () => fixedNow,
    fetch: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return Response.json({
        output_text: JSON.stringify({
          shortSummary: "Acme has a verified packaging target relevant to the meeting.",
          accountBrief: [{ text: "Acme targets lower packaging waste.", kind: "sourced_fact", claimIds: ["claim-1"] }],
          salesOpportunities: [{ text: "Explore lower-waste paper formats.", kind: "agent_interpretation", claimIds: ["claim-1"] }],
          discoveryQuestions: [{ text: "How will packaging targets influence paper purchasing?", kind: "agent_interpretation", claimIds: ["claim-1"] }],
          recommendedStrategy: [],
          agentSuggestions: [],
          unknowns: ["The procurement timeline is unknown."],
        }),
      });
    },
  });

  const brief = await synthesizer.generate({
    runId: "run-1",
    revision: 2,
    companyName: "Acme",
    meetingContext: "Initial packaging discovery",
    researchGoal: "Find relevant paper opportunities",
    claims: [{
      id: "claim-1",
      kind: "sourced_fact",
      statement: "Acme targets lower packaging waste.",
      evidence: [{
        id: "evidence-1",
        sourceUrl: "https://acme.example/impact",
        sourceTitle: "Acme impact",
        excerpt: "We target lower packaging waste.",
      }],
    }],
    uncertainties: ["Target date was not found."],
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(brief.accountBrief[0]?.citations[0]?.sourceUrl, "https://acme.example/impact");
  assert.deepEqual(brief.unknowns, ["The procurement timeline is unknown.", "Target date was not found."]);
});

test("refuses to present an uncited statement as supported", async () => {
  const synthesizer = new OpenAIMeetingBriefSynthesizer({
    apiKey: "test-key",
    fetch: async () => Response.json({
      output_text: JSON.stringify({
        shortSummary: "Unsupported output",
        accountBrief: [{ text: "Invented fact", kind: "sourced_fact", claimIds: [] }],
        salesOpportunities: [],
        discoveryQuestions: [],
        recommendedStrategy: [],
        agentSuggestions: [],
        unknowns: [],
      }),
    }),
  });

  await assert.rejects(
    () => synthesizer.generate({
      runId: "run-1",
      revision: 1,
      companyName: "Acme",
      meetingContext: "Discovery",
      researchGoal: "Research",
      claims: [{
        id: "claim-1",
        kind: "sourced_fact",
        statement: "Real fact",
        evidence: [{
          id: "evidence-1",
          sourceUrl: "https://acme.example",
          sourceTitle: "Acme",
          excerpt: "Real fact",
        }],
      }],
      uncertainties: [],
    }),
    /presented as supported without source evidence/,
  );
});

test("returns a transparent empty brief without calling OpenAI when no claims exist", async () => {
  let called = false;
  const synthesizer = new OpenAIMeetingBriefSynthesizer({
    apiKey: "test-key",
    now: () => fixedNow,
    fetch: async () => {
      called = true;
      return Response.json({});
    },
  });
  const brief = await synthesizer.generate({
    runId: "run-empty",
    revision: 1,
    companyName: "Empty Co",
    meetingContext: "Discovery",
    researchGoal: "Research",
    claims: [],
    uncertainties: [],
  });
  assert.equal(called, false);
  assert.equal(brief.accountBrief.length, 0);
  assert.match(brief.shortSummary, /no validated claims/i);
});
