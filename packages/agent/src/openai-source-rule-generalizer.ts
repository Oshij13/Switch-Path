import type {
  GeneralizedSourceRule,
  ResearchRun,
  SourceIntervention,
  SourceRuleGeneralizer,
} from "./contracts.ts";
import { DEFAULT_AGENT_MODEL, type ReasoningEffort } from "./openai-planner.ts";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type OpenAISourceRuleGeneralizerOptions = {
  apiKey: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  fetch?: FetchLike;
};

export class OpenAISourceRuleGeneralizer implements SourceRuleGeneralizer {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #reasoningEffort: ReasoningEffort;
  readonly #fetch: FetchLike;

  constructor(options: OpenAISourceRuleGeneralizerOptions) {
    if (!options.apiKey.trim()) throw new Error("OpenAI API key is required");
    this.#apiKey = options.apiKey;
    this.#model = options.model ?? DEFAULT_AGENT_MODEL;
    this.#reasoningEffort = options.reasoningEffort ?? "medium";
    this.#fetch = options.fetch ?? fetch;
  }

  async generalize(input: {
    run: ResearchRun;
    intervention: SourceIntervention;
  }): Promise<GeneralizedSourceRule> {
    if (!input.intervention.comparison) {
      throw new Error("A completed route comparison is required to generalize a source rule");
    }
    const originDomain = new URL(input.intervention.proposedUrl).hostname;
    const response = await this.#fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.#model,
        store: false,
        reasoning: { effort: this.#reasoningEffort },
        instructions: GENERALIZER_INSTRUCTIONS,
        input: JSON.stringify({
          originatingCompany: input.run.companyName,
          researchGoal: input.run.researchGoal,
          meetingContext: input.run.meetingContext,
          originDomain,
          originPageTitle: input.intervention.proposedPageTitle ?? null,
          userInstruction: input.intervention.instruction,
          comparison: input.intervention.comparison,
        }),
        max_output_tokens: 3000,
        text: {
          format: {
            type: "json_schema",
            name: "switchpath_generalized_source_rule",
            strict: true,
            schema: RULE_SCHEMA,
          },
        },
      }),
    });
    const body = (await response.json()) as unknown;
    if (!response.ok) {
      throw new Error(`OpenAI source-rule request failed (${response.status}): ${apiError(body)}`);
    }
    return parseRule(JSON.parse(responseOutputText(body)));
  }
}

const GENERALIZER_INSTRUCTIONS = `
Convert one approved source intervention into a reusable account-research source rule.
The rule must work for future target companies; it must not memorize the originating company, domain, page title, or exact URL.
Generalize the source location into a domain strategy, official-source category, path keywords, and a search query template.
The queryTemplate must contain {official_domain} and may contain {company} and {research_goal}.
Prefer resolving the target company's official domain or a verified parent official domain at runtime.
Preserve applicability safeguards so parent-level claims are never transferred to a target without explicit evidence.
Path keywords must be generic concepts such as sustainability, impact, waste, packaging, ESG, investors, or reports.
Do not include hidden chain-of-thought. The rationale is a concise decision summary.
`.trim();

const RULE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "domainStrategy",
    "sourceCategory",
    "pathKeywords",
    "queryTemplate",
    "discoveryInstruction",
    "useWhen",
    "applicabilityChecks",
    "avoidWhen",
    "rationale",
  ],
  properties: {
    title: { type: "string", minLength: 1 },
    domainStrategy: {
      type: "string",
      enum: [
        "target_official_domain",
        "verified_parent_official_domain",
        "target_or_verified_parent_official_domain",
      ],
    },
    sourceCategory: {
      type: "string",
      enum: [
        "official_sustainability_or_impact",
        "official_investor_relations",
        "public_filing",
        "official_operational_update",
        "other_official_source",
      ],
    },
    pathKeywords: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string", minLength: 1 },
    },
    queryTemplate: { type: "string", minLength: 1 },
    discoveryInstruction: { type: "string", minLength: 1 },
    useWhen: { type: "array", items: { type: "string" } },
    applicabilityChecks: { type: "array", minItems: 1, items: { type: "string" } },
    avoidWhen: { type: "array", items: { type: "string" } },
    rationale: { type: "string", minLength: 1 },
  },
};

function parseRule(value: unknown): GeneralizedSourceRule {
  if (!isRecord(value)) throw new Error("OpenAI returned an invalid generalized source rule");
  const domainStrategy = requiredEnum(value.domainStrategy, "domainStrategy", [
    "target_official_domain",
    "verified_parent_official_domain",
    "target_or_verified_parent_official_domain",
  ] as const);
  const sourceCategory = requiredEnum(value.sourceCategory, "sourceCategory", [
    "official_sustainability_or_impact",
    "official_investor_relations",
    "public_filing",
    "official_operational_update",
    "other_official_source",
  ] as const);
  const queryTemplate = requiredText(value.queryTemplate, "queryTemplate");
  if (!queryTemplate.includes("{official_domain}")) {
    throw new Error("Generalized source rule queryTemplate must use {official_domain}");
  }
  const serialized = JSON.stringify(value).toLowerCase();
  if (/https?:\/\//.test(serialized)) {
    throw new Error("Generalized source rule must not contain an exact URL");
  }
  return {
    title: requiredText(value.title, "title"),
    domainStrategy,
    sourceCategory,
    pathKeywords: stringArray(value.pathKeywords, "pathKeywords"),
    queryTemplate,
    discoveryInstruction: requiredText(value.discoveryInstruction, "discoveryInstruction"),
    useWhen: stringArray(value.useWhen, "useWhen"),
    applicabilityChecks: stringArray(value.applicabilityChecks, "applicabilityChecks"),
    avoidWhen: stringArray(value.avoidWhen, "avoidWhen"),
    rationale: requiredText(value.rationale, "rationale"),
  };
}

function responseOutputText(value: unknown): string {
  if (!isRecord(value)) throw new Error("OpenAI returned an invalid response object");
  if (typeof value.output_text === "string" && value.output_text) return value.output_text;
  if (!Array.isArray(value.output)) throw new Error("OpenAI response contained no output");
  for (const item of value.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  throw new Error("OpenAI response contained no structured output text");
}

function apiError(value: unknown): string {
  if (isRecord(value) && isRecord(value.error) && typeof value.error.message === "string") {
    return value.error.message;
  }
  return "unknown API error";
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty text`);
  return value.trim();
}

function requiredEnum<const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] {
  const text = requiredText(value, field);
  if (!allowed.includes(text)) throw new Error(`${field} has an unsupported value`);
  return text as T[number];
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be a string array`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
