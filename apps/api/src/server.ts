import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

import type { CommandKind } from "../../../packages/agent/src/contracts.ts";
import type { SourceRuleGeneralizer } from "../../../packages/agent/src/contracts.ts";
import { OpenAISourceRuleGeneralizer } from "../../../packages/agent/src/openai-source-rule-generalizer.ts";
import type { ReasoningEffort } from "../../../packages/agent/src/openai-planner.ts";
import {
  OpenAIMeetingBriefSynthesizer,
  type MeetingBriefSynthesizer,
} from "../../../packages/agent/src/meeting-brief-synthesizer.ts";
import { canTransition, transitionRun } from "../../../packages/shared/src/run-state-machine.ts";
import { verifyApiSessionToken } from "../../../packages/shared/src/api-session.ts";
import { generateMeetingBriefPdf } from "./meeting-brief-pdf.ts";
import { parseWrittenWorkflow } from "./workflow-parser.ts";
import {
  createSupabaseAgentRepositoryFromEnv,
  type SupabaseAgentRepository,
} from "../../../packages/database/src/supabase-agent-repository.ts";

const host = process.env.SWITCHPATH_API_HOST ?? "127.0.0.1";
const port = Number(process.env.SWITCHPATH_API_PORT ?? process.env.PORT ?? "4317");
const workspaceId = process.env.SWITCHPATH_DEMO_WORKSPACE_ID?.trim() || "00000000-0000-4000-8000-000000000001";
const playbookVersionId = process.env.SWITCHPATH_DEMO_PLAYBOOK_VERSION_ID?.trim() || "00000000-0000-4000-8000-000000000004";
const repository = createSupabaseAgentRepositoryFromEnv();
const requireAuthentication = process.env.SWITCHPATH_REQUIRE_AUTH === "true";
const reasoningEffort = parseReasoningEffort(process.env.SWITCHPATH_REASONING_EFFORT);
const ruleGeneralizer = new OpenAISourceRuleGeneralizer({
  apiKey: requiredEnv("OPENAI_API_KEY"),
  model: process.env.SWITCHPATH_AGENT_MODEL,
  reasoningEffort,
});
const briefSynthesizer = new OpenAIMeetingBriefSynthesizer({
  apiKey: requiredEnv("OPENAI_API_KEY"),
  model: process.env.SWITCHPATH_AGENT_MODEL,
  reasoningEffort,
});
const browserContexts = new Map<string, BrowserContext>();

const server = createServer(async (request, response) => {
  applyCors(request, response);
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  try {
    const context = await resolveRequestContext(request);
    const requestRepository = context.userId === process.env.SWITCHPATH_DEMO_USER_ID
      ? repository
      : createSupabaseAgentRepositoryFromEnv(process.env, context.userId);
    await route(
      request,
      response,
      requestRepository,
      ruleGeneralizer,
      briefSynthesizer,
      context.workspaceId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    json(response, error instanceof AuthenticationError ? 401 : 500, { error: message });
  }
});

server.listen(port, host, () => {
  console.log(`Switchpath API listening at http://${host}:${port}`);
});

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  store: SupabaseAgentRepository,
  generalizer: SourceRuleGeneralizer,
  briefWriter: MeetingBriefSynthesizer,
  workspaceId: string,
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    json(response, 200, {
      name: "Switchpath API Server",
      status: "ok",
      supabaseConfigured: true,
      openAIConfigured: Boolean(process.env.OPENAI_API_KEY),
    });
    return;
  }

  const scopedRunMatch = url.pathname.match(/^\/runs\/([0-9a-f-]+)(?:\/|$)/i);
  if (scopedRunMatch) {
    const scopedRun = await store.getRun(scopedRunMatch[1]);
    if (scopedRun.workspaceId !== workspaceId) throw new AuthenticationError("Research run not found in this workspace");
  }

  if (request.method === "GET" && url.pathname === "/active-run") {
    const run = await store.getActiveRun(workspaceId);
    json(response, 200, { run: run ?? null });
    return;
  }

  if (request.method === "GET" && url.pathname === "/latest-run") {
    const run = await store.getLatestRun(workspaceId);
    json(response, 200, { run: run ?? null });
    return;
  }

  if (request.method === "GET" && url.pathname === "/runs") {
    json(response, 200, { runs: await store.listRunSummaries(workspaceId) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/playbook") {
    const availablePlaybooks = await store.listPlaybooks(workspaceId);
    json(response, 200, {
      playbook: availablePlaybooks[0] ?? null,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/playbooks") {
    json(response, 200, { playbooks: await store.listPlaybooks(workspaceId) });
    return;
  }

  const playbookVersionsMatch = url.pathname.match(/^\/playbooks\/([0-9a-f-]+)\/versions$/i);
  if (request.method === "GET" && playbookVersionsMatch) {
    json(response, 200, {
      versions: await store.listPlaybookVersions(workspaceId, playbookVersionsMatch[1]),
    });
    return;
  }

  if (request.method === "POST" && playbookVersionsMatch) {
    const body = await readJson(request);
    const rawSteps = body.steps;
    if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
      throw new Error("At least one workflow step is required");
    }
    const steps = rawSteps.map((value) => {
      const step = objectBodyValue(value);
      return {
        title: requiredBodyString(step, "title"),
        objective: requiredBodyString(step, "objective"),
        instructions: optionalBodyString(step, "instructions"),
        actionHint: optionalBodyString(step, "actionHint"),
        approvalRequired: optionalBodyBoolean(step, "approvalRequired"),
      };
    });
    const playbook = await store.savePlaybookVersion({
      workspaceId,
      playbookId: playbookVersionsMatch[1],
      baseVersionId: requiredBodyString(body, "baseVersionId"),
      name: requiredBodyString(body, "name"),
      description: optionalBodyString(body, "description"),
      changeSummary: requiredBodyString(body, "changeSummary"),
      steps,
    });
    json(response, 201, { playbook });
    return;
  }

  const playbookVersionMatch = url.pathname.match(
    /^\/playbooks\/([0-9a-f-]+)\/versions\/([0-9a-f-]+)$/i,
  );
  if (request.method === "GET" && playbookVersionMatch) {
    const playbook = await store.getPlaybookDetails(workspaceId, playbookVersionMatch[2]);
    if (playbook.id !== playbookVersionMatch[1]) {
      throw new Error("The selected revision does not belong to this playbook");
    }
    json(response, 200, { playbook });
    return;
  }

  const activatePlaybookVersionMatch = url.pathname.match(
    /^\/playbooks\/([0-9a-f-]+)\/versions\/([0-9a-f-]+)\/activate$/i,
  );
  if (request.method === "POST" && activatePlaybookVersionMatch) {
    const playbook = await store.activatePlaybookVersion(
      workspaceId,
      activatePlaybookVersionMatch[1],
      activatePlaybookVersionMatch[2],
    );
    json(response, 200, { playbook });
    return;
  }

  if (request.method === "GET" && url.pathname === "/evidence") {
    json(response, 200, { evidence: await store.getWorkspaceEvidenceIndex(workspaceId) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/history") {
    json(response, 200, { history: await store.getWorkspaceHistory(workspaceId) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/demo/reset") {
    const activeRun = await store.getActiveRun(workspaceId);
    if (activeRun) {
      json(response, 409, {
        error: `Stop the active ${activeRun.companyName} research run before resetting the demo.`,
      });
      return;
    }
    const result = await store.resetDemoWorkspace(workspaceId);
    browserContexts.delete(workspaceId);
    await store.discardTeachingSession(workspaceId);
    json(response, 200, { result });
    return;
  }

  const sourceRuleActivationMatch = url.pathname.match(
    /^\/source-rules\/([0-9a-f-]+)\/activation$/i,
  );
  if (request.method === "POST" && sourceRuleActivationMatch) {
    const body = await readJson(request);
    const active = requiredBodyBoolean(body, "active");
    await store.setSourceRuleActive(
      workspaceId,
      sourceRuleActivationMatch[1],
      active,
    );
    json(response, 200, { id: sourceRuleActivationMatch[1], active });
    return;
  }

  if (request.method === "GET" && url.pathname === "/browser-context") {
    json(response, 200, { context: browserContexts.get(workspaceId) ?? null });
    return;
  }

  if (request.method === "GET" && url.pathname === "/teaching-session") {
    json(response, 200, { session: await store.getActiveTeachingSession(workspaceId) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/teaching-session/save") {
    const teachingSession = await store.getActiveTeachingSession(workspaceId);
    if (teachingSession.status !== "review" || !teachingSession.id) {
      throw new Error("Finish the teaching session before saving its route");
    }
    const body = await readJson(request);
    const rawSteps = body.steps;
    if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
      throw new Error("At least one reviewed workflow step is required");
    }
    const steps = rawSteps.map((value, index) => {
      const step = objectBodyValue(value);
      return {
        title: requiredBodyString(step, "title"),
        objective: requiredBodyString(step, "objective"),
        instructions: optionalBodyString(step, "instructions"),
        position: index + 1,
      };
    });
    const playbook = await store.saveObservedPlaybook({
      workspaceId,
      name: requiredBodyString(body, "name"),
      description: optionalBodyString(body, "description"),
      sourceKind: teachingSession.captureMode,
      steps,
    });
    await store.approveTeachingSession(workspaceId, teachingSession.id, playbook.version.id);
    json(response, 201, { playbook });
    return;
  }

  if (request.method === "POST" && url.pathname === "/teaching-session") {
    const body = await readJson(request);
    const action = requiredBodyString(body, "action");
    let teachingSession;
    if (action === "start") {
      const captureMode = optionalBodyString(body, "captureMode") ?? "observed_browser_session";
      if (captureMode !== "observed_browser_session" && captureMode !== "written_instructions") {
        throw new Error("captureMode must be observed_browser_session or written_instructions");
      }
      const writtenInstructions = optionalBodyString(body, "writtenInstructions");
      const writtenSteps = captureMode === "written_instructions"
        ? parseWrittenWorkflow(writtenInstructions ?? "")
        : [];
      teachingSession = await store.startTeachingSession(
        workspaceId,
        captureMode,
        writtenInstructions,
        writtenSteps,
      );
    } else if (action === "finish") {
      teachingSession = await store.finishTeachingSession(workspaceId);
    } else if (action === "cancel") {
      teachingSession = await store.discardTeachingSession(workspaceId);
    } else {
      throw new Error("Teaching session action must be start, finish, or cancel");
    }
    json(response, 200, { session: teachingSession });
    return;
  }

  if (request.method === "POST" && url.pathname === "/browser-context") {
    const body = await readJson(request);
    const pageUrl = publicPageUrl(requiredBodyString(body, "url"));
    const browserContext: BrowserContext = {
      url: pageUrl.href,
      title: optionalBodyString(body, "title") ?? pageUrl.hostname,
      hostname: pageUrl.hostname.replace(/^www\./i, ""),
      capturedAt: new Date().toISOString(),
    };
    browserContexts.set(workspaceId, browserContext);
    await store.appendTeachingPage(workspaceId, browserContext);
    json(response, 200, { context: browserContext });
    return;
  }

  if (request.method === "GET" && url.pathname === "/memory-candidate") {
    const runId = url.searchParams.get("runId") ?? undefined;
    const candidate = await store.getPendingMemoryCandidate(workspaceId, runId);
    json(response, 200, { candidate: candidate ?? null });
    return;
  }

  if (request.method === "POST" && url.pathname === "/runs") {
    const body = await readJson(request);
    const requestedPlaybookVersionId = optionalBodyString(body, "playbookVersionId");
    if (requireAuthentication && !requestedPlaybookVersionId) {
      throw new Error("Select a workspace playbook before starting research");
    }
    const selectedPlaybookVersionId = requestedPlaybookVersionId ?? playbookVersionId;
    await store.getPlaybookDetails(workspaceId, selectedPlaybookVersionId);
    const run = await store.createRun({
      workspaceId,
      playbookVersionId: selectedPlaybookVersionId,
      companyName: requiredBodyString(body, "companyName"),
      companyDomain: optionalBodyString(body, "companyDomain"),
      meetingContext: requiredBodyString(body, "meetingContext"),
      researchGoal: requiredBodyString(body, "researchGoal"),
    });
    json(response, 201, { run });
    return;
  }

  const runMatch = url.pathname.match(/^\/runs\/([0-9a-f-]+)$/i);
  if (request.method === "GET" && runMatch) {
    json(response, 200, { run: await store.getRun(runMatch[1]) });
    return;
  }

  const planMatch = url.pathname.match(/^\/runs\/([0-9a-f-]+)\/plan$/i);
  if (request.method === "GET" && planMatch) {
    const run = await store.getRun(planMatch[1]);
    const plan = run.planRevision > 0
      ? await store.getPlan(run.id, run.planRevision)
      : undefined;
    json(response, 200, { plan: plan ?? null });
    return;
  }

  const resultsMatch = url.pathname.match(/^\/runs\/([0-9a-f-]+)\/results$/i);
  if (request.method === "GET" && resultsMatch) {
    json(response, 200, { results: await store.getRunResults(resultsMatch[1]) });
    return;
  }

  const impactMatch = url.pathname.match(/^\/runs\/([0-9a-f-]+)\/revision-impact$/i);
  if (request.method === "GET" && impactMatch) {
    const impact = await store.getRunRevisionImpact(impactMatch[1]);
    json(response, 200, { impact: impact ?? null });
    return;
  }

  const briefMatch = url.pathname.match(/^\/runs\/([0-9a-f-]+)\/brief$/i);
  if (request.method === "GET" && briefMatch) {
    const run = await store.getRun(briefMatch[1]);
    const brief = run.planRevision > 0
      ? await store.getMeetingBrief(run.id, run.planRevision)
      : undefined;
    json(response, 200, { brief: brief ?? null });
    return;
  }

  if (request.method === "POST" && briefMatch) {
    const run = await store.getRun(briefMatch[1]);
    if (run.status !== "completed") {
      json(response, 409, { error: "A meeting brief can only be generated after research completes" });
      return;
    }
    const existing = await store.getMeetingBrief(run.id, run.planRevision);
    const existingHasClaims = existing && [
      ...(existing.accountBrief ?? []),
      ...(existing.salesOpportunities ?? []),
      ...(existing.discoveryQuestions ?? []),
      ...(existing.recommendedStrategy ?? []),
      ...(existing.agentSuggestions ?? []),
    ].length > 0;
    if (existingHasClaims) {
      json(response, 200, { brief: existing, reused: true });
      return;
    }
    const results = await store.getRunResults(run.id);
    const brief = await briefWriter.generate({
      runId: run.id,
      revision: run.planRevision,
      companyName: run.companyName,
      meetingContext: run.meetingContext,
      researchGoal: run.researchGoal,
      claims: results.claims.map((claim) => ({
        id: claim.id,
        kind: claim.kind,
        statement: claim.statement,
        rationale: claim.rationale,
        evidence: claim.evidence.map((item) => ({
          id: item.id,
          sourceUrl: item.sourceUrl,
          sourceTitle: item.sourceTitle,
          excerpt: item.excerpt,
        })),
      })),
      uncertainties: results.uncertainties,
    });
    await store.saveMeetingBrief(brief);
    json(response, 201, { brief, reused: false });
    return;
  }

  const briefPdfMatch = url.pathname.match(/^\/runs\/([0-9a-f-]+)\/brief\.pdf$/i);
  if (request.method === "GET" && briefPdfMatch) {
    const run = await store.getRun(briefPdfMatch[1]);
    const brief = run.planRevision > 0
      ? await store.getMeetingBrief(run.id, run.planRevision)
      : undefined;
    if (!brief) {
      json(response, 404, { error: "Generate the structured meeting brief before downloading its PDF" });
      return;
    }
    const generated = await generateMeetingBriefPdf({
      brief,
      meetingContext: run.meetingContext,
      researchGoal: run.researchGoal,
    });
    await store.markMeetingBriefPdfReady(run.id, run.planRevision, generated.storagePath);
    response.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": generated.bytes.length,
      "Content-Disposition": `attachment; filename="${generated.filename}"`,
      "Cache-Control": "no-store",
    });
    response.end(generated.bytes);
    return;
  }

  const commandMatch = url.pathname.match(/^\/runs\/([0-9a-f-]+)\/commands$/i);
  if (request.method === "POST" && commandMatch) {
    const body = await readJson(request);
    const kind = requiredBodyString(body, "kind");
    if (!COMMAND_KINDS.includes(kind as CommandKind)) {
      json(response, 400, { error: `Unsupported command: ${kind}` });
      return;
    }
    const payload = objectBodyValue(body.payload);
    if (kind === "cancel" && payload.mode === "immediate") {
      const run = await store.getRun(commandMatch[1]);
      if (!canTransition(run.status, "CANCEL")) {
        json(response, 409, { error: `Research is already ${run.status}` });
        return;
      }
      const next = transitionRun(run, { type: "CANCEL", at: new Date().toISOString() });
      const updated = await store.compareAndSetRun(run.id, run.status, next);
      await store.appendEvent({
        runId: updated.id,
        revision: updated.planRevision,
        type: "run.cancelled",
        payload: { mode: "immediate", lateResults: "discard" },
      });
      json(response, 200, { run: updated, mode: "immediate" });
      return;
    }
    if (kind === "undo_intervention") {
      const completedRun = await store.getRun(commandMatch[1]);
      if (completedRun.status === "completed") {
        const activeRun = await store.getActiveRun(workspaceId);
        if (activeRun) {
          json(response, 409, { error: `Finish or cancel the active ${activeRun.companyName} run before restoring this route` });
          return;
        }
        const intervention = await store.getLatestIntervention(completedRun.id);
        if (!intervention || intervention.status !== "applied" || intervention.undoneAt) {
          json(response, 409, { error: "There is no applied intervention available to undo" });
          return;
        }
        if (!completedRun.playbookVersionId) throw new Error("The completed run has no playbook version");
        const basePlan = await store.getPlan(completedRun.id, intervention.baseRevision);
        if (!basePlan) throw new Error("The pre-intervention route is unavailable");
        let restoredRun = await store.createRun({
          workspaceId,
          playbookVersionId: completedRun.playbookVersionId,
          companyName: completedRun.companyName,
          companyDomain: completedRun.companyDomain,
          meetingContext: completedRun.meetingContext,
          researchGoal: completedRun.researchGoal,
        });
        const at = new Date().toISOString();
        restoredRun = await store.compareAndSetRun(
          restoredRun.id,
          restoredRun.status,
          transitionRun(restoredRun, { type: "START", at }),
        );
        const restoredPlan = clonePlanForRestoredRun(restoredRun.id, basePlan, intervention.id);
        await store.savePlan(restoredPlan);
        restoredRun = await store.compareAndSetRun(
          restoredRun.id,
          restoredRun.status,
          transitionRun(restoredRun, { type: "PLAN_SAVED", at }),
        );
        intervention.undoneAt = at;
        intervention.undoRunId = restoredRun.id;
        intervention.undoRevision = 1;
        await store.updateIntervention(intervention);
        await store.appendEvent({
          runId: completedRun.id,
          revision: completedRun.planRevision,
          type: "intervention.undo_successor_created",
          payload: { interventionId: intervention.id, restoredRunId: restoredRun.id },
        });
        await store.appendEvent({
          runId: restoredRun.id,
          revision: 1,
          type: "run.restored_from_intervention",
          payload: { interventionId: intervention.id, sourceRunId: completedRun.id, sourceRevision: intervention.baseRevision },
        });
        json(response, 201, { restoredRun, restoredFromRunId: completedRun.id });
        return;
      }
    }
    const command = await store.enqueueCommand({
      runId: commandMatch[1],
      kind: kind as CommandKind,
      payload,
    });
    json(response, 202, { command });
    return;
  }

  const interventionMatch = url.pathname.match(
    /^\/runs\/([0-9a-f-]+)\/intervention$/i,
  );
  if (request.method === "GET" && interventionMatch) {
    const intervention = await store.getLatestIntervention(interventionMatch[1]);
    json(response, 200, { intervention: intervention ?? null });
    return;
  }


  const memoryMatch = url.pathname.match(/^\/runs\/([0-9a-f-]+)\/memory$/i);
  if (request.method === "POST" && memoryMatch) {
    const body = await readJson(request);
    const decision = requiredBodyString(body, "decision");
    if (!MEMORY_DECISIONS.includes(decision as MemoryDecision)) {
      json(response, 400, { error: `Unsupported memory decision: ${decision}` });
      return;
    }
    const intervention = await store.getLatestIntervention(memoryMatch[1]);
    if (!intervention) {
      json(response, 404, { error: "No source intervention exists for this run" });
      return;
    }
    const ruleDraft = decision === "save_generalized_rule"
      ? await generalizer.generalize({
          run: await store.getRun(memoryMatch[1]),
          intervention,
        })
      : undefined;
    const result = await store.decideInterventionMemory({
      runId: memoryMatch[1],
      decision: decision as MemoryDecision,
      ruleDraft,
    });
    json(response, 200, result);
    return;
  }

  const eventsMatch = url.pathname.match(/^\/runs\/([0-9a-f-]+)\/events$/i);
  if (request.method === "GET" && eventsMatch) {
    const after = Number(url.searchParams.get("after") ?? "0");
    const events = await store.listEvents(
      eventsMatch[1],
      Number.isSafeInteger(after) && after >= 0 ? after : 0,
    );
    json(response, 200, { events });
    return;
  }

  const streamMatch = url.pathname.match(/^\/runs\/([0-9a-f-]+)\/events\/stream$/i);
  if (request.method === "GET" && streamMatch) {
    await streamEvents(request, response, store, streamMatch[1]);
    return;
  }

  json(response, 404, { error: "Not found" });
}

function clonePlanForRestoredRun(
  runId: string,
  source: Awaited<ReturnType<SupabaseAgentRepository["getPlan"]>> & {},
  interventionId: string,
) {
  const ids = new Map(source.actions.map((action) => [action.id, randomUUID()]));
  return {
    runId,
    revision: 1,
    reason: `Restored pre-intervention route from ${interventionId}`,
    actions: source.actions.map((action) => ({
      ...action,
      id: ids.get(action.id)!,
      revision: 1,
      dependsOn: action.dependsOn.map((dependencyId) => ids.get(dependencyId) ?? dependencyId),
      status: "pending" as const,
      result: undefined,
      errorMessage: undefined,
    })),
  };
}

async function streamEvents(
  request: IncomingMessage,
  response: ServerResponse,
  store: SupabaseAgentRepository,
  runId: string,
): Promise<void> {
  response.writeHead(200, {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no",
  });

  let lastId = Number(request.headers["last-event-id"] ?? "0") || 0;
  let closed = false;
  request.on("close", () => {
    closed = true;
  });

  while (!closed) {
    const events = await store.listEvents(runId, lastId);
    for (const event of events) {
      lastId = event.id;
      response.write(`id: ${event.id}\n`);
      response.write(`event: ${event.type}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    if (events.length === 0) response.write(": keep-alive\n\n");
    await delay(1000);
  }
}

class AuthenticationError extends Error {}

async function resolveRequestContext(request: IncomingMessage): Promise<{ userId: string; workspaceId: string }> {
  const requestPath = new URL(request.url ?? "/", `http://${host}:${port}`).pathname;
  if (!requireAuthentication || requestPath === "/health") {
    const userId = process.env.SWITCHPATH_DEMO_USER_ID?.trim() || "00000000-0000-4000-8000-000000000002";
    return { userId, workspaceId };
  }
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) throw new AuthenticationError("Sign in to use Switchpath");
  let session: ReturnType<typeof verifyApiSessionToken>;
  try {
    session = verifyApiSessionToken(
      authorization.slice("Bearer ".length).trim(),
      requiredEnv("SWITCHPATH_INTERNAL_AUTH_SECRET"),
    );
  } catch (error) {
    throw new AuthenticationError(error instanceof Error ? error.message : "Invalid Switchpath session");
  }
  const user = await repository.resolveOrCreateWorkspaceUser({
    externalAuthId: session.sub,
    email: session.email,
    displayName: session.name,
  });
  return { userId: user.userId, workspaceId: user.workspaceId };
}

function applyCors(request: IncomingMessage, response: ServerResponse): void {
  const origin = request.headers.origin;
  const origins = allowedWebOrigins();
  const isWildcard = origins.includes("*");

  if (
    isWildcard
    || (origin
      && (origin.startsWith("chrome-extension://")
        || origin.startsWith("http://localhost:")
        || origin.startsWith("http://127.0.0.1:")
        || origins.includes(origin)))
  ) {
    response.setHeader("Access-Control-Allow-Origin", origin || "*");
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Last-Event-ID");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function allowedWebOrigins(): string[] {
  return (process.env.SWITCHPATH_WEB_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function parseReasoningEffort(value: string | undefined): ReasoningEffort {
  if (!value) return "medium";
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error("SWITCHPATH_REASONING_EFFORT must be low, medium, or high");
}

function requiredBodyString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value.trim();
}

function optionalBodyString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredBodyBoolean(body: Record<string, unknown>, key: string): boolean {
  const value = body[key];
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
  return value;
}

function optionalBodyBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
  return value;
}

function publicPageUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("Browser context must be a public HTTP or HTTPS URL");
  }
  return url;
}

function objectBodyValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const COMMAND_KINDS: CommandKind[] = [
  "pause",
  "resume",
  "cancel",
  "submit_source",
  "approve_route",
  "reject_route",
  "undo_intervention",
  "retry",
];

type MemoryDecision = "this_run_only" | "save_generalized_rule";
const MEMORY_DECISIONS: MemoryDecision[] = [
  "this_run_only",
  "save_generalized_rule",
];

type BrowserContext = {
  url: string;
  title: string;
  hostname: string;
  capturedAt: string;
};
