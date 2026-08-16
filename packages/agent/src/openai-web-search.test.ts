import assert from "node:assert/strict";
import test from "node:test";

import { OpenAIWebDiscovery } from "./openai-web-search.ts";

test("uses hosted web search and preserves cited candidate URLs", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const client = new OpenAIWebDiscovery({
    apiKey: "test-key",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({
        output: [
          {
            type: "web_search_call",
            action: {
              type: "search",
              sources: [
                { type: "url", url: "https://blinkit.com/about" },
                { type: "url", url: "https://blinkit.com/about" },
              ],
            },
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "The official account page is the strongest starting point.",
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://blinkit.com/about",
                    title: "About Blinkit",
                  },
                  {
                    type: "url_citation",
                    url: "https://example-news.test/news/blinkit",
                    title: "Blinkit expansion news",
                  },
                ],
              },
            ],
          },
        ],
      });
    },
  });

  const result = await client.search({
    companyName: "Blinkit",
    companyDomain: "blinkit.com",
    objective: "Verify the account identity",
    allowedSourceKinds: ["official_company"],
    signal: new AbortController().signal,
  });

  assert.deepEqual(requestBody?.tools, [{ type: "web_search", search_context_size: "medium" }]);
  assert.deepEqual(requestBody?.include, ["web_search_call.action.sources"]);
  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0]?.sourceKind, "official_company");
  assert.equal(result.sources[0]?.retrievalStatus, "pending");
  assert.equal(result.sources[1]?.sourceKind, "news");
});

test("fails transparently when search returns no citable URL", async () => {
  const client = new OpenAIWebDiscovery({
    apiKey: "test-key",
    fetch: async () =>
      Response.json({
        output: [
          { type: "message", content: [{ type: "output_text", text: "Nothing citable", annotations: [] }] },
        ],
      }),
  });

  await assert.rejects(
    () =>
      client.search({
        companyName: "Unknown",
        objective: "Find public information",
        allowedSourceKinds: [],
        signal: new AbortController().signal,
      }),
    /no citable public source URLs/,
  );
});
