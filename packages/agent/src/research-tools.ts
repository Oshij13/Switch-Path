import type {
  ClaimDraft,
  EvidenceDraft,
  SourceArtifact,
} from "./contracts.ts";
import type { ExtractedPublicPage } from "./public-page-extractor.ts";

export type WebDiscoveryInput = {
  companyName: string;
  companyDomain?: string;
  objective: string;
  allowedSourceKinds: string[];
  signal: AbortSignal;
};

export type WebDiscoveryResult = {
  summary: string;
  sources: SourceArtifact[];
};

export interface WebDiscoveryClient {
  search(input: WebDiscoveryInput): Promise<WebDiscoveryResult>;
}

export type EvidenceExtractionResult = {
  summary: string;
  evidence: EvidenceDraft[];
  uncertainties: string[];
};

export type ClaimSynthesisResult = {
  summary: string;
  claims: ClaimDraft[];
  uncertainties: string[];
  recommendedNextAction?: string;
};

export interface EvidenceAnalyzer {
  extractEvidence(input: {
    companyName: string;
    objective: string;
    pages: ExtractedPublicPage[];
    signal: AbortSignal;
  }): Promise<EvidenceExtractionResult>;
  synthesizeClaims(input: {
    companyName: string;
    objective: string;
    evidence: EvidenceDraft[];
    signal: AbortSignal;
  }): Promise<ClaimSynthesisResult>;
}
