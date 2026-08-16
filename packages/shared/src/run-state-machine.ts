import type { RunState, RunStatus } from "./domain-types.ts";

export type RunEvent =
  | { type: "START"; at: string }
  | { type: "PLAN_SAVED"; at: string }
  | { type: "REQUEST_PAUSE"; at: string }
  | { type: "REACH_SAFE_CHECKPOINT"; at: string }
  | { type: "SUBMIT_SOURCE"; at: string }
  | { type: "COMPARISON_READY"; at: string }
  | { type: "APPROVE_ROUTE"; at: string }
  | { type: "REJECT_ROUTE"; at: string }
  | { type: "REPLAN_SAVED"; at: string }
  | { type: "RESUME"; at: string }
  | { type: "COMPLETE"; at: string }
  | { type: "FAIL"; at: string; message: string }
  | { type: "RETRY"; at: string }
  | { type: "CANCEL"; at: string };

const allowedTransitions: Record<RunStatus, readonly RunEvent["type"][]> = {
  draft: ["START", "CANCEL"],
  planning: ["PLAN_SAVED", "REQUEST_PAUSE", "FAIL", "CANCEL"],
  running: ["REQUEST_PAUSE", "COMPLETE", "FAIL", "CANCEL"],
  pause_requested: ["REACH_SAFE_CHECKPOINT", "FAIL", "CANCEL"],
  paused: ["SUBMIT_SOURCE", "RESUME", "CANCEL"],
  comparing: ["COMPARISON_READY", "FAIL", "CANCEL"],
  awaiting_approval: ["APPROVE_ROUTE", "REJECT_ROUTE", "CANCEL"],
  replanning: ["REPLAN_SAVED", "REQUEST_PAUSE", "FAIL", "CANCEL"],
  completed: [],
  failed: ["RETRY", "CANCEL"],
  cancelled: [],
};

export function createDraftRun(at: string): RunState {
  return {
    status: "draft",
    planRevision: 0,
    lastTransitionAt: at,
  };
}

export function canTransition(
  status: RunStatus,
  event: RunEvent["type"],
): boolean {
  return allowedTransitions[status].includes(event);
}

export function transitionRun(state: RunState, event: RunEvent): RunState {
  if (!canTransition(state.status, event.type)) {
    throw new Error(
      `Invalid research-run transition: ${state.status} -> ${event.type}`,
    );
  }

  const base = {
    planRevision: state.planRevision,
    lastTransitionAt: event.at,
    ...(state.resumeStatus ? { resumeStatus: state.resumeStatus } : {}),
  };

  switch (event.type) {
    case "START":
      return { ...base, status: "planning" };
    case "PLAN_SAVED":
      return {
        ...base,
        status: "running",
        planRevision: 1,
        resumeStatus: undefined,
      };
    case "REQUEST_PAUSE":
      if (!["planning", "running", "replanning"].includes(state.status)) {
        throw new Error(`Run cannot pause from ${state.status}`);
      }
      return {
        ...base,
        status: "pause_requested",
        resumeStatus: state.status as "planning" | "running" | "replanning",
      };
    case "REACH_SAFE_CHECKPOINT":
      return { ...base, status: "paused" };
    case "SUBMIT_SOURCE":
      if (state.resumeStatus !== "running") {
        throw new Error(
          "A source intervention requires a paused active-research run",
        );
      }
      return { ...base, status: "comparing" };
    case "COMPARISON_READY":
      return { ...base, status: "awaiting_approval" };
    case "APPROVE_ROUTE":
      return {
        ...base,
        status: "replanning",
        planRevision: state.planRevision + 1,
        resumeStatus: undefined,
      };
    case "REJECT_ROUTE":
      return { ...base, status: "paused" };
    case "REPLAN_SAVED":
      return { ...base, status: "running", resumeStatus: undefined };
    case "RESUME":
      if (!state.resumeStatus) {
        throw new Error("Paused run has no resume target");
      }
      return { ...base, status: state.resumeStatus, resumeStatus: undefined };
    case "RETRY":
      if (!state.retryStatus) {
        throw new Error("Failed run has no retry target");
      }
      return {
        ...base,
        status: state.retryStatus,
        retryStatus: undefined,
        failureMessage: undefined,
      };
    case "COMPLETE":
      return { ...base, status: "completed", resumeStatus: undefined };
    case "FAIL":
      return {
        ...base,
        status: "failed",
        retryStatus: state.status as
          | "planning"
          | "running"
          | "pause_requested"
          | "comparing"
          | "replanning",
        failureMessage: event.message,
      };
    case "CANCEL":
      return { ...base, status: "cancelled", resumeStatus: undefined };
  }
}

export function isResultCurrent(
  actionPlanRevision: number,
  currentRun: Pick<RunState, "status" | "planRevision">,
): boolean {
  return (
    actionPlanRevision === currentRun.planRevision &&
    [
      "planning",
      "running",
      "pause_requested",
      "comparing",
      "replanning",
    ].includes(currentRun.status)
  );
}

export function occupiesActiveRunSlot(status: RunStatus): boolean {
  return !["draft", "completed", "failed", "cancelled"].includes(status);
}
