import { LiveResearchExecutor } from "./live-research-executor.ts";
import { OpenAIEvidenceAnalyzer } from "./openai-evidence-analyzer.ts";
import { DEFAULT_AGENT_MODEL, type ReasoningEffort } from "./openai-planner.ts";
import { OpenAIWebDiscovery } from "./openai-web-search.ts";
import {
  PublicPageExtractor,
  type PublicPageExtractorOptions,
} from "./public-page-extractor.ts";

export type LiveResearchRuntimeOptions = {
  apiKey: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  pageExtractor?: PublicPageExtractorOptions;
};

export function createLiveResearchExecutor(
  options: LiveResearchRuntimeOptions,
): LiveResearchExecutor {
  const model = options.model ?? DEFAULT_AGENT_MODEL;
  return new LiveResearchExecutor({
    discovery: new OpenAIWebDiscovery({
      apiKey: options.apiKey,
      model,
      reasoningEffort: options.reasoningEffort,
    }),
    extractor: new PublicPageExtractor(options.pageExtractor),
    analyzer: new OpenAIEvidenceAnalyzer({
      apiKey: options.apiKey,
      model,
      reasoningEffort: options.reasoningEffort,
    }),
  });
}
