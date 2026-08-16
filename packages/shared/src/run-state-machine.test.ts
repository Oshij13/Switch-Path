import assert from "node:assert/strict";
import test from "node:test";

import {
  createDraftRun,
  isResultCurrent,
  occupiesActiveRunSlot,
  transitionRun,
} from "./run-state-machine.ts";

const time = "2026-08-13T12:00:00.000Z";

test("starts, pauses at a checkpoint, and resumes without changing revision", () => {
  let run = createDraftRun(time);
  run = transitionRun(run, { type: "START", at: time });
  run = transitionRun(run, { type: "PLAN_SAVED", at: time });

  assert.equal(run.status, "running");
  assert.equal(run.planRevision, 1);

  run = transitionRun(run, { type: "REQUEST_PAUSE", at: time });
  assert.equal(run.status, "pause_requested");

  run = transitionRun(run, { type: "REACH_SAFE_CHECKPOINT", at: time });
  run = transitionRun(run, { type: "RESUME", at: time });

  assert.equal(run.status, "running");
  assert.equal(run.planRevision, 1);
});

test("a run paused during planning resumes into planning", () => {
  let run = createDraftRun(time);
  run = transitionRun(run, { type: "START", at: time });
  run = transitionRun(run, { type: "REQUEST_PAUSE", at: time });
  run = transitionRun(run, { type: "REACH_SAFE_CHECKPOINT", at: time });

  assert.equal(run.status, "paused");
  assert.equal(run.resumeStatus, "planning");

  run = transitionRun(run, { type: "RESUME", at: time });
  assert.equal(run.status, "planning");
  assert.equal(run.planRevision, 0);
});

test("approved source intervention creates a new revision before replanning", () => {
  let run = createDraftRun(time);
  run = transitionRun(run, { type: "START", at: time });
  run = transitionRun(run, { type: "PLAN_SAVED", at: time });
  run = transitionRun(run, { type: "REQUEST_PAUSE", at: time });
  run = transitionRun(run, { type: "REACH_SAFE_CHECKPOINT", at: time });
  run = transitionRun(run, { type: "SUBMIT_SOURCE", at: time });
  run = transitionRun(run, { type: "COMPARISON_READY", at: time });
  run = transitionRun(run, { type: "APPROVE_ROUTE", at: time });

  assert.equal(run.status, "replanning");
  assert.equal(run.planRevision, 2);
  assert.equal(isResultCurrent(1, run), false);

  run = transitionRun(run, { type: "REPLAN_SAVED", at: time });
  assert.equal(run.status, "running");
  assert.equal(run.planRevision, 2);
});

test("rejected source intervention returns to paused without changing revision", () => {
  const run = transitionRun(
    {
      status: "awaiting_approval",
      planRevision: 3,
      lastTransitionAt: time,
      resumeStatus: "running",
    },
    { type: "REJECT_ROUTE", at: time },
  );

  assert.equal(run.status, "paused");
  assert.equal(run.planRevision, 3);
  assert.equal(run.resumeStatus, "running");
});

test("a failed comparison retries from the failed phase", () => {
  let run = transitionRun(
    {
      status: "comparing",
      planRevision: 2,
      lastTransitionAt: time,
      resumeStatus: "running",
    },
    { type: "FAIL", at: time, message: "source timed out" },
  );

  assert.equal(run.status, "failed");
  assert.equal(run.retryStatus, "comparing");
  assert.equal(run.resumeStatus, "running");

  run = transitionRun(run, { type: "RETRY", at: time });
  assert.equal(run.status, "comparing");
  assert.equal(run.resumeStatus, "running");
  assert.equal(run.failureMessage, undefined);
});

test("source intervention is rejected when a planning pause has no research route", () => {
  assert.throws(
    () =>
      transitionRun(
        {
          status: "paused",
          planRevision: 0,
          lastTransitionAt: time,
          resumeStatus: "planning",
        },
        { type: "SUBMIT_SOURCE", at: time },
      ),
    /paused active-research run/,
  );
});

test("terminal runs reject further transitions", () => {
  assert.throws(
    () =>
      transitionRun(
        { status: "completed", planRevision: 2, lastTransitionAt: time },
        { type: "RESUME", at: time },
      ),
    /Invalid research-run transition/,
  );
});

test("late results are rejected after the run reaches paused", () => {
  assert.equal(
    isResultCurrent(2, {
      status: "paused",
      planRevision: 2,
    }),
    false,
  );
});

test("only non-terminal execution states occupy the single active-run slot", () => {
  assert.equal(occupiesActiveRunSlot("running"), true);
  assert.equal(occupiesActiveRunSlot("awaiting_approval"), true);
  assert.equal(occupiesActiveRunSlot("completed"), false);
  assert.equal(occupiesActiveRunSlot("failed"), false);
  assert.equal(occupiesActiveRunSlot("draft"), false);
});
