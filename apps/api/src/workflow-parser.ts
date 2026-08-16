export function parseWrittenWorkflow(value: string): string[] {
  const steps = value
    .split(/\r?\n|\s+(?:->|→)\s+|\s*;\s*/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  if (steps.length === 0) throw new Error("Write at least one workflow step");
  if (steps.length > 30) throw new Error("Keep the written workflow to 30 steps or fewer");
  return steps;
}
