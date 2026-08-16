import assert from "node:assert/strict";
import test from "node:test";

import { parseWrittenWorkflow } from "./workflow-parser.ts";

test("parses numbered, bulleted, arrow and semicolon workflow steps", () => {
  assert.deepEqual(
    parseWrittenWorkflow("1. Find the official site\n- Read investor reports → capture evidence; draft the account brief"),
    ["Find the official site", "Read investor reports", "capture evidence", "draft the account brief"],
  );
});

test("rejects an empty written workflow", () => {
  assert.throws(() => parseWrittenWorkflow("  \n •  "), /at least one workflow step/);
});

test("bounds written workflows to thirty steps", () => {
  assert.throws(
    () => parseWrittenWorkflow(Array.from({ length: 31 }, (_, index) => `${index + 1}. Step`).join("\n")),
    /30 steps or fewer/,
  );
});
