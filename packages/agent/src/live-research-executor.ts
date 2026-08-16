import type {
  ActionResult,
  EvidenceDraft,
  PlannedAction,
  ResearchActionExecutor,
  SourceArtifact,
} from "./contracts.ts";
import {
  PublicPageExtractor,
  type ExtractedPublicPage,
} from "./public-page-extractor.ts";
import type {
  EvidenceAnalyzer,
  WebDiscoveryClient,
} from "./research-tools.ts";

export type LiveResearchExecutorOptions = {
  discovery: WebDiscoveryClient;
  extractor: PublicPageExtractor;
  analyzer: EvidenceAnalyzer;
};

export class LiveResearchExecutor implements ResearchActionExecutor {
  readonly #discovery: WebDiscoveryClient;
  readonly #extractor: PublicPageExtractor;
  readonly #analyzer: EvidenceAnalyzer;

  constructor(options: LiveResearchExecutorOptions) {
    this.#discovery = options.discovery;
    this.#extractor = options.extractor;
    this.#analyzer = options.analyzer;
  }

  async execute(input: Parameters<ResearchActionExecutor["execute"]>[0]): Promise<ActionResult> {
    switch (input.action.kind) {
      case "search_web":
        return this.#search(input);
      case "open_public_page":
        return this.#openPage(input);
      case "extract_evidence":
        return this.#extractEvidence(input);
      case "compare_evidence":
      case "create_or_update_claim":
        return this.#synthesizeClaims(input);
      case "complete_research":
        return this.#complete(input.completedActions);
      case "suggest_plan_change":
      case "ask_for_approval":
        throw new Error(`${input.action.kind} is controlled by the orchestrator, not a research tool`);
      case "generate_report":
        throw new Error("Report generation belongs to the meeting-brief step, not live research");
    }
  }

  async #search(input: Parameters<ResearchActionExecutor["execute"]>[0]): Promise<ActionResult> {
    const result = await this.#discovery.search({
      companyName: input.run.companyName,
      companyDomain: input.run.companyDomain,
      objective: input.action.objective,
      allowedSourceKinds: input.action.allowedSourceKinds,
      signal: input.signal,
    });
    return emptyResult(result.summary, { sources: result.sources });
  }

  async #openPage(input: Parameters<ResearchActionExecutor["execute"]>[0]): Promise<ActionResult> {
    const previousSources = collectSources(input.completedActions);
    const candidate = input.action.directUrl
      ? directSource(input.action.directUrl)
      : selectCandidateSource(
          previousSources,
          input.action,
          input.run.companyDomain,
        );
    if (!candidate) {
      return emptyResult("No unopened public source matched this action.", {
        uncertainties: ["A safe candidate URL was not available from completed discovery actions."],
      });
    }

    try {
      const page = await this.#extractor.extract({
        url: candidate.canonicalUrl,
        signal: input.signal,
        sourceKind: candidate.sourceKind,
      });
      return emptyResult(`Opened and normalized ${page.title}.`, { sources: [page] });
    } catch (error) {
      if (input.signal.aborted) throw error;
      const reason = errorMessage(error);
      const failedSource: SourceArtifact = {
        ...candidate,
        retrievalStatus: retrievalStatusFor(reason),
        summary: reason,
        promptInjectionSignals: [],
      };
      return emptyResult(`Could not extract ${candidate.title}.`, {
        sources: [failedSource],
        uncertainties: [reason],
        recommendedNextAction: "Try the next public candidate source.",
      });
    }
  }

  async #extractEvidence(
    input: Parameters<ResearchActionExecutor["execute"]>[0],
  ): Promise<ActionResult> {
    const pages = collectExtractedPages(input.completedActions);
    if (pages.length === 0) {
      return emptyResult("No safely extracted page was available for evidence analysis.", {
        uncertainties: ["The objective remains unsupported because no readable public page was extracted."],
      });
    }
    const result = await this.#analyzer.extractEvidence({
      companyName: input.run.companyName,
      objective: input.action.objective,
      pages,
      signal: input.signal,
    });
    return emptyResult(result.summary, {
      evidence: result.evidence,
      uncertainties: result.uncertainties,
    });
  }

  async #synthesizeClaims(
    input: Parameters<ResearchActionExecutor["execute"]>[0],
  ): Promise<ActionResult> {
    const evidence = collectEvidence(input.completedActions);
    const result = await this.#analyzer.synthesizeClaims({
      companyName: input.run.companyName,
      objective: input.action.objective,
      evidence,
      signal: input.signal,
    });
    return emptyResult(result.summary, {
      claims: result.claims,
      uncertainties: result.uncertainties,
      recommendedNextAction: result.recommendedNextAction,
    });
  }

  #complete(actions: PlannedAction[]): ActionResult {
    const sources = collectSources(actions);
    const evidence = collectEvidence(actions);
    const claims = actions.flatMap((action) => action.result?.claims ?? []);
    return emptyResult(
      `Research checkpoint complete with ${sources.filter((source) => source.retrievalStatus === "available").length} readable sources, ${evidence.length} evidence excerpts and ${claims.length} labelled claims.`,
    );
  }
}

function directSource(urlValue: string): SourceArtifact {
  const url = new URL(urlValue);
  return {
    originalUrl: url.href,
    canonicalUrl: url.href,
    domain: url.hostname,
    title: url.hostname,
    sourceKind: "user_supplied",
    retrievalStatus: "pending",
    summary: "Source supplied during an approved research intervention.",
    promptInjectionSignals: [],
  };
}

function emptyResult(
  summary: string,
  overrides: Partial<ActionResult> = {},
): ActionResult {
  return {
    summary,
    sources: [],
    evidence: [],
    claims: [],
    uncertainties: [],
    ...overrides,
  };
}

function collectSources(actions: PlannedAction[]): SourceArtifact[] {
  const latest = new Map<string, SourceArtifact>();
  for (const action of actions) {
    for (const source of action.result?.sources ?? []) {
      latest.set(source.canonicalUrl, source);
    }
  }
  return [...latest.values()];
}

function collectExtractedPages(actions: PlannedAction[]): ExtractedPublicPage[] {
  return collectSources(actions).filter(isExtractedPage);
}

function collectEvidence(actions: PlannedAction[]): EvidenceDraft[] {
  const seen = new Set<string>();
  const evidence: EvidenceDraft[] = [];
  for (const action of actions) {
    for (const item of action.result?.evidence ?? []) {
      const key = `${item.sourceUrl}\n${item.excerpt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      evidence.push(item);
    }
  }
  return evidence;
}

function isExtractedPage(source: SourceArtifact): source is ExtractedPublicPage {
  return source.retrievalStatus === "available"
    && typeof source.extractedText === "string"
    && typeof source.contentHash === "string"
    && typeof source.retrievedAt === "string"
    && typeof source.contentType === "string"
    && typeof source.truncated === "boolean";
}

function selectCandidateSource(
  sources: SourceArtifact[],
  action: PlannedAction,
  companyDomain?: string,
): SourceArtifact | undefined {
  const allowed = new Set(action.allowedSourceKinds);
  return sources
    .filter((source) => source.retrievalStatus === "pending")
    .sort((left, right) =>
      sourceScore(right, allowed, companyDomain) - sourceScore(left, allowed, companyDomain),
    )[0];
}

function sourceScore(
  source: SourceArtifact,
  allowed: Set<string>,
  companyDomain?: string,
): number {
  let score = 0;
  if (allowed.has(source.sourceKind)) score += 100;
  if (source.sourceKind === "official_company") score += 40;
  if (source.sourceKind === "public_filing") score += 35;
  if (source.sourceKind === "public_report") score += 30;
  const normalized = companyDomain?.toLowerCase().replace(/^www\./, "");
  const hostname = source.domain.toLowerCase().replace(/^www\./, "");
  if (normalized && (hostname === normalized || hostname.endsWith(`.${normalized}`))) score += 25;
  return score;
}

function retrievalStatusFor(message: string): SourceArtifact["retrievalStatus"] {
  if (/blocked|private|local hostname|network address|credentials|standard port/i.test(message)) {
    return "blocked";
  }
  if (/unsupported|content type/i.test(message)) return "unsupported";
  if (/HTTP 4\d\d|no readable|did not resolve/i.test(message)) return "inaccessible";
  return "failed";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
