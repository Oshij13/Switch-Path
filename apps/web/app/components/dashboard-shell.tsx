"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type WorkspaceMode = "run" | "teach";
type DashboardView = "overview" | "playbooks" | "runs" | "evidence" | "preferences" | "history";

type ResearchRun = {
  id: string;
  playbookVersionId?: string;
  companyName: string;
  companyDomain?: string;
  meetingContext: string;
  researchGoal: string;
  status: string;
  planRevision: number;
  failureMessage?: string;
};

type ResearchRunSummary = {
  id: string;
  companyName: string;
  companyDomain?: string;
  meetingContext: string;
  researchGoal: string;
  status: string;
  planRevision: number;
  failureMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  sourceCount: number;
  claimCount: number;
  interventionCount: number;
  briefReady: boolean;
  pdfReady: boolean;
};

type PlannedAction = {
  id: string;
  sequence: number;
  kind: string;
  title: string;
  objective: string;
  status: string;
  appliedSourceRuleIds?: string[];
};

type ResearchPlan = {
  revision: number;
  reason: string;
  actions: PlannedAction[];
};

type RunEvent = {
  id: number;
  type: string;
  payload?: Record<string, unknown>;
};

type BrowserContext = {
  url: string;
  title: string;
  hostname: string;
  capturedAt: string;
};

type TeachingStep = {
  id: string;
  sequence: number;
  url?: string;
  title: string;
  hostname?: string;
  capturedAt: string;
  userNote?: string;
};

type TeachingSession = {
  id?: string;
  status: "idle" | "recording" | "review";
  captureMode?: "observed_browser_session" | "written_instructions";
  writtenInstructions?: string;
  startedAt?: string;
  finishedAt?: string;
  steps: TeachingStep[];
};

type EditableTeachingStep = {
  id: string;
  title: string;
  objective: string;
  instructions: string;
  capturedUrl?: string;
};

type ResultEvidence = {
  id: string;
  sourceId: string;
  sourceUrl: string;
  sourceTitle: string;
  excerpt: string;
  locator?: string;
  relevanceScore?: number;
  credibilityScore?: number;
};

type ResultSource = {
  id: string;
  url: string;
  title: string;
  domain: string;
  kind: string;
  retrievalStatus: string;
  summary?: string;
  retrievedAt?: string;
  promptInjectionSignals: string[];
};

type ResultClaim = {
  id: string;
  kind: "sourced_fact" | "agent_interpretation" | "unsupported_hypothesis";
  status: string;
  statement: string;
  rationale?: string;
  confidence?: number;
  evidence: Array<ResultEvidence & { relationship: string }>;
};

type RunResults = {
  runId: string;
  revision: number;
  latestSummary?: string;
  sources: ResultSource[];
  evidence: ResultEvidence[];
  claims: ResultClaim[];
  uncertainties: string[];
};

type BriefCitation = {
  evidenceId: string;
  sourceUrl: string;
  sourceTitle: string;
  excerpt: string;
};

type BriefItem = {
  text: string;
  kind: "sourced_fact" | "agent_interpretation" | "unsupported_hypothesis";
  claimIds: string[];
  citations: BriefCitation[];
};

type MeetingBrief = {
  runId: string;
  revision: number;
  companyName: string;
  generatedAt: string;
  shortSummary: string;
  accountBrief: BriefItem[];
  salesOpportunities: BriefItem[];
  discoveryQuestions: BriefItem[];
  recommendedStrategy: BriefItem[];
  agentSuggestions: BriefItem[];
  unknowns: string[];
};

type GeneralizedSourceRule = {
  title: string;
  domainStrategy: string;
  sourceCategory: string;
  pathKeywords: string[];
  queryTemplate: string;
  discoveryInstruction: string;
  useWhen: string[];
  applicabilityChecks: string[];
  avoidWhen: string[];
  rationale: string;
};

type PlaybookDetails = {
  id: string;
  name: string;
  description?: string;
  status: string;
  version: {
    id: string;
    number: number;
    sourceKind: string;
    status: string;
    changeSummary?: string;
    approvedAt?: string;
    createdAt: string;
    isCurrent: boolean;
  };
  steps: Array<{
    id: string;
    position: number;
    title: string;
    objective: string;
    instructions?: string;
    actionHint?: string;
    approvalRequired: boolean;
  }>;
  sourceRules: Array<{
    id: string;
    title: string;
    ruleDefinition: GeneralizedSourceRule;
    priority: number;
    active: boolean;
    createdAt: string;
    origin?: {
      interventionId: string;
      runId: string;
      companyName?: string;
      proposedUrl?: string;
      proposedPageTitle?: string;
    };
  }>;
};

type PlaybookVersionSummary = {
  id: string;
  playbookId: string;
  number: number;
  sourceKind: string;
  status: string;
  changeSummary?: string;
  approvedAt?: string;
  createdAt: string;
  isCurrent: boolean;
};

type WorkspaceEvidenceIndex = {
  generatedAt: string;
  runs: Array<{
    id: string;
    companyName: string;
    status: string;
    revision: number;
    updatedAt: string;
  }>;
  sources: Array<ResultSource & {
    runId: string;
    companyName: string;
    revision: number;
  }>;
  evidence: Array<ResultEvidence & {
    runId: string;
    companyName: string;
    revision: number;
    capturedAt: string;
  }>;
  claims: Array<ResultClaim & {
    runId: string;
    companyName: string;
    revision: number;
    createdAt: string;
  }>;
};

type MemoryCandidate = {
  run: {
    id: string;
    companyName: string;
    researchGoal: string;
    status: string;
    planRevision: number;
  };
  intervention: {
    id: string;
    proposedUrl: string;
    proposedPageTitle?: string;
    comparison?: {
      expectedBenefit: string;
      recommendation: string;
      risks: string[];
    };
  };
};

type MemoryResult = {
  sourceRule?: {
    title: string;
    ruleDefinition: GeneralizedSourceRule;
  };
};

type RevisionImpact = {
  runId: string;
  companyName: string;
  fromRevision: number;
  toRevision: number;
  status: "processing" | "ready";
  intervention: {
    id: string;
    proposedUrl: string;
    proposedPageTitle?: string;
    instruction: string;
  };
  changed: Array<{
    kind: "added" | "revised" | "removed";
    previous?: ResultClaim;
    current?: ResultClaim;
  }>;
  retained: ResultClaim[];
  evidence: Array<ResultEvidence & { introducedSource: boolean }>;
};

type DemoResetResult = {
  removedRuns: number;
  removedLearnedRules: number;
};

type WorkspaceHistory = {
  generatedAt: string;
  playbookVersions: Array<PlaybookVersionSummary & { playbookName: string }>;
  planRevisions: Array<{
    runId: string;
    companyName: string;
    revision: number;
    reason: string;
    createdAt: string;
    current: boolean;
  }>;
  interventions: Array<{
    id: string;
    runId: string;
    companyName: string;
    baseRevision: number;
    resultingRevision?: number;
    interventionType: "add_source" | "replace_source" | "change_objective" | "challenge_conclusion";
    proposedUrl: string;
    proposedPageTitle?: string;
    selectedText?: string;
    instruction: string;
    inputMode: "typed" | "voice";
    status: string;
    memoryDecision?: string;
    undoneAt?: string;
    undoRunId?: string;
    undoRevision?: number;
    createdAt?: string;
  }>;
  events: Array<{
    id: number;
    runId: string;
    companyName: string;
    revision: number;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
};

function getDefaultApiBase(): string {
  if (process.env.NEXT_PUBLIC_SWITCHPATH_API_BASE) {
    return process.env.NEXT_PUBLIC_SWITCHPATH_API_BASE;
  }
  if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return "https://switch-path.onrender.com";
  }
  return "http://127.0.0.1:4317";
}

const API_BASE = getDefaultApiBase();

const navItems = [
  { label: "Overview", glyph: "O" },
  { label: "Playbooks", glyph: "P" },
  { label: "Research runs", glyph: "R", count: "03" },
  { label: "Evidence", glyph: "E" },
  { label: "Preferences", glyph: "M" },
  { label: "History", glyph: "H" },
];

const evidenceTypes = [
  { label: "Sourced fact", tone: "verified" },
  { label: "Agent interpretation", tone: "interpretation" },
  { label: "Unsupported hypothesis", tone: "hypothesis" },
];

export function DashboardShell({
  apiToken,
  signedInUser,
}: {
  apiToken?: string;
  signedInUser?: { name: string; email: string };
}) {
  const fetch = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => authenticatedFetch(input, init, apiToken),
    [apiToken],
  );
  const [mode, setMode] = useState<WorkspaceMode>("run");
  const [view, setView] = useState<DashboardView>("overview");
  const [extensionConnection, setExtensionConnection] = useState<"idle" | "connecting" | "connected" | "error">("connecting");
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);

  function goToOverview() {
    if (teachingSession.status === "recording") {
      void fetch(`${API_BASE}/teaching-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
    }
    setMode("run");
    setView("overview");
    setCompany("");
    setWebsite("");
    setMeeting("");
    setResearchGoal("");
    setNotice("");
    setRun(null);
    setPlan(null);
    setRunEvents([]);
    setResults(null);
    setRevisionImpact(null);
    setBrief(null);
    setBriefBusy(false);
    setBriefError("");
    setPdfBusy(false);
    setPdfError("");
    setRunBusy(false);
    setRunError("");
    setMemoryCandidate(null);
    setMemoryResult(null);
    setMemoryBusy(false);
    setMemoryError("");
    setDismissedMemoryId(null);
    setCancelDialogOpen(false);
    setResetDialogOpen(false);
    setResetError("");
    setTeachingSession({ status: "idle", steps: [] });
    setTeachError("");
    setWorkflowName("");
    setWorkflowDescription("");
    setEditableTeachingSteps([]);
    setTeachSavedPlaybook(null);
    window.setTimeout(() => {
      document.getElementById("top")?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  }

  const [company, setCompany] = useState("");
  const [meeting, setMeeting] = useState("");
  const [website, setWebsite] = useState("");
  const [researchGoal, setResearchGoal] = useState("");
  const [notice, setNotice] = useState("");
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [plan, setPlan] = useState<ResearchPlan | null>(null);
  const [runEvents, setRunEvents] = useState<RunEvent[]>([]);
  const [results, setResults] = useState<RunResults | null>(null);
  const [revisionImpact, setRevisionImpact] = useState<RevisionImpact | null>(null);
  const [brief, setBrief] = useState<MeetingBrief | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState("");
  const [browserContext, setBrowserContext] = useState<BrowserContext | null>(null);
  const [teachingSession, setTeachingSession] = useState<TeachingSession>({ status: "idle", steps: [] });
  const [teachBusy, setTeachBusy] = useState(false);
  const [teachError, setTeachError] = useState("");
  const [teachCaptureMode, setTeachCaptureMode] = useState<"observed_browser_session" | "written_instructions">("observed_browser_session");
  const [writtenWorkflow, setWrittenWorkflow] = useState("");
  const [workflowName, setWorkflowName] = useState("");
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [editableTeachingSteps, setEditableTeachingSteps] = useState<EditableTeachingStep[]>([]);
  const [teachSavedPlaybook, setTeachSavedPlaybook] = useState<PlaybookDetails | null>(null);
  const [memoryCandidate, setMemoryCandidate] = useState<MemoryCandidate | null>(null);
  const [memoryResult, setMemoryResult] = useState<MemoryResult | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryError, setMemoryError] = useState("");
  const [dismissedMemoryId, setDismissedMemoryId] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [runSummaries, setRunSummaries] = useState<ResearchRunSummary[]>([]);
  const [runSummariesLoading, setRunSummariesLoading] = useState(true);
  const [runSummariesError, setRunSummariesError] = useState("");
  const [playbook, setPlaybook] = useState<PlaybookDetails | null>(null);
  const [playbooks, setPlaybooks] = useState<PlaybookDetails[]>([]);
  const [selectedPlaybookVersionId, setSelectedPlaybookVersionId] = useState("");
  const [playbookLoading, setPlaybookLoading] = useState(true);
  const [playbookError, setPlaybookError] = useState("");
  const [ruleBusyId, setRuleBusyId] = useState<string | null>(null);
  const [playbookNotice, setPlaybookNotice] = useState("");
  const [evidenceIndex, setEvidenceIndex] = useState<WorkspaceEvidenceIndex | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(true);
  const [evidenceError, setEvidenceError] = useState("");
  const [history, setHistory] = useState<WorkspaceHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const postExtensionConfiguration = useCallback(() => {
    window.postMessage({
      type: "switchpath:configure-extension",
      apiBase: API_BASE,
      apiToken: apiToken ?? "",
    }, window.location.origin);
  }, [apiToken]);

  const connectChromeExtension = useCallback(() => {
    setExtensionConnection("connecting");
    postExtensionConfiguration();
    window.setTimeout(() => {
      setExtensionConnection((current) => current === "connecting" ? "error" : current);
    }, 2_000);
  }, [postExtensionConfiguration]);

  useEffect(() => {
    function receiveExtensionStatus(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data?.type === "switchpath:extension-ready") {
        postExtensionConfiguration();
        return;
      }
      if (event.data?.type !== "switchpath:extension-configured") return;
      setExtensionConnection(event.data.ok ? "connected" : "error");
      if (!event.data.ok) setNotice(event.data.error || "The Chrome extension could not be connected");
    }
    window.addEventListener("message", receiveExtensionStatus);
    postExtensionConfiguration();
    const timeout = window.setTimeout(() => {
      setExtensionConnection((current) => current === "connecting" ? "error" : current);
    }, 2_000);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", receiveExtensionStatus);
    };
  }, [postExtensionConfiguration]);

  useEffect(() => {
    if (view !== "history") return;
    let cancelled = false;
    async function loadHistory() {
      setHistoryLoading(true);
      try {
        const response = await fetch(`${API_BASE}/history`, { cache: "no-store" });
        const payload = (await response.json()) as { history?: WorkspaceHistory; error?: string };
        if (!response.ok || !payload.history) throw new Error(payload.error || "Unable to load workspace history");
        if (!cancelled) {
          setHistory(payload.history);
          setHistoryError("");
        }
      } catch (loadError) {
        if (!cancelled) setHistoryError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [fetch, view]);

  useEffect(() => {
    if (view !== "evidence") return;
    let cancelled = false;
    async function loadEvidenceIndex() {
      try {
        const response = await fetch(`${API_BASE}/evidence`, { cache: "no-store" });
        const payload = (await response.json()) as { evidence?: WorkspaceEvidenceIndex; error?: string };
        if (!response.ok || !payload.evidence) {
          throw new Error(payload.error || "Unable to load the workspace evidence index");
        }
        if (!cancelled) {
          setEvidenceIndex(payload.evidence);
          setEvidenceError("");
        }
      } catch (error) {
        if (!cancelled) setEvidenceError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setEvidenceLoading(false);
      }
    }
    void loadEvidenceIndex();
    return () => {
      cancelled = true;
    };
  }, [fetch, view]);

  useEffect(() => {
    let cancelled = false;
    async function loadPlaybook() {
      try {
        const response = await fetch(`${API_BASE}/playbooks`, { cache: "no-store" });
        const payload = (await response.json()) as { playbooks?: PlaybookDetails[]; error?: string };
        if (!response.ok || !payload.playbooks) {
          throw new Error(payload.error || "Unable to load the account research playbooks");
        }
        if (!cancelled) {
          setPlaybooks(payload.playbooks);
          setPlaybook((current) => current ?? payload.playbooks?.[0] ?? null);
          setSelectedPlaybookVersionId((current) =>
            payload.playbooks?.some((item) => item.version.id === current)
              ? current
              : payload.playbooks?.[0]?.version.id ?? "",
          );
          setPlaybookError("");
        }
      } catch (error) {
        if (!cancelled) setPlaybookError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setPlaybookLoading(false);
      }
    }
    void loadPlaybook();
    return () => {
      cancelled = true;
    };
  }, [fetch]);

  useEffect(() => {
    if (mode !== "teach") return;
    let cancelled = false;
    async function refreshTeachingSession() {
      try {
        const response = await fetch(`${API_BASE}/teaching-session`, { cache: "no-store" });
        const payload = (await response.json()) as { session?: TeachingSession; error?: string };
        if (!response.ok || !payload.session) {
          throw new Error(payload.error || "Unable to read the teaching session");
        }
        if (!cancelled) {
          setTeachingSession(payload.session);
          if (payload.session.status === "review") {
            setEditableTeachingSteps((current) => current.length > 0 ? current : editableStepsFromSession(payload.session?.steps ?? []));
          }
          setTeachError("");
        }
      } catch (error) {
        if (!cancelled) setTeachError(error instanceof Error ? error.message : String(error));
      }
    }
    void refreshTeachingSession();
    const interval = window.setInterval(refreshTeachingSession, 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetch, mode]);

  useEffect(() => {
    let cancelled = false;
    async function refreshRunSummaries() {
      try {
        const response = await fetch(`${API_BASE}/runs`, { cache: "no-store" });
        const payload = (await response.json()) as { runs?: ResearchRunSummary[]; error?: string };
        if (!response.ok || !payload.runs) {
          throw new Error(payload.error || "Unable to load research runs");
        }
        if (!cancelled) {
          setRunSummaries(payload.runs);
          setRunSummariesError("");
        }
      } catch (error) {
        if (!cancelled) setRunSummariesError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setRunSummariesLoading(false);
      }
    }
    void refreshRunSummaries();
    const interval = window.setInterval(refreshRunSummaries, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetch]);

  useEffect(() => {
    let cancelled = false;
    async function loadActiveRun() {
      try {
        let response = await fetch(`${API_BASE}/active-run`, { cache: "no-store" });
        if (!response.ok) return;
        let payload = (await response.json()) as { run: ResearchRun | null };
        if (!payload.run) {
          response = await fetch(`${API_BASE}/latest-run`, { cache: "no-store" });
          if (!response.ok) return;
          payload = (await response.json()) as { run: ResearchRun | null };
        }
        if (!cancelled && payload.run && runIsInProgress(payload.run)) {
          setRun(payload.run);
          setCompany(payload.run.companyName);
          setWebsite(payload.run.companyDomain ?? "");
          setMeeting(payload.run.meetingContext);
          setResearchGoal(payload.run.researchGoal);
        }
      } catch {
        // The setup form remains usable and reports a concrete error on submit.
      }
    }
    void loadActiveRun();
    return () => {
      cancelled = true;
    };
  }, [fetch]);

  useEffect(() => {
    let cancelled = false;
    async function loadBrowserContext() {
      try {
        const response = await fetch(`${API_BASE}/browser-context`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { context: BrowserContext | null };
        if (!cancelled && payload.context) {
          setBrowserContext((current) =>
            current?.capturedAt === payload.context?.capturedAt
              ? current
              : payload.context,
          );
        }
      } catch {
        // Chrome capture is optional while the local API is unavailable.
      }
    }
    void loadBrowserContext();
    const interval = window.setInterval(loadBrowserContext, 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetch]);

  useEffect(() => {
    if (!run?.id) return;
    let cancelled = false;
    async function refreshRun() {
      try {
        const [runResponse, planResponse, eventsResponse, resultsResponse, briefResponse, impactResponse] = await Promise.all([
          fetch(`${API_BASE}/runs/${run.id}`, { cache: "no-store" }),
          fetch(`${API_BASE}/runs/${run.id}/plan`, { cache: "no-store" }),
          fetch(`${API_BASE}/runs/${run.id}/events`, { cache: "no-store" }),
          fetch(`${API_BASE}/runs/${run.id}/results`, { cache: "no-store" }),
          fetch(`${API_BASE}/runs/${run.id}/brief`, { cache: "no-store" }),
          fetch(`${API_BASE}/runs/${run.id}/revision-impact`, { cache: "no-store" }),
        ]);
        if (!runResponse.ok) throw new Error("Unable to refresh the research run");
        const runPayload = (await runResponse.json()) as { run: ResearchRun };
        const planPayload = planResponse.ok
          ? ((await planResponse.json()) as { plan: ResearchPlan | null })
          : { plan: null };
        const eventsPayload = eventsResponse.ok
          ? ((await eventsResponse.json()) as { events: RunEvent[] })
          : { events: [] };
        const resultsPayload = resultsResponse.ok
          ? ((await resultsResponse.json()) as { results: RunResults })
          : { results: null };
        const briefPayload = briefResponse.ok
          ? ((await briefResponse.json()) as { brief: MeetingBrief | null })
          : { brief: null };
        const impactPayload = impactResponse.ok
          ? ((await impactResponse.json()) as { impact: RevisionImpact | null })
          : { impact: null };
        if (!cancelled) {
          setRun(runPayload.run);
          setPlan(planPayload.plan);
          setRunEvents(eventsPayload.events);
          setResults(resultsPayload.results);
          setBrief(briefPayload.brief);
          setRevisionImpact(impactPayload.impact);
        }
      } catch (error) {
        if (!cancelled) {
          setRunError(error instanceof Error ? error.message : String(error));
        }
      }
    }
    void refreshRun();
    const interval = window.setInterval(refreshRun, 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetch, run?.id]);

  const memoryRunId = run?.id;
  const memoryRunStatus = run?.status;

  useEffect(() => {
    if (memoryResult || !memoryRunId || memoryRunStatus !== "completed" || !brief) {
      setMemoryCandidate(null);
      return;
    }
    let cancelled = false;
    async function loadCandidate() {
      try {
        const response = await fetch(
          `${API_BASE}/memory-candidate?runId=${encodeURIComponent(memoryRunId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as { candidate: MemoryCandidate | null };
        if (cancelled) return;
        setMemoryCandidate(payload.candidate);
        if (payload.candidate) {
          const candidateId = payload.candidate.intervention.id;
          const wasDismissed = window.localStorage.getItem(memoryDismissalKey(candidateId)) === "1";
          setDismissedMemoryId(wasDismissed ? candidateId : null);
        } else {
          setDismissedMemoryId(null);
        }
      } catch {
        // The dashboard remains usable while the local backend is offline.
      }
    }
    void loadCandidate();
    const interval = window.setInterval(loadCandidate, 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [brief, fetch, memoryResult, memoryRunId, memoryRunStatus]);

  function dismissMemoryCandidate() {
    const interventionId = memoryCandidate?.intervention.id;
    if (!interventionId) return;
    window.localStorage.setItem(memoryDismissalKey(interventionId), "1");
    setDismissedMemoryId(interventionId);
  }

  async function changeTeachingSession(action: "start" | "finish" | "cancel") {
    setTeachBusy(true);
    setTeachError("");
    try {
      const response = await fetch(`${API_BASE}/teaching-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          captureMode: action === "start" ? teachCaptureMode : undefined,
          writtenInstructions: action === "start" && teachCaptureMode === "written_instructions" ? writtenWorkflow : undefined,
        }),
      });
      const payload = (await response.json()) as { session?: TeachingSession; error?: string };
      if (!response.ok || !payload.session) {
        throw new Error(payload.error || "Unable to update the teaching session");
      }
      setTeachingSession(payload.session);
      if (action === "start") {
        setWorkflowName("");
        setWorkflowDescription("");
        setEditableTeachingSteps([]);
        setTeachSavedPlaybook(null);
        if (payload.session.status === "review") {
          setEditableTeachingSteps(editableStepsFromSession(payload.session.steps));
        }
      } else if (action === "finish") {
        setEditableTeachingSteps(editableStepsFromSession(payload.session.steps));
      } else {
        setWorkflowName("");
        setWorkflowDescription("");
        setEditableTeachingSteps([]);
        setTeachSavedPlaybook(null);
        setWrittenWorkflow("");
      }
      setNotice("");
    } catch (error) {
      setTeachError(error instanceof Error ? error.message : String(error));
    } finally {
      setTeachBusy(false);
    }
  }

  function updateTeachingStep(id: string, field: "title" | "objective" | "instructions", value: string) {
    setEditableTeachingSteps((steps) => steps.map((step) => step.id === id ? { ...step, [field]: value } : step));
  }

  function moveTeachingStep(id: string, direction: -1 | 1) {
    setEditableTeachingSteps((steps) => {
      const index = steps.findIndex((step) => step.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= steps.length) return steps;
      const reordered = [...steps];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  }

  function removeTeachingStep(id: string) {
    setEditableTeachingSteps((steps) => steps.filter((step) => step.id !== id));
  }

  async function saveTeachingPlaybook() {
    if (!workflowName.trim()) {
      setTeachError("Give this workflow a name before saving it.");
      return;
    }
    if (editableTeachingSteps.length === 0) {
      setTeachError("Keep at least one workflow step before saving it.");
      return;
    }
    if (editableTeachingSteps.some((step) => !step.title.trim() || !step.objective.trim())) {
      setTeachError("Every workflow step needs a title and purpose.");
      return;
    }
    setTeachBusy(true);
    setTeachError("");
    try {
      const response = await fetch(`${API_BASE}/teaching-session/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workflowName,
          description: workflowDescription,
          steps: editableTeachingSteps.map(({ title, objective, instructions }) => ({
            title,
            objective,
            instructions,
          })),
        }),
      });
      const payload = (await response.json()) as { playbook?: PlaybookDetails; error?: string };
      if (!response.ok || !payload.playbook) {
        throw new Error(payload.error || "Unable to save the reviewed workflow");
      }
      setTeachSavedPlaybook(payload.playbook);
      setPlaybook(payload.playbook);
      setPlaybooks((current) => [payload.playbook!, ...current.filter((item) => item.id !== payload.playbook?.id)]);
      setSelectedPlaybookVersionId(payload.playbook.version.id);
      setPlaybookNotice(`${payload.playbook.name} was saved from the reviewed teaching route.`);
    } catch (error) {
      setTeachError(error instanceof Error ? error.message : String(error));
    } finally {
      setTeachBusy(false);
    }
  }

  async function saveMemoryDecision(
    decision: "this_run_only" | "save_generalized_rule",
  ) {
    if (!memoryCandidate) return;
    setMemoryBusy(true);
    setMemoryError("");
    try {
      const response = await fetch(
        `${API_BASE}/runs/${memoryCandidate.run.id}/memory`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      const payload = (await response.json()) as MemoryResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save route preference");
      setMemoryResult(payload);
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : String(error));
    } finally {
      setMemoryBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunBusy(true);
    setRunError("");
    setNotice("");
    try {
      const companyDomain = normalizedDomain(website);
      const response = await fetch(`${API_BASE}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: company.trim(),
          companyDomain,
          meetingContext: meeting.trim(),
          researchGoal: researchGoal.trim(),
          playbookVersionId: selectedPlaybookVersionId,
        }),
      });
      const payload = (await response.json()) as { run?: ResearchRun; error?: string };
      if (!response.ok || !payload.run) {
        throw new Error(payload.error || "Unable to start account research");
      }
      setRun(payload.run);
      setPlan(null);
      setRunEvents([]);
      setResults(null);
      setRevisionImpact(null);
      setBrief(null);
      setBriefError("");
      setPdfError("");
      setMemoryCandidate(null);
      setMemoryResult(null);
      setDismissedMemoryId(null);
      setNotice(`Research started for ${payload.run.companyName}. The route will appear as it is planned.`);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunBusy(false);
    }
  }

  async function generateBrief() {
    if (!run || run.status !== "completed") return;
    setBriefBusy(true);
    setBriefError("");
    try {
      const response = await fetch(`${API_BASE}/runs/${run.id}/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as { brief?: MeetingBrief; error?: string };
      if (!response.ok || !payload.brief) {
        throw new Error(payload.error || "Unable to generate the meeting brief");
      }
      setBrief(payload.brief);
    } catch (error) {
      setBriefError(error instanceof Error ? error.message : String(error));
    } finally {
      setBriefBusy(false);
    }
  }

  async function downloadBriefPdf() {
    if (!run || !brief) return;
    setPdfBusy(true);
    setPdfError("");
    try {
      const response = await fetch(`${API_BASE}/runs/${run.id}/brief.pdf`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Unable to generate the PDF");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${safeDownloadName(brief.companyName)}-meeting-brief-r${brief.revision}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : String(error));
    } finally {
      setPdfBusy(false);
    }
  }

  async function openHistoricalRun(runId: string) {
    setRunError("");
    try {
      const response = await fetch(`${API_BASE}/runs/${runId}`, { cache: "no-store" });
      const payload = (await response.json()) as { run?: ResearchRun; error?: string };
      if (!response.ok || !payload.run) throw new Error(payload.error || "Unable to open research run");
      setRun(payload.run);
      setCompany(payload.run.companyName);
      setWebsite(payload.run.companyDomain ?? "");
      setMeeting(payload.run.meetingContext);
      setResearchGoal(payload.run.researchGoal);
      setBrief(null);
      setResults(null);
      setRevisionImpact(null);
      setPlan(null);
      setRunEvents([]);
      setView("overview");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setRunSummariesError(error instanceof Error ? error.message : String(error));
    }
  }

  async function retryHistoricalRun(runId: string) {
    setRunSummariesError("");
    try {
      const response = await fetch(`${API_BASE}/runs/${runId}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "retry", payload: {} }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to retry research");
      await openHistoricalRun(runId);
    } catch (error) {
      setRunSummariesError(error instanceof Error ? error.message : String(error));
    }
  }

  async function undoHistoricalIntervention(runId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/runs/${runId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "undo_intervention", payload: {} }),
    });
    const payload = (await response.json()) as { restoredRun?: ResearchRun; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to undo this intervention");
    if (payload.restoredRun) {
      setNotice("The pre-intervention route was restored as a new audited research run.");
      await openHistoricalRun(payload.restoredRun.id);
      return;
    }
    setNotice("Undo requested. Switchpath will restore the earlier route at the next checkpoint.");
    await openHistoricalRun(runId);
  }

  async function downloadHistoricalPdf(item: ResearchRunSummary) {
    setRunSummariesError("");
    try {
      const response = await fetch(`${API_BASE}/runs/${item.id}/brief.pdf`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Unable to download the PDF");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${safeDownloadName(item.companyName)}-meeting-brief-r${item.planRevision}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setRunSummariesError(error instanceof Error ? error.message : String(error));
    }
  }

  async function resetDemoWorkspace() {
    setResetBusy(true);
    setResetError("");
    try {
      const response = await fetch(`${API_BASE}/demo/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const payload = (await response.json()) as { result?: DemoResetResult; error?: string };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || "Unable to reset the demo workspace");
      }
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith("switchpath:")) window.localStorage.removeItem(key);
      }
      const playbooksResponse = await fetch(`${API_BASE}/playbooks`, { cache: "no-store" });
      const playbooksPayload = (await playbooksResponse.json()) as { playbooks?: PlaybookDetails[] };
      const refreshedPlaybooks = playbooksPayload.playbooks ?? playbooks;
      goToOverview();
      setBrowserContext(null);
      setRunSummaries([]);
      setRunSummariesLoading(false);
      setEvidenceIndex(null);
      setEvidenceLoading(false);
      setPlaybooks(refreshedPlaybooks);
      setPlaybook(refreshedPlaybooks[0] ?? null);
      setSelectedPlaybookVersionId(refreshedPlaybooks[0]?.version.id ?? "");
      setNotice(
        `Demo reset complete. Cleared ${payload.result.removedRuns} practice run${payload.result.removedRuns === 1 ? "" : "s"} from demo views; saved playbooks were kept.`,
      );
    } catch (error) {
      setResetError(error instanceof Error ? error.message : String(error));
    } finally {
      setResetBusy(false);
    }
  }

  async function setRuleActive(ruleId: string, active: boolean) {
    setRuleBusyId(ruleId);
    setPlaybookError("");
    setPlaybookNotice("");
    try {
      const response = await fetch(`${API_BASE}/source-rules/${ruleId}/activation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update the learned route");
      setPlaybook((current) => current
        ? {
            ...current,
            sourceRules: current.sourceRules.map((rule) =>
              rule.id === ruleId ? { ...rule, active } : rule,
            ),
          }
        : current);
      setPlaybooks((current) => current.map((item) => ({
        ...item,
        sourceRules: item.sourceRules.map((rule) => rule.id === ruleId ? { ...rule, active } : rule),
      })));
      setPlaybookNotice(
        active
          ? "Learned route activated. Future research plans may apply it."
          : "Learned route deactivated. Its audit history is retained, but future runs will not apply it.",
      );
    } catch (error) {
      setPlaybookError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuleBusyId(null);
    }
  }

  async function sendRunCommand(
    kind: "pause" | "resume" | "cancel" | "retry",
    commandPayload: Record<string, unknown> = {},
  ) {
    if (!run) return;
    setRunBusy(true);
    setRunError("");
    try {
      const response = await fetch(`${API_BASE}/runs/${run.id}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, payload: commandPayload }),
      });
      const commandResult = (await response.json()) as { run?: ResearchRun; error?: string };
      if (!response.ok) throw new Error(commandResult.error || `Unable to ${kind} research`);
      if (commandResult.run) setRun(commandResult.run);
      if (kind === "pause") {
        setNotice("Pause requested. Switchpath will pause at the next safe checkpoint.");
      } else if (kind === "cancel" && commandPayload.mode === "immediate") {
        setNotice("Research stopped now. Any late result from the interrupted step will be discarded.");
      } else if (kind === "cancel") {
        setNotice("Safe stop requested. Switchpath will stop after the current step finishes.");
      } else {
        setNotice(`${humanize(kind)} requested.`);
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunBusy(false);
      setCancelDialogOpen(false);
    }
  }

  const runIsTerminal = run ? ["completed", "failed", "cancelled"].includes(run.status) : false;
  const runIsActive = Boolean(run && !runIsTerminal);
  const learnedRules = learnedRulesFromEvents(runEvents);
  const selectedRunPlaybook = playbooks.find(
    (item) => item.version.id === selectedPlaybookVersionId,
  ) ?? null;
  const activeRunPlaybook = playbooks.find(
    (item) => item.version.id === run?.playbookVersionId,
  ) ?? selectedRunPlaybook;
  const teachingRoutePreview = teachingSession.status === "review" && editableTeachingSteps.length > 0
    ? editableTeachingSteps.map((step, index) => ({
        id: step.id,
        sequence: index + 1,
        title: step.title,
        url: step.capturedUrl,
      }))
    : teachingSession.steps;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div>
          <button className="brand brand-button" onClick={goToOverview} type="button" aria-label="Go to overview">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
            </span>
            <span className="brand-word">Switchpath</span>
          </button>

          <div className="workspace-label">
            <span>Prospecting workspace</span>
            <button type="button" aria-label="Switch workspace">
              ABC
            </button>
          </div>

          <nav className="nav-list">
            {navItems.map((item) => (
              <button
                className={
                  (item.label === "Research runs" && view === "runs")
                    || (item.label === "Playbooks" && view === "playbooks")
                    || (item.label === "Evidence" && view === "evidence")
                    || (item.label === "Preferences" && view === "preferences")
                    || (item.label === "History" && view === "history")
                    || (item.label === "Overview" && view === "overview")
                    ? "nav-item nav-item-active"
                    : "nav-item"
                }
                key={item.label}
                onClick={() => {
                  if (item.label === "Research runs") {
                    setView("runs");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    return;
                  }
                  if (item.label === "Playbooks") {
                    setView("playbooks");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    return;
                  }
                  if (item.label === "Evidence") {
                    setEvidenceLoading(true);
                    setView("evidence");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    return;
                  }
                  if (item.label === "Preferences") {
                    setView("preferences");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    return;
                  }
                  if (item.label === "History") {
                    setView("history");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    return;
                  }
                  goToOverview();
                }}
                type="button"
              >
                <span className="nav-glyph" aria-hidden="true">
                  {item.glyph}
                </span>
                <span>{item.label}</span>
                {item.count ? <span className="nav-count">{String(runSummaries.length).padStart(2, "0")}</span> : null}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div
            className="chrome-status chrome-status-clickable"
            onClick={() => setExtensionModalOpen(true)}
            role="button"
            tabIndex={0}
          >
            <span
              className={`status-dot ${
                extensionConnection === "connected"
                  ? "status-dot-connected"
                  : extensionConnection === "connecting"
                    ? "status-dot-connecting"
                    : "status-dot-disconnected"
              }`}
              aria-hidden="true"
            />
            <div>
              <strong>
                {extensionConnection === "connected"
                  ? "Chrome connected"
                  : extensionConnection === "connecting"
                    ? "Connecting Chrome..."
                    : "Chrome disconnected"}
              </strong>
              <span>
                {extensionConnection === "connected"
                  ? "Ready to observe"
                  : extensionConnection === "connecting"
                    ? "Waiting for extension"
                    : "Click to pair extension"}
              </span>
            </div>
          </div>
          <div className="profile-row">
            <span className="avatar">ABC</span>
            <div>
              <strong>{signedInUser?.name || "ABC"}</strong>
              <span>{signedInUser?.email || "Account executive"}</span>
            </div>
            {signedInUser ? <a aria-label="Sign out" href="/signout-with-chatgpt?return_to=%2F">Sign out</a> : <span />}
          </div>
        </div>
      </aside>

      <main className="workspace" id="top">
        <header className="topbar">
          <div className="topbar-location">
            {view !== "overview" ? (
              <button className="topbar-back" onClick={goToOverview} type="button" aria-label="Back to Overview">
                <span aria-hidden="true">←</span>
                <span>Back to Overview</span>
              </button>
            ) : null}
            <div className="topbar-context">
              <span className="eyebrow">Research workspace</span>
              <strong>{view === "runs" ? "Research runs" : view === "playbooks" ? "Playbooks" : view === "evidence" ? "Evidence" : view === "preferences" ? "Preferences" : view === "history" ? "History" : "Early prospecting"}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <button className={`extension-connect-button ${extensionConnection}`} onClick={() => setExtensionModalOpen(true)} type="button">
              <span aria-hidden="true">{extensionConnection === "connected" ? "✓" : "↗"}</span>
              {extensionConnection === "connecting" ? "Connecting…" : extensionConnection === "connected" ? "Chrome connected" : extensionConnection === "error" ? "Retry Chrome" : "Connect Chrome"}
            </button>
            <button className="shortcut-button" type="button">
              <span>Redirect research</span>
              <kbd>Ctrl</kbd>
              <kbd>Shift</kbd>
              <kbd>Y</kbd>
            </button>
            <button
              className="reset-demo-button"
              onClick={() => {
                setResetError("");
                setResetDialogOpen(true);
              }}
              type="button"
            >
              Reset demo
            </button>
          </div>
        </header>

        <div className="workspace-content">
          {view === "runs" ? (
            <ResearchRunsPage
              error={runSummariesError}
              loading={runSummariesLoading}
              onDownloadPdf={(item) => void downloadHistoricalPdf(item)}
              onOpen={(runId) => void openHistoricalRun(runId)}
              onRetry={(runId) => void retryHistoricalRun(runId)}
              runs={runSummaries}
            />
          ) : view === "playbooks" ? (
            <PlaybooksPage
              apiToken={apiToken}
              busyRuleId={ruleBusyId}
              error={playbookError}
              loading={playbookLoading}
              notice={playbookNotice}
              onCreateFirstPlaybook={() => {
                setMode("teach");
                setView("overview");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onOpenOrigin={(runId) => void openHistoricalRun(runId)}
              onPlaybookChanged={(updatedPlaybook, makeCurrent) => {
                setPlaybook(updatedPlaybook);
                if (!makeCurrent) return;
                setPlaybooks((current) => current.map((item) =>
                  item.id === updatedPlaybook.id ? updatedPlaybook : item,
                ));
                setSelectedPlaybookVersionId(updatedPlaybook.version.id);
              }}
              onSelectPlaybook={(playbookId) => setPlaybook(playbooks.find((item) => item.id === playbookId) ?? null)}
              onSetRuleActive={(ruleId, active) => void setRuleActive(ruleId, active)}
              playbook={playbook}
              playbooks={playbooks}
            />
          ) : view === "preferences" ? (
            <PreferencesPage
              busyRuleId={ruleBusyId}
              error={playbookError}
              notice={playbookNotice}
              onOpenOrigin={(runId) => void openHistoricalRun(runId)}
              onSetRuleActive={(ruleId, active) => void setRuleActive(ruleId, active)}
              playbooks={playbooks}
            />
          ) : view === "history" ? (
            <HistoryPage
              error={historyError}
              history={history}
              loading={historyLoading}
              onOpenRun={(runId) => void openHistoricalRun(runId)}
              onUndoIntervention={undoHistoricalIntervention}
            />
          ) : view === "evidence" ? (
            <EvidencePage
              error={evidenceError}
              index={evidenceIndex}
              loading={evidenceLoading}
              onOpenRun={(runId) => void openHistoricalRun(runId)}
            />
          ) : (
          <>
          {memoryCandidate && dismissedMemoryId !== memoryCandidate.intervention.id ? (
            <section className="brief-memory-card" aria-labelledby="brief-memory-title">
              <div className="brief-memory-header">
                <div>
                  <span className="section-index">Brief ready · Revision {memoryCandidate.run.planRevision}</span>
                  <h2 id="brief-memory-title">
                    {memoryResult
                      ? "Future behaviour decided"
                      : `${memoryCandidate.run.companyName} meeting brief is ready`}
                  </h2>
                </div>
                <button
                  aria-label="Decide later"
                  className="brief-close"
                  onClick={dismissMemoryCandidate}
                  type="button"
                >
                  ×
                </button>
              </div>

              {memoryResult ? (
                <div className="memory-result" role="status">
                  <span className="memory-result-icon">✓</span>
                  <div>
                    <strong>
                      {memoryResult.sourceRule
                        ? memoryResult.sourceRule.title
                        : "Kept for this meeting only"}
                    </strong>
                    <p>
                      {memoryResult.sourceRule
                        ? "Switchpath will rediscover the relevant official source for each future company; it did not save the original URL."
                        : "The approved route affected this brief, but your saved playbook was not changed."}
                    </p>
                    {memoryResult.sourceRule ? (
                      <div className="saved-rule-preview">
                        <span>{humanize(memoryResult.sourceRule.ruleDefinition.domainStrategy)}</span>
                        <span>{humanize(memoryResult.sourceRule.ruleDefinition.sourceCategory)}</span>
                        {memoryResult.sourceRule.ruleDefinition.pathKeywords.map((keyword) => (
                          <span key={keyword}>{keyword}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  <div className="brief-memory-grid">
                    <div className="brief-summary">
                      <span className="brief-status-pill">Research complete</span>
                      <strong>{memoryCandidate.run.researchGoal}</strong>
                      <p>
                        {memoryCandidate.intervention.comparison?.expectedBenefit
                          || "The approved source route contributed to the completed account research."}
                      </p>
                      <a href={memoryCandidate.intervention.proposedUrl} target="_blank" rel="noreferrer">
                        View introduced source ↗
                      </a>
                    </div>
                    <div className="memory-decision-copy">
                      <span className="field-number">M</span>
                      <div>
                        <h3>Should Switchpath remember this route?</h3>
                        <p>
                          Save it only for this brief, or turn it into a generalized
                          source preference for future meetings.
                        </p>
                        <ul>
                          <li>Resolve the target or verified-parent official domain</li>
                          <li>Search sustainability, impact, waste and packaging sections</li>
                          <li>Verify that parent-level claims apply to the target</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  {memoryError ? <p className="memory-error">{memoryError}</p> : null}
                  <div className="brief-memory-actions">
                    <button
                      className="memory-secondary"
                      disabled={memoryBusy}
                      onClick={() => void saveMemoryDecision("this_run_only")}
                      type="button"
                    >
                      This meeting only
                    </button>
                    <button
                      className="memory-primary"
                      disabled={memoryBusy}
                      onClick={() => void saveMemoryDecision("save_generalized_rule")}
                      type="button"
                    >
                      {memoryBusy ? "Saving preference…" : "Use for future meetings"}
                      <span>→</span>
                    </button>
                  </div>
                </>
              )}
            </section>
          ) : null}

          <section className="intro-row" aria-labelledby="page-title">
            <div>
              <span className="section-index">01 / Prepare</span>
              <h1 id="page-title">
                Know the account.<br />Steer the route.
              </h1>
            </div>
            <p>
              Give Switchpath the meeting context. It follows your playbook,
              shows its work, and waits when you find a stronger path.
            </p>
          </section>

          <section className="primary-grid">
            <div className="setup-card">
              <div className="mode-switch" aria-label="Research setup mode">
                <button
                  className={mode === "run" ? "mode-active" : ""}
                  onClick={() => {
                    if (teachingSession.status === "recording") {
                      setTeachError("Finish or cancel the active teaching session before leaving Teach mode.");
                      return;
                    }
                    setMode("run");
                    setNotice("");
                  }}
                  type="button"
                >
                  Run a playbook
                </button>
                <button
                  className={mode === "teach" ? "mode-active" : ""}
                  onClick={() => {
                    setMode("teach");
                    setRun(null);
                    setPlan(null);
                    setRunEvents([]);
                    setResults(null);
                    setRevisionImpact(null);
                    setBrief(null);
                    setNotice("");
                    setTeachError("");
                  }}
                  type="button"
                >
                  Teach a workflow
                </button>
              </div>

              {mode === "run" ? (
                <form className="research-form" onSubmit={handleSubmit}>
                  <div className="form-heading">
                    <span className="field-number">A</span>
                    <div>
                      <h2>Prepare a new account</h2>
                      <p>Start with the context the agent cannot infer.</p>
                    </div>
                  </div>

                  {browserContext && run ? (
                    <div className="browser-context-card" role="status">
                      <span className="browser-context-icon">↗</span>
                      <div>
                        <strong>Current Chrome page connected</strong>
                        <span>{browserContext.title}</span>
                        <small>{compactUrl(browserContext.url)}</small>
                      </div>
                    </div>
                  ) : null}

                  <div className="field-row">
                    <label className="field-block">
                      <span>Company or prospect</span>
                      <input
                        onChange={(event) => setCompany(event.target.value)}
                        placeholder="Enter a company or prospect"
                        required
                        value={company}
                      />
                    </label>
                    <label className="field-block">
                      <span>Company website <em>optional</em></span>
                      <input
                        onChange={(event) => setWebsite(event.target.value)}
                        placeholder="e.g. company.com"
                        value={website}
                      />
                    </label>
                  </div>

                  <label className="field-block">
                    <span>What is the meeting about?</span>
                    <textarea
                      onChange={(event) => setMeeting(event.target.value)}
                      placeholder="Describe the upcoming meeting and what the prospect wants to discuss"
                      required
                      rows={3}
                      value={meeting}
                    />
                  </label>

                  <label className="field-block">
                    <span>What should Switchpath find?</span>
                    <textarea
                      onChange={(event) => setResearchGoal(event.target.value)}
                      placeholder="Describe the account intelligence and opportunities Switchpath should find"
                      required
                      rows={2}
                      value={researchGoal}
                    />
                  </label>

                  <div className="field-row">
                    <label className="field-block">
                      <span>Sales stage</span>
                      <select defaultValue="prospecting">
                        <option value="prospecting">Initial prospecting</option>
                      </select>
                    </label>
                    <label className="field-block">
                      <span>Playbook</span>
                      <select
                        disabled={playbookLoading || playbooks.length === 0}
                        onChange={(event) => setSelectedPlaybookVersionId(event.target.value)}
                        required
                        value={selectedPlaybookVersionId}
                      >
                        {playbooks.map((item) => (
                          <option key={item.version.id} value={item.version.id}>
                            {item.name} v{item.version.number}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="form-footer">
                    <div className="playbook-note">
                      <span className="mini-route" aria-hidden="true" />
                      <span>
                        {selectedRunPlaybook
                          ? `${selectedRunPlaybook.steps.length} approved workflow step${selectedRunPlaybook.steps.length === 1 ? "" : "s"} · ${selectedRunPlaybook.name}`
                          : "Loading approved workflows…"}
                      </span>
                    </div>
                    <button
                      className="primary-button"
                      disabled={runBusy || runIsActive || !selectedRunPlaybook}
                      type="submit"
                    >
                      {runBusy ? "Starting…" : runIsActive ? "Research in progress" : "Start research"}
                      <span aria-hidden="true">↗</span>
                    </button>
                  </div>

                  {runError ? <p className="form-error" role="alert">{runError}</p> : null}
                  {notice ? (
                    <p className="form-notice" role="status">
                      {notice}
                    </p>
                  ) : null}
                </form>
              ) : (
                <div className="teach-panel">
                  <span className="field-number">B</span>
                  {teachingSession.status === "idle" ? (
                    <>
                      <div className="teach-state teach-state-idle" role="status">
                        <span className="teach-state-dot" />
                        Not recording
                      </div>
                      <h2>Show Switchpath how you research</h2>
                      <div className="teach-method-picker" role="group" aria-label="Teaching method">
                        <button
                          aria-pressed={teachCaptureMode === "observed_browser_session"}
                          className={teachCaptureMode === "observed_browser_session" ? "active" : ""}
                          onClick={() => setTeachCaptureMode("observed_browser_session")}
                          type="button"
                        >
                          Demonstrate in Chrome
                        </button>
                        <button
                          aria-pressed={teachCaptureMode === "written_instructions"}
                          className={teachCaptureMode === "written_instructions" ? "active" : ""}
                          onClick={() => setTeachCaptureMode("written_instructions")}
                          type="button"
                        >
                          Write the workflow
                        </button>
                      </div>
                      {teachCaptureMode === "observed_browser_session" ? (
                        <>
                          <p>
                            Switchpath will record the order of public pages you visit in Chrome.
                            It records page titles and URLs—not your screen, clicks, passwords, or form entries.
                          </p>
                          <ol className="teach-instructions">
                            <li><span>1</span><div><strong>Start the session</strong><small>Keep this dashboard and the Chrome extension running.</small></div></li>
                            <li><span>2</span><div><strong>Research normally in Chrome</strong><small>Open or switch between the public sources you would usually use.</small></div></li>
                            <li><span>3</span><div><strong>Return and finish</strong><small>Review the captured route before it becomes a reusable workflow.</small></div></li>
                          </ol>
                          <div className="privacy-row">
                            <span>Public pages only</span>
                            <span>URLs and titles only</span>
                            <span>Explicit finish or cancel</span>
                          </div>
                        </>
                      ) : (
                        <label className="field-block written-workflow-field">
                          <span>Workflow instructions</span>
                          <textarea
                            onChange={(event) => setWrittenWorkflow(event.target.value)}
                            placeholder={"Write one step per line, for example:\n1. Open the company website\n2. Find investor priorities\n3. Review sustainability commitments"}
                            rows={9}
                            value={writtenWorkflow}
                          />
                          <small>Use one numbered or bulleted step per line. You will review and edit every step before saving.</small>
                        </label>
                      )}
                      <button
                        className="primary-button"
                        disabled={teachBusy || (teachCaptureMode === "written_instructions" && !writtenWorkflow.trim())}
                        onClick={() => void changeTeachingSession("start")}
                        type="button"
                      >
                        {teachBusy ? "Preparing…" : teachCaptureMode === "written_instructions" ? "Review written workflow" : "Start teaching session"}
                        <span aria-hidden="true">●</span>
                      </button>
                    </>
                  ) : teachingSession.status === "recording" ? (
                    <>
                      <div className="teach-state teach-state-live" role="status">
                        <span className="teach-state-dot" />
                        Recording navigation · {teachingSession.steps.length} {teachingSession.steps.length === 1 ? "page" : "pages"} captured
                      </div>
                      <h2>Research normally in Chrome</h2>
                      <p>
                        Every public page that finishes loading in the active Chrome tab is added below.
                        Return here when the route is complete.
                      </p>
                      {teachingSession.steps.length > 0 ? (
                        <ol className="teach-captured-list" aria-label="Captured research pages">
                          {teachingSession.steps.slice(-5).map((step) => (
                            <li key={step.id}>
                              <span>{String(step.sequence).padStart(2, "0")}</span>
                              <div><strong>{step.title}</strong><small>{compactUrl(step.url)}</small></div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <div className="teach-waiting">
                          <span className="teach-live-dot" />
                          <div><strong>Waiting for your first public page</strong><small>Open or refresh a company page in Chrome.</small></div>
                        </div>
                      )}
                      <div className="teach-actions">
                        <button className="primary-button" disabled={teachBusy} onClick={() => void changeTeachingSession("finish")} type="button">
                          {teachBusy ? "Finishing…" : "Finish and review"}
                          <span aria-hidden="true">✓</span>
                        </button>
                        <button className="secondary-button" disabled={teachBusy} onClick={() => void changeTeachingSession("cancel")} type="button">Cancel session</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="teach-state teach-state-review" role="status">
                        <span className="teach-state-dot" />
                        Capture complete · ready to review
                      </div>
                        <h2>Review the {teachingSession.captureMode === "written_instructions" ? "written workflow" : "demonstrated route"}</h2>
                      {teachSavedPlaybook ? (
                        <div className="teach-save-success" role="status">
                          <span>✓</span>
                          <div>
                            <strong>{teachSavedPlaybook.name} is saved</strong>
                            <p>{teachSavedPlaybook.steps.length} reviewed steps are now stored as an approved reusable playbook.</p>
                            <div className="teach-actions">
                              <button className="primary-button" onClick={() => { setView("playbooks"); window.scrollTo({ top: 0, behavior: "smooth" }); }} type="button">Open Playbooks <span aria-hidden="true">→</span></button>
                              <button className="secondary-button" onClick={() => void changeTeachingSession("cancel")} type="button">Teach another route</button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p>
                            Rename, reorder, remove, or rewrite the captured steps before saving them as a reusable playbook.
                          </p>
                          <div className="teach-workflow-meta">
                            <label className="field-block">
                              <span>Workflow name</span>
                              <input onChange={(event) => setWorkflowName(event.target.value)} placeholder="e.g. Enterprise account research" value={workflowName} />
                            </label>
                            <label className="field-block">
                              <span>Description <em>optional</em></span>
                              <textarea onChange={(event) => setWorkflowDescription(event.target.value)} placeholder="When should an AE use this workflow?" rows={2} value={workflowDescription} />
                            </label>
                          </div>
                          <ol className="teach-edit-list" aria-label="Editable research route">
                            {editableTeachingSteps.map((step, index) => (
                              <li key={step.id}>
                                <div className="teach-edit-header">
                                  <span>{String(index + 1).padStart(2, "0")}</span>
                                  <small>
                                    {step.capturedUrl
                                      ? <>Captured from <a href={step.capturedUrl} target="_blank" rel="noreferrer">{compactUrl(step.capturedUrl)} ↗</a></>
                                      : "Entered as a written instruction"}
                                  </small>
                                  <div className="teach-step-actions">
                                    <button aria-label={`Move ${step.title} up`} disabled={index === 0} onClick={() => moveTeachingStep(step.id, -1)} type="button">↑</button>
                                    <button aria-label={`Move ${step.title} down`} disabled={index === editableTeachingSteps.length - 1} onClick={() => moveTeachingStep(step.id, 1)} type="button">↓</button>
                                    <button aria-label={`Remove ${step.title}`} onClick={() => removeTeachingStep(step.id)} type="button">Remove</button>
                                  </div>
                                </div>
                                <label><span>Step title</span><input onChange={(event) => updateTeachingStep(step.id, "title", event.target.value)} value={step.title} /></label>
                                <label><span>Purpose</span><input onChange={(event) => updateTeachingStep(step.id, "objective", event.target.value)} value={step.objective} /></label>
                                <label><span>Reusable instruction</span><textarea onChange={(event) => updateTeachingStep(step.id, "instructions", event.target.value)} rows={3} value={step.instructions} /></label>
                              </li>
                            ))}
                          </ol>
                          <div className="teach-review-note">
                            {teachingSession.captureMode === "written_instructions"
                              ? "Written steps become reusable instructions only after you review and save them."
                              : "Captured URLs remain review evidence only. The reusable instructions tell the agent to rediscover the equivalent page for each new account."}
                          </div>
                          <div className="teach-actions">
                            <button className="primary-button" disabled={teachBusy} onClick={() => void saveTeachingPlaybook()} type="button">{teachBusy ? "Saving…" : "Save reusable playbook"}<span aria-hidden="true">→</span></button>
                            <button className="secondary-button" disabled={teachBusy} onClick={() => void changeTeachingSession("cancel")} type="button">Discard route</button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {teachError ? <p className="form-error" role="alert">{teachError}</p> : null}
                </div>
              )}
            </div>

            <aside className="route-card" aria-label={mode === "teach" ? "Teaching session route" : run ? "Live research route" : "Research route preview"}>
              <div className="route-card-header">
                <div>
                  <span className="section-index">{mode === "teach" ? "Teaching session" : run ? "Live research route" : "Route preview"}</span>
                  <h2>{mode === "teach" ? "Observed source path" : run?.companyName || company || "New account"}</h2>
                  {mode === "run" && activeRunPlaybook ? (
                    <p className="route-context-line">
                      {activeRunPlaybook.name} v{activeRunPlaybook.version.number}
                      {run ? ` · Revision ${run.planRevision}` : " · selected workflow"}
                    </p>
                  ) : null}
                </div>
                <span className={`ready-pill status-${mode === "teach" ? teachingSession.status : (run?.status ?? "ready").replaceAll("_", "-")}`}>
                  {mode === "teach" ? humanize(teachingSession.status) : humanize(run?.status ?? "ready")}
                </span>
              </div>

              {mode === "teach" ? (
                teachingRoutePreview.length > 0 ? (
                  <ol className="route-list route-list-live teaching-route-list">
                    {teachingRoutePreview.map((step) => (
                      <li className="route-action route-action-completed" key={step.id}>
                        <span className="route-node">{String(step.sequence).padStart(2, "0")}</span>
                        <div>
                          <strong>{step.title}</strong>
                          <span>{step.url ? compactUrl(step.url) : "Written instruction"}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="route-loading" role="status">
                    <span className={teachingSession.status === "recording" ? "route-pulse" : "route-idle-dot"} />
                    <strong>{teachingSession.status === "recording" ? "Watching for public pages…" : "No teaching session active"}</strong>
                    <p>{teachingSession.status === "recording" ? "Navigate in Chrome and completed pages will appear here in order." : "Read the instructions and start when you are ready."}</p>
                  </div>
                )
              ) : run ? (
                <>
                  {learnedRules.length > 0 ? (
                    <div className="learned-route-note">
                      <span>↗</span>
                      <div>
                        <strong>Applying learned behaviour</strong>
                        <p>
                          {learnedRules.map((rule) =>
                            `${rule.title}${rule.originCompanyName ? ` · learned from ${rule.originCompanyName}` : ""}`,
                          ).join("; ")}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {runIsTerminal && !plan ? (
                    <div className="route-loading route-terminal" role="status">
                      <strong>{run.status === "cancelled" ? "Research stopped" : humanize(run.status)}</strong>
                      <p>
                        {run.status === "cancelled"
                          ? "No further research steps will be started."
                          : "This research run is no longer active."}
                      </p>
                    </div>
                  ) : plan ? (
                    <ol className="route-list route-list-live">
                      {plan.actions.map((action) => (
                        <li className={`route-action route-action-${action.status}`} key={action.id}>
                          <span className="route-node">
                            {action.status === "completed"
                              ? "✓"
                              : action.status === "running"
                                ? "●"
                                : String(action.sequence).padStart(2, "0")}
                          </span>
                          <div>
                            <strong>{action.title}</strong>
                            <span>{action.objective}</span>
                            {(action.appliedSourceRuleIds?.length ?? 0) > 0 ? (
                              <small>Learned route applied</small>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="route-loading" role="status">
                      <span className="route-pulse" />
                      <strong>
                        {run.status === "draft"
                          ? `${run.companyName} research is queued`
                          : run.status === "replanning"
                            ? `Revising the ${run.companyName} route for revision ${run.planRevision}`
                            : `Building the ${run.companyName} research route`}
                      </strong>
                      <p>
                        {run.status === "draft"
                          ? "The local worker will begin planning shortly. You can leave this page open or return later."
                          : run.status === "replanning"
                            ? "The approved source is being added and affected conclusions will be checked again."
                            : `Using ${activeRunPlaybook?.name ?? "the selected playbook"} and its saved source preferences.`}
                      </p>
                    </div>
                  )}
                  {run.failureMessage ? <p className="run-failure">{run.failureMessage}</p> : null}
                  <div className="run-controls">
                    {["planning", "running", "replanning"].includes(run.status) ? (
                      <button disabled={runBusy} onClick={() => void sendRunCommand("pause")} type="button">Pause</button>
                    ) : null}
                    {run.status === "paused" ? (
                      <button disabled={runBusy} onClick={() => void sendRunCommand("resume")} type="button">Resume</button>
                    ) : null}
                    {run.status === "failed" ? (
                      <button disabled={runBusy} onClick={() => void sendRunCommand("retry")} type="button">Retry</button>
                    ) : null}
                    {!runIsTerminal ? (
                      <button className="run-control-muted" disabled={runBusy} onClick={() => setCancelDialogOpen(true)} type="button">Cancel</button>
                    ) : null}
                  </div>
                </>
              ) : (
                <ol className="route-list">
                  <li>
                    <span className="route-node">01</span>
                    <div>
                      <strong>Understand the business</strong>
                      <span>Official company sources</span>
                    </div>
                  </li>
                  <li>
                    <span className="route-node">02</span>
                    <div>
                      <strong>Find strategic priorities</strong>
                      <span>Reports, news and leadership context</span>
                    </div>
                  </li>
                  <li>
                    <span className="route-node">03</span>
                    <div>
                      <strong>Map the sales opportunity</strong>
                      <span>{meeting || "Meeting goal"}</span>
                    </div>
                  </li>
                  <li className="route-intervention">
                    <span className="route-node">↳</span>
                    <div>
                      <strong>You can redirect here</strong>
                      <span>Pause · compare · approve · resume</span>
                    </div>
                  </li>
                </ol>
              )}

              <div className="route-footer">
                <span>{mode === "teach" ? `${teachingRoutePreview.length} workflow steps` : run ? `Revision ${run.planRevision}` : "One active run"}</span>
                <span>{mode === "teach" ? (teachingSession.captureMode === "written_instructions" ? "Written and reviewable" : "URLs and titles only") : run ? `${runEvents.length} events` : "Live public sources"}</span>
              </div>
            </aside>
          </section>

          {revisionImpact ? (
            <section className="revision-impact-card" aria-labelledby="revision-impact-title">
              <div className="revision-impact-header">
                <div>
                  <span className="section-index">Redirect impact · Revision {revisionImpact.fromRevision} → {revisionImpact.toRevision}</span>
                  <h2 id="revision-impact-title">What changed for {revisionImpact.companyName}</h2>
                </div>
                <span className={`impact-status impact-status-${revisionImpact.status}`}>
                  {revisionImpact.status === "processing" ? "Rechecking evidence" : "Impact verified"}
                </span>
              </div>

              <div className="impact-source-summary">
                <span className="impact-source-icon" aria-hidden="true">↗</span>
                <div>
                  <span>Source introduced by the account executive</span>
                  <a href={revisionImpact.intervention.proposedUrl} target="_blank" rel="noreferrer">
                    {revisionImpact.intervention.proposedPageTitle || compactUrl(revisionImpact.intervention.proposedUrl)} ↗
                  </a>
                  <p>{revisionImpact.intervention.instruction}</p>
                </div>
              </div>

              {revisionImpact.status === "processing" ? (
                <div className="impact-progress" role="status">
                  <span className="route-pulse" aria-hidden="true" />
                  <div>
                    <strong>The revised route is still running.</strong>
                    <span>This comparison updates as revision {revisionImpact.toRevision} saves new evidence and conclusions.</span>
                  </div>
                </div>
              ) : null}

              <div className="impact-columns">
                <section className="impact-column impact-column-changed">
                  <div className="impact-column-heading">
                    <span>Changed</span>
                    <strong>{revisionImpact.changed.length}</strong>
                  </div>
                  {revisionImpact.changed.length > 0 ? (
                    <div className="impact-list">
                      {revisionImpact.changed.map((change, index) => (
                        <article key={`${change.kind}-${change.previous?.id ?? change.current?.id ?? index}`}>
                          <span>{change.kind === "revised" ? "Revised conclusion" : change.kind === "removed" ? "No longer supported" : "New conclusion"}</span>
                          {change.previous ? <p className="impact-previous">Before: {change.previous.statement}</p> : null}
                          {change.current ? <p className="impact-current">Now: {change.current.statement}</p> : null}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="impact-empty">No conclusion changed. The introduced source confirmed the existing findings.</p>
                  )}
                </section>

                <section className="impact-column impact-column-retained">
                  <div className="impact-column-heading">
                    <span>Stayed the same</span>
                    <strong>{revisionImpact.retained.length}</strong>
                  </div>
                  {revisionImpact.retained.length > 0 ? (
                    <div className="impact-list">
                      {revisionImpact.retained.map((claim) => (
                        <article key={claim.id}>
                          <span>Still supported</span>
                          <p className="impact-current">{claim.statement}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="impact-empty">No previous conclusion has been confirmed unchanged yet.</p>
                  )}
                </section>

                <section className="impact-column impact-column-evidence">
                  <div className="impact-column-heading">
                    <span>Evidence behind the change</span>
                    <strong>{revisionImpact.evidence.length}</strong>
                  </div>
                  {revisionImpact.evidence.length > 0 ? (
                    <div className="impact-list">
                      {revisionImpact.evidence.map((item) => (
                        <article key={item.id}>
                          <span>{item.introducedSource ? "Introduced source" : "Supporting revised conclusion"}</span>
                          <blockquote>{item.excerpt}</blockquote>
                          <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                            {item.sourceTitle || compactUrl(item.sourceUrl)} ↗
                          </a>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="impact-empty">The revised route has not saved a supporting excerpt yet.</p>
                  )}
                </section>
              </div>
            </section>
          ) : null}

          {run?.status === "completed" ? (
            <section className="meeting-brief-card" id="meeting-brief" aria-labelledby="meeting-brief-title">
              <div className="meeting-brief-header">
                <div>
                  <span className="section-index">02 / Meeting brief · Revision {run.planRevision}</span>
                  <h2 id="meeting-brief-title">Prepare for {run.companyName}.</h2>
                </div>
                <div className="brief-download-control">
                  <button
                    className="brief-download-button"
                    disabled={!brief || pdfBusy}
                    onClick={() => void downloadBriefPdf()}
                    type="button"
                  >
                    {pdfBusy ? "Preparing formal PDF…" : "Download formal PDF ↓"}
                  </button>
                  {pdfError ? <span role="alert">{pdfError}</span> : null}
                </div>
              </div>

              {briefBusy ? (
                <div className="brief-generating" role="status">
                  <span className="route-pulse" aria-hidden="true" />
                  <div>
                    <strong>Writing the evidence-bound brief…</strong>
                    <span>Organizing supported claims without adding new facts.</span>
                  </div>
                </div>
              ) : null}

              {briefError ? (
                <div className="brief-error" role="alert">
                  <div>
                    <strong>The brief could not be generated.</strong>
                    <span>{briefError}</span>
                  </div>
                  <button onClick={() => void generateBrief()} type="button">Try again</button>
                </div>
              ) : null}

              {!brief && !briefBusy && !briefError ? (
                <div className="brief-manual-gate">
                  <div>
                    <span className="result-kicker">On-demand generation</span>
                    <strong>The research record is ready. Generate a brief only when you need to review it.</strong>
                    <p>This action uses the OpenAI API. Reloading or testing the completed run will not spend brief-generation tokens.</p>
                  </div>
                  <button onClick={() => void generateBrief()} type="button">
                    Generate meeting brief →
                  </button>
                </div>
              ) : null}

              {brief ? (
                <div className="brief-content">
                  <div className="brief-short-summary">
                    <span className="result-kicker">Short summary</span>
                    <p>{stripMarkdown(brief.shortSummary)}</p>
                    <span>Generated {formatGeneratedAt(brief.generatedAt)}</span>
                  </div>
                  <div className="brief-sections-grid">
                    <BriefSection items={brief.accountBrief} title="Account brief" />
                    <BriefSection items={brief.salesOpportunities} title="Sales opportunities" />
                    <BriefSection items={brief.discoveryQuestions} title="Questions to ask" />
                    <BriefSection items={brief.recommendedStrategy} title="Recommended strategy" />
                    <BriefSection items={brief.agentSuggestions} title="Agent suggestions" />
                    <section className="brief-section brief-unknowns">
                      <div className="brief-section-heading">
                        <h3>Unknowns</h3>
                        <span>{brief.unknowns.length}</span>
                      </div>
                      {brief.unknowns.length > 0 ? (
                        <ul>{brief.unknowns.map((item, index) => <li key={`${item}-${index}`}>{stripMarkdown(item)}</li>)}</ul>
                      ) : (
                        <p>No unresolved uncertainty was recorded.</p>
                      )}
                    </section>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="evidence-strip" id="evidence">
            <div className="results-heading">
              <div>
                <span className="section-index">Research record</span>
                <h2>{run ? `${run.companyName}: evidence and claims` : "Nothing hides behind the answer."}</h2>
              </div>
              {results && (
                <div className="result-stats" aria-label="Research result totals">
                  <span><strong>{results.sources.length}</strong> sources</span>
                  <span><strong>{results.evidence.length}</strong> excerpts</span>
                  <span><strong>{results.claims.length}</strong> claims</span>
                </div>
              )}
            </div>

            <div className="evidence-types" aria-label="Evidence language legend">
              {evidenceTypes.map((item) => (
                <div className={`evidence-type evidence-${item.tone}`} key={item.label}>
                  <span className="evidence-icon" aria-hidden="true" />
                  <strong>{item.label}</strong>
                  <span>
                    {item.tone === "verified"
                      ? "Direct source and excerpt"
                      : item.tone === "interpretation"
                        ? "Reasoning linked to evidence"
                        : "Clearly marked as unverified"}
                  </span>
                </div>
              ))}
            </div>

            {!run && (
              <div className="result-empty">
                Start a research run to see its live source record, exact excerpts and supported claims here.
              </div>
            )}

            {run && (!results || (results.sources.length === 0 && results.claims.length === 0)) && (
              <div className="result-empty">
                <strong>{runIsActive ? "Research is still gathering evidence." : "No evidence was produced for this revision."}</strong>
                <span>
                  {runIsActive
                    ? "Sources and claims will appear here as the local worker completes each step."
                    : "Switchpath will not invent a result when the research record is empty."}
                </span>
              </div>
            )}

            {results && (results.sources.length > 0 || results.claims.length > 0) && (
              <div className="results-content">
                {results.latestSummary && (
                  <div className="result-summary">
                    <span className="result-kicker">Latest agent summary · revision {results.revision}</span>
                    <p>{stripMarkdown(results.latestSummary)}</p>
                  </div>
                )}

                <div className="results-grid">
                  <div className="results-panel">
                    <div className="results-panel-heading">
                      <span className="result-kicker">Claims</span>
                      <strong>{results.claims.length || "None yet"}</strong>
                    </div>
                    {results.claims.length === 0 ? (
                      <p className="panel-empty">The worker found material but did not create a claim. Nothing is inferred on its behalf.</p>
                    ) : (
                      <div className="claim-list">
                        {results.claims.map((claim) => (
                          <article className={`claim-card claim-${claimTone(claim.kind)}`} key={claim.id}>
                            <div className="claim-meta">
                              <span>{claimLabel(claim.kind)}</span>
                              <span>{formatConfidence(claim.confidence)}</span>
                            </div>
                            <h3>{stripMarkdown(claim.statement)}</h3>
                            {claim.rationale && <p>{stripMarkdown(claim.rationale)}</p>}
                            {claim.evidence.length > 0 ? (
                              <div className="claim-sources">
                                {claim.evidence.map((item) => (
                                  <a href={item.sourceUrl} key={`${claim.id}-${item.id}`} target="_blank" rel="noreferrer">
                                    {item.sourceTitle || compactUrl(item.sourceUrl)} ↗
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <span className="unsupported-note">No supporting evidence attached</span>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="results-panel">
                    <div className="results-panel-heading">
                      <span className="result-kicker">Evidence excerpts</span>
                      <strong>{results.evidence.length || "None yet"}</strong>
                    </div>
                    {results.evidence.length === 0 ? (
                      <p className="panel-empty">No exact excerpt has been saved for this revision yet.</p>
                    ) : (
                      <div className="excerpt-list">
                        {results.evidence.map((item) => (
                          <article className="excerpt-card" key={item.id}>
                            <blockquote>{item.excerpt}</blockquote>
                            <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                              {item.sourceTitle || compactUrl(item.sourceUrl)} ↗
                            </a>
                            {item.locator && <span>{item.locator}</span>}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="source-inventory">
                  <div className="results-panel-heading">
                    <span className="result-kicker">Source inventory</span>
                    <strong>{results.sources.length}</strong>
                  </div>
                  {results.sources.map((source) => (
                    <article className="source-row" key={source.id}>
                      <div>
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.title || source.domain} ↗
                        </a>
                        <span>{source.domain} · {humanize(source.kind)} · {humanize(source.retrievalStatus)}</span>
                      </div>
                      <p>{source.summary || "No source summary was saved."}</p>
                      {source.promptInjectionSignals.length > 0 && (
                        <span className="source-warning">Page instructions detected and ignored</span>
                      )}
                    </article>
                  ))}
                </div>

                {results.uncertainties.length > 0 && (
                  <div className="uncertainty-panel">
                    <span className="result-kicker">Open questions and unknowns</span>
                    <ul>
                      {results.uncertainties.map((uncertainty, index) => (
                        <li key={`${uncertainty}-${index}`}>{uncertainty}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          {resetDialogOpen ? (
            <div className="cancel-dialog-backdrop" role="presentation" onMouseDown={() => !resetBusy && setResetDialogOpen(false)}>
              <section
                aria-labelledby="reset-dialog-title"
                aria-modal="true"
                className="cancel-dialog reset-dialog"
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
              >
                <span className="section-index">Demo controls</span>
                <h2 id="reset-dialog-title">Reset the workspace for recording?</h2>
                <p>
                  This clears practice runs, briefs, evidence and interventions from every demo view, and disables their learned corrections.
                  Saved playbooks are kept. The underlying audit trail remains protected in Supabase.
                </p>
                {runIsActive ? (
                  <p className="reset-warning" role="alert">Stop the active {run?.companyName} run before resetting.</p>
                ) : null}
                {resetError ? <p className="reset-warning" role="alert">{resetError}</p> : null}
                <div className="reset-dialog-actions">
                  <button disabled={resetBusy} onClick={() => setResetDialogOpen(false)} type="button">Keep current data</button>
                  <button
                    className="reset-confirm-button"
                    disabled={resetBusy || runIsActive}
                    onClick={() => void resetDemoWorkspace()}
                    type="button"
                  >
                    {resetBusy ? "Resetting workspace…" : "Reset demo workspace"}
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          {cancelDialogOpen && run && !runIsTerminal ? (
            <div className="cancel-dialog-backdrop" role="presentation" onMouseDown={() => setCancelDialogOpen(false)}>
              <section
                aria-labelledby="cancel-dialog-title"
                aria-modal="true"
                className="cancel-dialog"
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
              >
                <span className="section-index">Stop research</span>
                <h2 id="cancel-dialog-title">When should Switchpath stop?</h2>
                <p>You decide whether the current step may finish or whether its result should be discarded.</p>
                <div className="cancel-options">
                  <button
                    disabled={runBusy}
                    onClick={() => void sendRunCommand("cancel", { mode: "immediate" })}
                    type="button"
                  >
                    <strong>Stop now</strong>
                    <span>Cancel immediately and discard any late result from the interrupted step.</span>
                  </button>
                  <button
                    disabled={runBusy}
                    onClick={() => void sendRunCommand("cancel", { mode: "safe_checkpoint" })}
                    type="button"
                  >
                    <strong>Stop at a safe point</strong>
                    <span>Let the current step finish, save it, then stop before the next step.</span>
                  </button>
                </div>
                <button className="cancel-dialog-continue" disabled={runBusy} onClick={() => setCancelDialogOpen(false)} type="button">
                  Continue research
                </button>
              </section>
            </div>
          ) : null}
          {extensionModalOpen ? (
            <div className="extension-modal-backdrop" role="presentation" onClick={() => setExtensionModalOpen(false)}>
              <div className="extension-modal-card" onClick={(event) => event.stopPropagation()}>
                <div className="extension-modal-header">
                  <div>
                    <span className="eyebrow">Browser Integration</span>
                    <h2>Connect Switchpath Chrome Extension</h2>
                    <p>Redirect research, capture live web pages, and teach playbooks directly from your browser.</p>
                  </div>
                  <button
                    className="brief-close"
                    onClick={() => setExtensionModalOpen(false)}
                    type="button"
                    aria-label="Close modal"
                  >
                    ×
                  </button>
                </div>

                <div className="extension-modal-steps">
                  <div className="extension-modal-step">
                    <span className="extension-step-num">01</span>
                    <div>
                      <strong>Download Extension Package</strong>
                      <p>Download the official Switchpath Chrome Extension bundle (.zip).</p>
                      <div style={{ marginTop: 10 }}>
                        <a
                          className="primary-button"
                          href="/switchpath-chrome-extension-v0.4.1.zip"
                          target="_blank"
                          rel="noreferrer"
                          style={{ textDecoration: "none", display: "inline-flex", fontSize: 11 }}
                        >
                          Download Extension (.zip)
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="extension-modal-step">
                    <span className="extension-step-num">02</span>
                    <div>
                      <strong>Extract Zip & Load Unpacked in Chrome</strong>
                      <p>
                        Extract the downloaded <code>.zip</code> file to a folder. In Chrome, open <code>chrome://extensions</code>, turn on <strong>Developer mode</strong> (top right), click <strong>Load unpacked</strong>, and select the extracted extension folder.
                      </p>
                    </div>
                  </div>

                  <div className="extension-modal-step">
                    <span className="extension-step-num">03</span>
                    <div>
                      <strong>Pair Workspace API Connection</strong>
                      <p>The extension pairs directly with your live backend API URL:</p>
                      <div className="extension-code-block">
                        <code>{API_BASE}</code>
                        <button
                          className="extension-copy-btn"
                          onClick={() => {
                            void navigator.clipboard.writeText(API_BASE);
                            setNotice("API Base URL copied to clipboard!");
                          }}
                          type="button"
                        >
                          Copy API URL
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="extension-modal-actions">
                  <button
                    className="secondary-button"
                    onClick={() => setExtensionModalOpen(false)}
                    type="button"
                  >
                    Close
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => {
                      connectChromeExtension();
                    }}
                    type="button"
                  >
                    {extensionConnection === "connecting" ? "Pairing..." : "Pair Extension Now"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          </>
          )}
        </div>
      </main>
    </div>
  );
}

function EvidencePage({
  error,
  index,
  loading,
  onOpenRun,
}: {
  error: string;
  index: WorkspaceEvidenceIndex | null;
  loading: boolean;
  onOpenRun: (runId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [account, setAccount] = useState("all");
  const [claimKind, setClaimKind] = useState("all");
  const [recordType, setRecordType] = useState<"claims" | "excerpts" | "sources">("claims");

  if (loading && !index) {
    return <div className="runs-empty">Loading the workspace evidence record…</div>;
  }

  if (!index) {
    return (
      <section className="evidence-page" aria-labelledby="evidence-page-title">
        <span className="section-index">Evidence library</span>
        <h1 id="evidence-page-title">The evidence record could not be loaded.</h1>
        {error ? <p className="runs-error" role="alert">{error}</p> : null}
      </section>
    );
  }

  const normalizedSearch = search.trim().toLowerCase();
  const accountMatches = (companyName: string) => account === "all" || companyName === account;
  const textMatches = (...values: Array<string | undefined>) =>
    !normalizedSearch || values.some((value) => value?.toLowerCase().includes(normalizedSearch));
  const claims = index.claims.filter((claim) =>
    accountMatches(claim.companyName)
      && (claimKind === "all" || claim.kind === claimKind)
      && textMatches(
        claim.companyName,
        claim.statement,
        claim.rationale,
        ...claim.evidence.flatMap((item) => [item.sourceTitle, item.excerpt]),
      ),
  );
  const excerpts = index.evidence.filter((item) =>
    accountMatches(item.companyName)
      && textMatches(item.companyName, item.sourceTitle, item.sourceUrl, item.excerpt, item.locator),
  );
  const sources = index.sources.filter((source) =>
    accountMatches(source.companyName)
      && textMatches(source.companyName, source.title, source.domain, source.url, source.summary),
  );
  const accounts = [...new Set(index.runs.map((run) => run.companyName))].sort();
  const supportedClaims = index.claims.filter((claim) => claim.evidence.length > 0).length;

  return (
    <section className="evidence-page" aria-labelledby="evidence-page-title">
      <header className="evidence-page-heading">
        <div>
          <span className="section-index">Evidence library</span>
          <h1 id="evidence-page-title">Trace every conclusion back to its source.</h1>
          <p>Search the current evidence revision across every account. Viewing this record never starts research or calls the model.</p>
        </div>
        <dl className="evidence-page-summary">
          <div><dt>Sources</dt><dd>{index.sources.length}</dd></div>
          <div><dt>Excerpts</dt><dd>{index.evidence.length}</dd></div>
          <div><dt>Supported claims</dt><dd>{supportedClaims}</dd></div>
        </dl>
      </header>

      {error ? <p className="runs-error" role="alert">{error}</p> : null}

      <div className="evidence-filter-bar">
        <label className="evidence-search-field">
          <span>Search the record</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Company, claim, excerpt or source"
            type="search"
            value={search}
          />
        </label>
        <label>
          <span>Account</span>
          <select onChange={(event) => setAccount(event.target.value)} value={account}>
            <option value="all">All accounts</option>
            {accounts.map((companyName) => <option key={companyName} value={companyName}>{companyName}</option>)}
          </select>
        </label>
        <label>
          <span>Claim type</span>
          <select disabled={recordType !== "claims"} onChange={(event) => setClaimKind(event.target.value)} value={claimKind}>
            <option value="all">All claim types</option>
            <option value="sourced_fact">Sourced facts</option>
            <option value="agent_interpretation">Agent interpretations</option>
            <option value="unsupported_hypothesis">Unsupported hypotheses</option>
          </select>
        </label>
      </div>

      <div className="evidence-record-tabs" role="tablist" aria-label="Evidence record type">
        <button aria-selected={recordType === "claims"} onClick={() => setRecordType("claims")} role="tab" type="button">
          Claims <span>{claims.length}</span>
        </button>
        <button aria-selected={recordType === "excerpts"} onClick={() => setRecordType("excerpts")} role="tab" type="button">
          Exact excerpts <span>{excerpts.length}</span>
        </button>
        <button aria-selected={recordType === "sources"} onClick={() => setRecordType("sources")} role="tab" type="button">
          Sources <span>{sources.length}</span>
        </button>
      </div>

      <div className="evidence-language-key" aria-label="Claim language">
        {evidenceTypes.map((item) => (
          <span className={`evidence-key-${item.tone}`} key={item.label}>{item.label}</span>
        ))}
      </div>

      {recordType === "claims" ? (
        <div className="evidence-claim-record" role="tabpanel">
          {claims.length === 0 ? <EvidenceFilteredEmpty /> : claims.map((claim) => (
            <article className={`evidence-record-claim claim-${claimTone(claim.kind)}`} key={claim.id}>
              <header>
                <div>
                  <span className="evidence-account-label">{claim.companyName} · Revision {claim.revision}</span>
                  <span className="brief-item-kind">{claimLabel(claim.kind)}</span>
                </div>
                <button onClick={() => onOpenRun(claim.runId)} type="button">Open run →</button>
              </header>
              <h2>{claim.statement}</h2>
              {claim.rationale ? <p>{claim.rationale}</p> : null}
              <div className="evidence-claim-meta">
                <span>Confidence {formatConfidence(claim.confidence)}</span>
                <span>{claim.evidence.length} supporting excerpt{claim.evidence.length === 1 ? "" : "s"}</span>
                <time dateTime={claim.createdAt}>{formatRunDate(claim.createdAt)}</time>
              </div>
              {claim.evidence.length > 0 ? (
                <div className="claim-evidence-records">
                  {claim.evidence.map((item) => (
                    <blockquote key={`${claim.id}-${item.id}`}>
                      <p>“{item.excerpt}”</p>
                      <footer>
                        <a href={item.sourceUrl} rel="noreferrer" target="_blank">{item.sourceTitle || compactUrl(item.sourceUrl)} ↗</a>
                        <span>{humanize(item.relationship)}{item.locator ? ` · ${item.locator}` : ""}</span>
                      </footer>
                    </blockquote>
                  ))}
                </div>
              ) : (
                <div className="evidence-unsupported-warning">No supporting evidence is attached. Treat this as unverified.</div>
              )}
            </article>
          ))}
        </div>
      ) : null}

      {recordType === "excerpts" ? (
        <div className="evidence-excerpt-record" role="tabpanel">
          {excerpts.length === 0 ? <EvidenceFilteredEmpty /> : excerpts.map((item) => (
            <article key={item.id}>
              <header>
                <span>{item.companyName} · Revision {item.revision}</span>
                <button onClick={() => onOpenRun(item.runId)} type="button">Open run →</button>
              </header>
              <blockquote>“{item.excerpt}”</blockquote>
              <footer>
                <a href={item.sourceUrl} rel="noreferrer" target="_blank">{item.sourceTitle || compactUrl(item.sourceUrl)} ↗</a>
                <span>{item.locator || "Exact excerpt"}</span>
              </footer>
            </article>
          ))}
        </div>
      ) : null}

      {recordType === "sources" ? (
        <div className="evidence-source-table" role="table" aria-label="Workspace sources">
          <div className="evidence-source-header" role="row">
            <span role="columnheader">Source</span>
            <span role="columnheader">Account</span>
            <span role="columnheader">Type</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Action</span>
          </div>
          {sources.length === 0 ? <EvidenceFilteredEmpty /> : sources.map((source) => (
            <article className="evidence-source-record" key={source.id} role="row">
              <div role="cell">
                <a href={source.url} rel="noreferrer" target="_blank">{source.title || source.domain} ↗</a>
                <span>{source.domain}</span>
              </div>
              <span role="cell">{source.companyName}<small>Revision {source.revision}</small></span>
              <span role="cell">{humanize(source.kind)}</span>
              <span role="cell">{humanize(source.retrievalStatus)}</span>
              <button onClick={() => onOpenRun(source.runId)} role="cell" type="button">Open run →</button>
            </article>
          ))}
        </div>
      ) : null}

      <p className="evidence-index-note">Current revision only · Last indexed {formatRunDate(index.generatedAt)}</p>
    </section>
  );
}

function EvidenceFilteredEmpty() {
  return (
    <div className="evidence-filtered-empty">
      <strong>No matching evidence.</strong>
      <span>Change the search term or filters. Switchpath will not manufacture a result.</span>
    </div>
  );
}

function PreferencesPage({
  busyRuleId,
  error,
  notice,
  onOpenOrigin,
  onSetRuleActive,
  playbooks,
}: {
  busyRuleId: string | null;
  error: string;
  notice: string;
  onOpenOrigin: (runId: string) => void;
  onSetRuleActive: (ruleId: string, active: boolean) => void;
  playbooks: PlaybookDetails[];
}) {
  const rules = playbooks.flatMap((playbook) => playbook.sourceRules.map((rule) => ({ playbook, rule })));
  return (
    <section className="preferences-page" aria-labelledby="preferences-title">
      <header className="control-page-heading">
        <div><span className="section-index">Memory control</span><h1 id="preferences-title">Decide what Switchpath remembers.</h1></div>
        <p>These are generalized source preferences—not saved account URLs. Turn a rule off without deleting its audit history.</p>
      </header>
      {error ? <p className="runs-error" role="alert">{error}</p> : null}
      {notice ? <p className="playbook-notice" role="status">{notice}</p> : null}
      <div className="preferences-summary">
        <dl><div><dt>Total preferences</dt><dd>{rules.length}</dd></div><div><dt>Active</dt><dd>{rules.filter(({ rule }) => rule.active).length}</dd></div><div><dt>Playbooks</dt><dd>{playbooks.length}</dd></div></dl>
        <p>Switchpath only learns after explicit approval at the end of a run.</p>
      </div>
      {rules.length === 0 ? (
        <div className="runs-empty"><strong>No saved preferences yet.</strong><span>Approve an intervention for future meetings and its generalized rule will appear here.</span></div>
      ) : (
        <div className="preference-list" role="table" aria-label="Saved source preferences">
          <div className="preference-row preference-head" role="row"><span>Preference</span><span>Scope</span><span>Origin</span><span>Status</span></div>
          {rules.map(({ playbook, rule }) => (
            <article className="preference-row" key={rule.id} role="row">
              <div role="cell"><strong>{rule.title}</strong><p>{rule.ruleDefinition.rationale}</p><code>{rule.ruleDefinition.queryTemplate}</code></div>
              <div role="cell"><strong>{playbook.name} v{playbook.version.number}</strong><span>{humanize(rule.ruleDefinition.domainStrategy)}</span><small>{humanize(rule.ruleDefinition.sourceCategory)}</small></div>
              <div role="cell"><strong>{rule.origin?.companyName || "Approved intervention"}</strong><span>{formatRunDate(rule.createdAt)}</span>{rule.origin?.runId ? <button onClick={() => onOpenOrigin(rule.origin!.runId)} type="button">Open run →</button> : null}</div>
              <div className="preference-state" role="cell"><button aria-checked={rule.active} className={rule.active ? "rule-switch rule-switch-on" : "rule-switch"} disabled={busyRuleId === rule.id} onClick={() => onSetRuleActive(rule.id, !rule.active)} role="switch" type="button"><span /></button><small>{rule.active ? "Used in planning" : "Inactive"}</small></div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function HistoryPage({
  error,
  history,
  loading,
  onOpenRun,
  onUndoIntervention,
}: {
  error: string;
  history: WorkspaceHistory | null;
  loading: boolean;
  onOpenRun: (runId: string) => void;
  onUndoIntervention: (runId: string) => Promise<void>;
}) {
  const [section, setSection] = useState<"research" | "interventions" | "playbooks" | "events">("research");
  const [undoBusyId, setUndoBusyId] = useState<string | null>(null);
  const [undoMessage, setUndoMessage] = useState("");

  async function undo(item: WorkspaceHistory["interventions"][number]) {
    setUndoBusyId(item.id);
    setUndoMessage("");
    try {
      await onUndoIntervention(item.runId);
    } catch (undoError) {
      setUndoMessage(undoError instanceof Error ? undoError.message : String(undoError));
    } finally {
      setUndoBusyId(null);
    }
  }
  if (loading && !history) return <div className="runs-empty">Loading the audit history…</div>;
  return (
    <section className="history-page" aria-labelledby="history-title">
      <header className="control-page-heading"><div><span className="section-index">Audit trail</span><h1 id="history-title">Every route change stays explainable.</h1></div><p>Playbook versions, research revisions, interventions and low-level events are retained as separate records.</p></header>
      {error ? <p className="runs-error" role="alert">{error}</p> : null}
      {undoMessage ? <p className="runs-error" role="alert">{undoMessage}</p> : null}
      <nav className="history-tabs" aria-label="History categories">
        {(["research", "interventions", "playbooks", "events"] as const).map((item) => <button className={section === item ? "active" : ""} key={item} onClick={() => setSection(item)} type="button">{humanize(item)}</button>)}
      </nav>
      {!history ? <div className="runs-empty">No history is available.</div> : section === "research" ? (
        <div className="history-table">
          <div className="history-row history-head"><span>Account</span><span>Revision</span><span>Reason</span><span>Created</span></div>
          {history.planRevisions.map((item) => <article className="history-row" key={`${item.runId}-${item.revision}`}><div><strong>{item.companyName}</strong><button onClick={() => onOpenRun(item.runId)} type="button">Open run →</button></div><span>Revision {item.revision}{item.current ? " · current" : ""}</span><p>{item.reason}</p><time dateTime={item.createdAt}>{formatRunDate(item.createdAt)}</time></article>)}
        </div>
      ) : section === "interventions" ? (
        <div className="history-table">
          <div className="history-row history-head"><span>Account and intent</span><span>Revision impact</span><span>Instruction and evidence</span><span>Decision</span></div>
          {history.interventions.map((item) => <article className="history-row" key={item.id}><div><strong>{item.companyName}</strong><span>{humanize(item.interventionType)}</span><button onClick={() => onOpenRun(item.runId)} type="button">Open run →</button></div><span>R{item.baseRevision} → {item.resultingRevision ? `R${item.resultingRevision}` : "No change"}{item.undoRevision ? ` → undo R${item.undoRevision}` : ""}</span><div><p>{item.instruction}</p>{item.selectedText ? <blockquote>{item.selectedText}</blockquote> : null}<a href={item.proposedUrl} rel="noreferrer" target="_blank">{item.proposedPageTitle || compactUrl(item.proposedUrl)} ↗</a></div><div><strong>{item.undoneAt ? "Undone" : humanize(item.status)}</strong><span>{humanize(item.memoryDecision || "undecided")}</span><time dateTime={item.createdAt}>{item.createdAt ? formatRunDate(item.createdAt) : "Time unavailable"}</time>{item.status === "applied" && !item.undoneAt ? <button disabled={undoBusyId === item.id} onClick={() => void undo(item)} type="button">{undoBusyId === item.id ? "Restoring…" : "Undo intervention"}</button> : null}</div></article>)}
        </div>
      ) : section === "playbooks" ? (
        <div className="history-table">
          <div className="history-row history-head"><span>Playbook</span><span>Version</span><span>Change summary</span><span>Created</span></div>
          {history.playbookVersions.map((item) => <article className="history-row" key={item.id}><strong>{item.playbookName}</strong><span>v{item.number}{item.isCurrent ? " · current" : ""}</span><p>{item.changeSummary || "No summary recorded"}</p><time dateTime={item.createdAt}>{formatRunDate(item.createdAt)}</time></article>)}
        </div>
      ) : (
        <div className="history-table history-events">
          <div className="history-row history-head"><span>Event</span><span>Account</span><span>Revision</span><span>Recorded</span></div>
          {history.events.map((item) => <article className="history-row" key={item.id}><div><strong>{humanize(item.type)}</strong><code>{JSON.stringify(item.payload)}</code></div><button onClick={() => onOpenRun(item.runId)} type="button">{item.companyName} →</button><span>R{item.revision}</span><time dateTime={item.createdAt}>{formatRunDate(item.createdAt)}</time></article>)}
        </div>
      )}
      {history ? <p className="evidence-index-note">Audit index generated {formatRunDate(history.generatedAt)}</p> : null}
    </section>
  );
}

function PlaybooksPage({
  apiToken,
  busyRuleId,
  error,
  loading,
  notice,
  onCreateFirstPlaybook,
  onOpenOrigin,
  onPlaybookChanged,
  onSelectPlaybook,
  onSetRuleActive,
  playbook,
  playbooks,
}: {
  apiToken?: string;
  busyRuleId: string | null;
  error: string;
  loading: boolean;
  notice: string;
  onCreateFirstPlaybook: () => void;
  onOpenOrigin: (runId: string) => void;
  onPlaybookChanged: (playbook: PlaybookDetails, makeCurrent: boolean) => void;
  onSelectPlaybook: (playbookId: string) => void;
  onSetRuleActive: (ruleId: string, active: boolean) => void;
  playbook: PlaybookDetails | null;
  playbooks: PlaybookDetails[];
}) {
  const fetch = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => authenticatedFetch(input, init, apiToken),
    [apiToken],
  );
  const [versions, setVersions] = useState<PlaybookVersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionBusy, setVersionBusy] = useState(false);
  const [versionError, setVersionError] = useState("");
  const [versionNotice, setVersionNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftSteps, setDraftSteps] = useState<Array<{
    title: string;
    objective: string;
    instructions: string;
    actionHint: string;
    approvalRequired: boolean;
  }>>([]);
  const playbookId = playbook?.id;
  const shownVersionId = playbook?.version.id;

  useEffect(() => {
    if (!playbookId) return;
    let cancelled = false;
    async function loadVersions() {
      setVersionsLoading(true);
      try {
        const response = await fetch(`${API_BASE}/playbooks/${playbookId}/versions`, { cache: "no-store" });
        const payload = (await response.json()) as { versions?: PlaybookVersionSummary[]; error?: string };
        if (!response.ok || !payload.versions) throw new Error(payload.error || "Unable to load revision history");
        if (!cancelled) {
          setVersions(payload.versions);
          setVersionError("");
        }
      } catch (loadError) {
        if (!cancelled) setVersionError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (!cancelled) setVersionsLoading(false);
      }
    }
    void loadVersions();
    return () => {
      cancelled = true;
    };
  }, [fetch, playbookId, shownVersionId]);

  function beginEditing() {
    if (!playbook) return;
    setDraftName(playbook.name);
    setDraftDescription(playbook.description ?? "");
    setDraftSummary("");
    setDraftSteps(playbook.steps.map((step) => ({
      title: step.title,
      objective: step.objective,
      instructions: step.instructions ?? "",
      actionHint: step.actionHint ?? "search_web",
      approvalRequired: step.approvalRequired,
    })));
    setEditing(true);
    setVersionNotice("");
  }

  async function openVersion(versionId: string) {
    if (!playbook || versionId === playbook.version.id) return;
    setVersionBusy(true);
    setVersionError("");
    try {
      const response = await fetch(`${API_BASE}/playbooks/${playbook.id}/versions/${versionId}`, { cache: "no-store" });
      const payload = (await response.json()) as { playbook?: PlaybookDetails; error?: string };
      if (!response.ok || !payload.playbook) throw new Error(payload.error || "Unable to open that revision");
      setEditing(false);
      onPlaybookChanged(payload.playbook, false);
    } catch (openError) {
      setVersionError(openError instanceof Error ? openError.message : String(openError));
    } finally {
      setVersionBusy(false);
    }
  }

  async function activateVersion() {
    if (!playbook || playbook.version.isCurrent) return;
    setVersionBusy(true);
    setVersionError("");
    try {
      const response = await fetch(
        `${API_BASE}/playbooks/${playbook.id}/versions/${playbook.version.id}/activate`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { playbook?: PlaybookDetails; error?: string };
      if (!response.ok || !payload.playbook) throw new Error(payload.error || "Unable to restore that revision");
      onPlaybookChanged(payload.playbook, true);
      setVersionNotice(`Version ${payload.playbook.version.number} is now the current route.`);
    } catch (activateError) {
      setVersionError(activateError instanceof Error ? activateError.message : String(activateError));
    } finally {
      setVersionBusy(false);
    }
  }

  function updateDraftStep(index: number, field: "title" | "objective" | "instructions" | "actionHint" | "approvalRequired", value: string | boolean) {
    setDraftSteps((current) => current.map((step, stepIndex) =>
      stepIndex === index ? { ...step, [field]: value } : step,
    ));
  }

  function moveDraftStep(index: number, direction: -1 | 1) {
    setDraftSteps((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function saveRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!playbook) return;
    setVersionBusy(true);
    setVersionError("");
    setVersionNotice("");
    try {
      const response = await fetch(`${API_BASE}/playbooks/${playbook.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseVersionId: playbook.version.id,
          name: draftName,
          description: draftDescription,
          changeSummary: draftSummary,
          steps: draftSteps,
        }),
      });
      const payload = (await response.json()) as { playbook?: PlaybookDetails; error?: string };
      if (!response.ok || !payload.playbook) throw new Error(payload.error || "Unable to save the new revision");
      onPlaybookChanged(payload.playbook, true);
      setEditing(false);
      setVersionNotice(`Version ${payload.playbook.version.number} saved and made current. Earlier versions remain available.`);
    } catch (saveError) {
      setVersionError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setVersionBusy(false);
    }
  }

  if (loading && !playbook) {
    return <div className="runs-empty">Loading the approved workflow and learned routes…</div>;
  }

  if (!playbook) {
    return (
      <section className="playbooks-page" aria-labelledby="playbooks-page-title">
        <span className="section-index">Playbook control</span>
        <h1 id="playbooks-page-title">Teach your first research route.</h1>
        <p>No playbooks exist in this workspace yet. Demonstrate a Chrome workflow or write the steps, review them, and approve the first version.</p>
        {error ? <p className="runs-error" role="alert">{error}</p> : null}
        {!error ? <button className="primary-button playbook-empty-action" onClick={onCreateFirstPlaybook} type="button">Teach a workflow →</button> : null}
      </section>
    );
  }

  const activeRules = playbook.sourceRules.filter((rule) => rule.active).length;

  return (
    <section className="playbooks-page" aria-labelledby="playbooks-page-title">
      <header className="playbooks-page-heading">
        <div>
          <span className="section-index">Playbook control</span>
          <h1 id="playbooks-page-title">The route starts fixed. Learning stays visible.</h1>
          <p>Switchpath follows the approved workflow first, then applies only the learned source behaviour you keep active.</p>
        </div>
        <div className="playbook-picker">
          <label htmlFor="saved-playbook">Saved playbook</label>
          <select id="saved-playbook" onChange={(event) => { setEditing(false); onSelectPlaybook(event.target.value); }} value={playbook.id}>
            {playbooks.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version.number}</option>)}
          </select>
          <label htmlFor="playbook-version">Revision</label>
          <select
            disabled={versionsLoading || versionBusy}
            id="playbook-version"
            onChange={(event) => void openVersion(event.target.value)}
            value={playbook.version.id}
          >
            {versions.length === 0 ? (
              <option value={playbook.version.id}>Version {playbook.version.number}</option>
            ) : versions.map((version) => (
              <option key={version.id} value={version.id}>
                Version {version.number}{version.isCurrent ? " · current" : ""}
              </option>
            ))}
          </select>
          <small>{humanize(playbook.version.status)} · {humanize(playbook.version.sourceKind)}</small>
        </div>
      </header>

      {error ? <p className="runs-error" role="alert">{error}</p> : null}
      {notice ? <p className="playbook-notice" role="status">{notice}</p> : null}
      {versionError ? <p className="runs-error" role="alert">{versionError}</p> : null}
      {versionNotice ? <p className="playbook-notice" role="status">{versionNotice}</p> : null}

      <section className="playbook-overview" aria-labelledby="playbook-name">
        <div>
          <span className="playbook-state">{humanize(playbook.status)}</span>
          <h2 id="playbook-name">{playbook.name} v{playbook.version.number}</h2>
          <p>{playbook.description || "Approved early-prospecting research workflow."}</p>
          <small className="playbook-revision-summary">
            {playbook.version.isCurrent ? "Current revision" : "Historical revision"} · {playbook.version.changeSummary || "No change summary recorded"} · {formatRunDate(playbook.version.createdAt)}
          </small>
        </div>
        <dl>
          <div><dt>Workflow steps</dt><dd>{playbook.steps.length}</dd></div>
          <div><dt>Learned routes</dt><dd>{playbook.sourceRules.length}</dd></div>
          <div><dt>Active now</dt><dd>{activeRules}</dd></div>
        </dl>
        <div className="playbook-version-actions">
          {!playbook.version.isCurrent ? (
            <button disabled={versionBusy} onClick={() => void activateVersion()} type="button">
              {versionBusy ? "Restoring…" : `Restore version ${playbook.version.number}`}
            </button>
          ) : null}
          <button disabled={versionBusy} onClick={() => editing ? setEditing(false) : beginEditing()} type="button">
            {editing ? "Close editor" : "Edit as new version"}
          </button>
        </div>
      </section>

      {editing ? (
        <form className="playbook-editor" onSubmit={(event) => void saveRevision(event)}>
          <div className="playbook-section-heading">
            <div>
              <span className="section-index">New immutable revision</span>
              <h2>Edit the workflow without overwriting version {playbook.version.number}</h2>
            </div>
            <span>Will become v{Math.max(playbook.version.number, ...versions.map((item) => item.number)) + 1}</span>
          </div>

          <div className="playbook-editor-metadata">
            <label>
              Playbook name
              <input onChange={(event) => setDraftName(event.target.value)} required value={draftName} />
            </label>
            <label>
              Description
              <textarea onChange={(event) => setDraftDescription(event.target.value)} rows={2} value={draftDescription} />
            </label>
            <label>
              What changed in this version?
              <textarea onChange={(event) => setDraftSummary(event.target.value)} required rows={2} value={draftSummary} />
            </label>
          </div>

          <ol className="playbook-editor-steps">
            {draftSteps.map((step, index) => (
              <li key={`draft-step-${index}`}>
                <div className="playbook-editor-step-heading">
                  <strong>Step {index + 1}</strong>
                  <div>
                    <button disabled={index === 0} onClick={() => moveDraftStep(index, -1)} type="button">Move up</button>
                    <button disabled={index === draftSteps.length - 1} onClick={() => moveDraftStep(index, 1)} type="button">Move down</button>
                    <button
                      disabled={draftSteps.length === 1}
                      onClick={() => setDraftSteps((current) => current.filter((_, stepIndex) => stepIndex !== index))}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <label>Title<input onChange={(event) => updateDraftStep(index, "title", event.target.value)} required value={step.title} /></label>
                <label>Objective<textarea onChange={(event) => updateDraftStep(index, "objective", event.target.value)} required rows={2} value={step.objective} /></label>
                <label>Instructions<textarea onChange={(event) => updateDraftStep(index, "instructions", event.target.value)} rows={2} value={step.instructions} /></label>
                <div className="playbook-editor-step-options">
                  <label>Action hint<input onChange={(event) => updateDraftStep(index, "actionHint", event.target.value)} value={step.actionHint} /></label>
                  <label className="playbook-editor-checkbox">
                    <input
                      checked={step.approvalRequired}
                      onChange={(event) => updateDraftStep(index, "approvalRequired", event.target.checked)}
                      type="checkbox"
                    />
                    Require approval before this step
                  </label>
                </div>
              </li>
            ))}
          </ol>

          <div className="playbook-editor-footer">
            <button
              onClick={() => setDraftSteps((current) => [...current, {
                title: "",
                objective: "",
                instructions: "",
                actionHint: "search_web",
                approvalRequired: false,
              }])}
              type="button"
            >
              Add step
            </button>
            <button disabled={versionBusy} type="submit">{versionBusy ? "Saving revision…" : "Save and make current"}</button>
          </div>
        </form>
      ) : null}

      <div className="playbook-sections">
        <section className="playbook-workflow" aria-labelledby="approved-workflow-title">
          <div className="playbook-section-heading">
            <div>
              <span className="section-index">Original workflow</span>
              <h2 id="approved-workflow-title">Approved research sequence</h2>
            </div>
            <span className="immutable-label">Baseline</span>
          </div>
          <ol className="playbook-step-list">
            {playbook.steps.map((step) => (
              <li key={step.id}>
                <span className="playbook-step-number">{String(step.position).padStart(2, "0")}</span>
                <div>
                  <div className="playbook-step-title">
                    <h3>{step.title}</h3>
                    {step.actionHint ? <span>{humanize(step.actionHint)}</span> : null}
                  </div>
                  <p>{step.objective}</p>
                  {step.instructions ? <small>{step.instructions}</small> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="learned-routes" aria-labelledby="learned-routes-title">
          <div className="playbook-section-heading">
            <div>
              <span className="section-index">Learned behaviour</span>
              <h2 id="learned-routes-title">Source preferences</h2>
            </div>
            <span>{activeRules} active</span>
          </div>

          {playbook.sourceRules.length === 0 ? (
            <div className="playbook-rule-empty">
              <strong>No learned route yet.</strong>
              <span>Approve a redirected source for future meetings and the generalized rule will appear here.</span>
            </div>
          ) : (
            <div className="playbook-rule-list">
              {playbook.sourceRules.map((rule) => (
                <article className={rule.active ? "playbook-rule" : "playbook-rule playbook-rule-inactive"} key={rule.id}>
                  <div className="playbook-rule-header">
                    <div>
                      <span className={rule.active ? "rule-state rule-state-active" : "rule-state"}>
                        {rule.active ? "Applied to future runs" : "Not applied"}
                      </span>
                      <h3>{rule.title}</h3>
                    </div>
                    <button
                      aria-checked={rule.active}
                      aria-label={`${rule.active ? "Deactivate" : "Activate"} ${rule.title}`}
                      className={rule.active ? "rule-switch rule-switch-on" : "rule-switch"}
                      disabled={busyRuleId === rule.id || !playbook.version.isCurrent}
                      onClick={() => onSetRuleActive(rule.id, !rule.active)}
                      role="switch"
                      title={playbook.version.isCurrent ? undefined : "Restore this revision before changing its preferences"}
                      type="button"
                    >
                      <span />
                    </button>
                  </div>

                  <p className="rule-rationale">{rule.ruleDefinition.rationale}</p>

                  <dl className="rule-definition-grid">
                    <div><dt>Resolve</dt><dd>{humanize(rule.ruleDefinition.domainStrategy)}</dd></div>
                    <div><dt>Look for</dt><dd>{humanize(rule.ruleDefinition.sourceCategory)}</dd></div>
                    <div><dt>Priority</dt><dd>{rule.priority}</dd></div>
                  </dl>

                  <div className="rule-query">
                    <span>Discovery instruction</span>
                    <p>{rule.ruleDefinition.discoveryInstruction}</p>
                    <code>{rule.ruleDefinition.queryTemplate}</code>
                  </div>

                  {rule.ruleDefinition.pathKeywords.length > 0 ? (
                    <div className="rule-keywords" aria-label="Path keywords">
                      {rule.ruleDefinition.pathKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
                    </div>
                  ) : null}

                  <div className="rule-safeguards">
                    <div>
                      <strong>Apply when</strong>
                      <ul>{rule.ruleDefinition.useWhen.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                    <div>
                      <strong>Verify before using</strong>
                      <ul>{rule.ruleDefinition.applicabilityChecks.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  </div>

                  <footer className="rule-origin">
                    <div>
                      <span>Learned {formatRunDate(rule.createdAt)}</span>
                      <strong>{rule.origin?.companyName ? `From the ${rule.origin.companyName} intervention` : "From an approved intervention"}</strong>
                      <small>The original URL is audit context only; future runs rediscover the relevant source.</small>
                    </div>
                    {rule.origin?.runId ? (
                      <button onClick={() => onOpenOrigin(rule.origin!.runId)} type="button">Open origin run →</button>
                    ) : null}
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <p className="playbook-audit-note">
        Deactivated rules remain in the audit record. They are excluded from future planning until you activate them again.
      </p>
    </section>
  );
}

function ResearchRunsPage({
  error,
  loading,
  onDownloadPdf,
  onOpen,
  onRetry,
  runs,
}: {
  error: string;
  loading: boolean;
  onDownloadPdf: (run: ResearchRunSummary) => void;
  onOpen: (runId: string) => void;
  onRetry: (runId: string) => void;
  runs: ResearchRunSummary[];
}) {
  const completed = runs.filter((run) => run.status === "completed").length;
  const active = runs.filter((run) => !["completed", "failed", "cancelled"].includes(run.status)).length;

  return (
    <section className="runs-page" aria-labelledby="runs-page-title">
      <header className="runs-page-heading">
        <div>
          <span className="section-index">Research history</span>
          <h1 id="runs-page-title">Every route, decision and result.</h1>
          <p>Review previous account research without starting a new model run. Brief generation remains manual during testing.</p>
        </div>
        <dl className="runs-summary">
          <div><dt>Total</dt><dd>{runs.length}</dd></div>
          <div><dt>Completed</dt><dd>{completed}</dd></div>
          <div><dt>Active</dt><dd>{active}</dd></div>
        </dl>
      </header>

      {error ? <p className="runs-error" role="alert">{error}</p> : null}
      {loading && runs.length === 0 ? <div className="runs-empty">Loading research history…</div> : null}
      {!loading && runs.length === 0 ? (
        <div className="runs-empty">
          <strong>No research runs yet.</strong>
          <span>Start the first account from Overview. It will appear here automatically.</span>
        </div>
      ) : null}

      {runs.length > 0 ? (
        <div className="runs-table" role="table" aria-label="Research runs">
          <div className="runs-table-header" role="row">
            <span role="columnheader">Account and purpose</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Research record</span>
            <span role="columnheader">Created</span>
            <span role="columnheader">Actions</span>
          </div>
          {runs.map((item) => (
            <article className="runs-table-row" key={item.id} role="row">
              <div className="run-account-cell" role="cell">
                <button onClick={() => onOpen(item.id)} type="button">{item.companyName}</button>
                <span>{item.meetingContext}</span>
                <small>{item.researchGoal}</small>
              </div>
              <div role="cell">
                <span className={`run-status run-status-${item.status}`}>{humanize(item.status)}</span>
                <small>Revision {item.planRevision}</small>
              </div>
              <div className="run-record-cell" role="cell">
                <span>{item.sourceCount} sources</span>
                <span>{item.claimCount} claims</span>
                <span>{item.interventionCount} redirects</span>
                <small>{item.briefReady ? "Brief generated" : "Brief not generated"}</small>
              </div>
              <time dateTime={item.createdAt} role="cell">{formatRunDate(item.createdAt)}</time>
              <div className="run-row-actions" role="cell">
                <button className="run-open-button" onClick={() => onOpen(item.id)} type="button">
                  Open run →
                </button>
                {item.status === "failed" ? (
                  <button className="run-text-button" onClick={() => onRetry(item.id)} type="button">Retry</button>
                ) : null}
                {item.pdfReady ? (
                  <button className="run-text-button" onClick={() => onDownloadPdf(item)} type="button">Download PDF</button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatRunDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function BriefSection({ items, title }: { items: BriefItem[]; title: string }) {
  return (
    <section className="brief-section">
      <div className="brief-section-heading">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      {items.length > 0 ? (
        <div className="brief-item-list">
          {items.map((item, index) => (
            <article className={`brief-item brief-item-${claimTone(item.kind)}`} key={`${title}-${index}`}>
              <span className="brief-item-kind">{claimLabel(item.kind)}</span>
              <p>{stripMarkdown(item.text)}</p>
              {item.citations.length > 0 ? (
                <div className="brief-citations">
                  {item.citations.map((citation) => (
                    <a
                      href={citation.sourceUrl}
                      key={`${item.text}-${citation.evidenceId}`}
                      target="_blank"
                      rel="noreferrer"
                      title={citation.excerpt}
                    >
                      {citation.sourceTitle || compactUrl(citation.sourceUrl)} ↗
                    </a>
                  ))}
                </div>
              ) : (
                <span className="unsupported-note">No supporting evidence — verify in the meeting</span>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p>No supported item was produced for this section.</p>
      )}
    </section>
  );
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "for this revision";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function safeDownloadName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "account";
}

function claimLabel(kind: ResultClaim["kind"]): string {
  if (kind === "sourced_fact") return "Sourced fact";
  if (kind === "agent_interpretation") return "Agent interpretation";
  return "Unsupported hypothesis";
}

function claimTone(kind: ResultClaim["kind"]): string {
  if (kind === "sourced_fact") return "verified";
  if (kind === "agent_interpretation") return "interpretation";
  return "hypothesis";
}

function formatConfidence(value?: number): string {
  if (value === undefined) return "Confidence not scored";
  const percent = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return `${percent}% confidence`;
}

function normalizedDomain(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("Company website must be a public HTTP or HTTPS address");
  }
  return url.hostname.replace(/^www\./i, "");
}

function learnedRulesFromEvents(events: RunEvent[]): Array<{
  id: string;
  title: string;
  originCompanyName?: string;
}> {
  const event = events.find((candidate) => candidate.type === "plan.created");
  const rules = event?.payload?.learnedSourceRules;
  if (!Array.isArray(rules)) return [];
  return rules.filter(
    (rule): rule is { id: string; title: string; originCompanyName?: string } =>
      Boolean(
        rule
        && typeof rule === "object"
        && "id" in rule
        && typeof rule.id === "string"
        && "title" in rule
        && typeof rule.title === "string",
      ),
  );
}

function runIsInProgress(run: ResearchRun | null): boolean {
  return Boolean(run && !["completed", "failed", "cancelled"].includes(run.status));
}

function editableStepsFromSession(steps: TeachingStep[]): EditableTeachingStep[] {
  const firstHostname = steps[0]?.hostname;
  return steps.map((step) => ({
    id: step.id,
    title: step.title,
    objective: step.url
      ? "Find the equivalent account information represented by this page"
      : step.userNote ?? step.title,
    instructions: step.url
      ? step.hostname === firstHostname
        ? "Open the target company's official website and locate the equivalent relevant page; do not reuse this captured URL for another company."
        : `Use ${step.hostname} to find the equivalent information for the current target account; rediscover the relevant page instead of reusing this captured URL.`
      : step.userNote ?? step.title,
    capturedUrl: step.url,
  }));
}

function compactUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`.slice(0, 90);
  } catch {
    return value.slice(0, 90);
  }
}

function stripMarkdown(text: string | undefined): string {
  if (!text) return "";
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^[ \t]*[-*+]\s+/gm, "")
    .trim();
}

function memoryDismissalKey(interventionId: string): string {
  return `switchpath:dismissed-memory:${interventionId}`;
}

function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  token: string | undefined,
): Promise<Response> {
  if (!token) return globalThis.fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return globalThis.fetch(input, { ...init, headers });
}
