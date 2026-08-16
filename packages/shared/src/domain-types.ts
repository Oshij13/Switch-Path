export const RUN_STATUSES = [
  "draft",
  "planning",
  "running",
  "pause_requested",
  "paused",
  "comparing",
  "awaiting_approval",
  "replanning",
  "completed",
  "failed",
  "cancelled",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export const ACTION_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "discarded",
] as const;

export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const CLAIM_KINDS = [
  "sourced_fact",
  "agent_interpretation",
  "unsupported_hypothesis",
] as const;

export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const CLAIM_STATUSES = [
  "active",
  "stale",
  "superseded",
  "rejected",
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const INTERVENTION_STATUSES = [
  "submitted",
  "validating",
  "comparing",
  "awaiting_approval",
  "approved",
  "rejected",
  "applied",
  "failed",
] as const;

export type InterventionStatus = (typeof INTERVENTION_STATUSES)[number];

export type RunState = {
  status: RunStatus;
  planRevision: number;
  lastTransitionAt: string;
  resumeStatus?: "planning" | "running" | "replanning";
  retryStatus?: "planning" | "running" | "pause_requested" | "comparing" | "replanning";
  failureMessage?: string;
};

export type ClaimEvidenceRelationship =
  | "supports"
  | "contradicts"
  | "context";

export type InputMode = "typed" | "voice";

export type ResearchStage = "initial_prospecting";
