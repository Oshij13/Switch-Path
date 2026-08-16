(() => {
  if (globalThis.__switchpathContentLoaded) return;
  globalThis.__switchpathContentLoaded = true;

  const host = document.createElement("div");
  host.id = "switchpath-extension-root";
  host.dataset.open = "false";
  const shadow = host.attachShadow({ mode: "open" });
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = chrome.runtime.getURL("panel.css");
  const surface = document.createElement("div");
  shadow.append(stylesheet, surface);
  document.documentElement.append(host);

  let state = initialState();
  let operation = 0;
  let activeRecognition = null;

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.type !== "switchpath:configure-extension") return;
    chrome.runtime.sendMessage({
      type: "switchpath:configure-session",
      apiBase: event.data.apiBase,
      apiToken: event.data.apiToken,
      dashboardUrl: window.location.origin,
    }).then((response) => {
      window.postMessage({
        type: "switchpath:extension-configured",
        ok: Boolean(response?.ok),
        error: response?.error || "",
      }, window.location.origin);
    }).catch((error) => {
      window.postMessage({
        type: "switchpath:extension-configured",
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }, window.location.origin);
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "switchpath:toggle") return;
    if (host.dataset.open === "true") {
      closePanel();
      return;
    }
    void openPanel(message.page);
  });

  shadow.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("[data-action]")
      : null;
    const action = target?.getAttribute("data-action");
    if (!action) return;
    if (action === "close") closePanel();
    if (action === "retry") void loadActiveRun();
    if (action === "submit") void submitSource();
    if (action === "approve") void approveRoute();
    if (action === "reject") void keepOriginalRoute();
    if (action === "undo") void undoRoute();
    if (action === "voice") startVoiceInput();
    if (action === "choose-voice") {
      state.composerMode = "voice";
      state.inputMode = "voice";
      state.error = "";
      render();
      startVoiceInput();
    }
    if (action === "choose-type") {
      state.composerMode = "typed";
      state.inputMode = "typed";
      state.error = "";
      render();
    }
    if (action === "choose-intervention") {
      state.interventionType = target.getAttribute("data-intervention-type") || "add_source";
      state.error = "";
      render();
    }
    if (action === "change-intervention") {
      state.interventionType = null;
      state.composerMode = null;
      state.error = "";
      render();
    }
    if (action === "back") {
      if (activeRecognition) activeRecognition.stop();
      state.composerMode = null;
      state.listening = false;
      state.error = "";
      render();
    }
    if (action === "open-dashboard") {
      void chrome.runtime.sendMessage({ type: "switchpath:open-dashboard" });
    }
  });

  shadow.addEventListener("input", (event) => {
    if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) {
      state.instruction = event.target.value;
    }
  });

  shadow.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      void submitSource();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && host.dataset.open === "true") closePanel();
  });

  async function openPanel(page) {
    operation += 1;
    state = {
      ...initialState(),
      page,
      instruction: "",
    };
    host.dataset.open = "true";
    render();
    await loadActiveRun();
  }

  function closePanel() {
    operation += 1;
    if (activeRecognition) activeRecognition.stop();
    activeRecognition = null;
    host.dataset.open = "false";
    surface.replaceChildren();
  }

  async function loadActiveRun() {
    const currentOperation = ++operation;
    state.stage = "loading";
    state.error = "";
    render();
    try {
      const { run } = await api("/active-run");
      if (currentOperation !== operation) return;
      state.run = run;
      if (!run) {
        state.stage = "no-run";
      } else if (run.status === "awaiting_approval") {
        await loadComparison(currentOperation);
        return;
      } else if (run.status === "comparing") {
        state.stage = "submitting";
        state.progress = "Comparing the current route with this source…";
        render();
        const compared = await waitForRun(
          run.id,
          (candidate) => candidate.status === "awaiting_approval",
          currentOperation,
        );
        if (compared) await loadComparison(currentOperation);
        return;
      } else {
        state.stage = "ready";
      }
    } catch (error) {
      if (currentOperation !== operation) return;
      showError(error);
      return;
    }
    render();
  }

  async function submitSource() {
    const run = state.run;
    if (!run || !state.page?.url) return;
    if (!state.instruction.trim()) {
      state.error = "Tell Switchpath how this page should affect the research route.";
      render();
      return;
    }
    if (run.planRevision < 1) {
      state.error = "The first research route is still being created. Resume planning and try again once revision 1 is running.";
      render();
      return;
    }

    const currentOperation = ++operation;
    state.stage = "submitting";
    state.error = "";
    state.progress = run.status === "paused"
      ? "Submitting this page for route comparison…"
      : "Waiting for the current action to reach a safe pause…";
    render();

    try {
      let pausedRun = run;
      if (run.status !== "paused") {
        if (run.status !== "pause_requested") {
          await command(run.id, "pause");
        }
        pausedRun = await waitForRun(
          run.id,
          (candidate) => candidate.status === "paused",
          currentOperation,
        );
        if (!pausedRun) return;
      }
      if (currentOperation !== operation) return;
      state.run = pausedRun;
      state.progress = "Reading the proposed page and comparing both routes…";
      render();

      await command(run.id, "submit_source", {
        proposedUrl: state.page.url,
        proposedPageTitle: state.page.title,
        instruction: state.instruction.trim(),
        inputMode: state.inputMode,
        interventionType: state.interventionType,
        selectedText: state.page.selectedText || undefined,
      });
      const comparedRun = await waitForRun(
        run.id,
        (candidate) => candidate.status === "awaiting_approval",
        currentOperation,
      );
      if (!comparedRun) return;
      state.run = comparedRun;
      await loadComparison(currentOperation);
    } catch (error) {
      if (currentOperation === operation) showError(error);
    }
  }

  async function loadComparison(currentOperation) {
    if (!state.run) return;
    const { intervention } = await api(`/runs/${state.run.id}/intervention`);
    if (currentOperation !== operation) return;
    if (!intervention?.comparison) {
      throw new Error("The route comparison is not available yet.");
    }
    state.intervention = intervention;
    state.stage = "comparison";
    render();
  }

  async function approveRoute() {
    if (!state.run) return;
    const currentOperation = ++operation;
    const baseRevision = state.run.planRevision;
    state.stage = "applying";
    state.progress = "Applying the approved route and creating a new plan revision…";
    render();
    try {
      await command(state.run.id, "approve_route");
      const revisedRun = await waitForRun(
        state.run.id,
        (candidate) => candidate.planRevision > baseRevision
          && ["running", "completed"].includes(candidate.status),
        currentOperation,
      );
      if (!revisedRun) return;
      state.run = revisedRun;
      state.stage = "applied";
      state.outcomeTitle = `Route applied to revision ${revisedRun.planRevision}`;
      state.outcomeCopy = "The research employee resumed with the approved page in its executable route.";
      state.canUndo = true;
      render();
    } catch (error) {
      if (currentOperation === operation) showError(error);
    }
  }

  async function keepOriginalRoute() {
    if (!state.run) return;
    const currentOperation = ++operation;
    state.stage = "applying";
    state.progress = "Keeping the original route and resuming research…";
    render();
    try {
      await command(state.run.id, "reject_route");
      const pausedRun = await waitForRun(
        state.run.id,
        (candidate) => candidate.status === "paused",
        currentOperation,
      );
      if (!pausedRun) return;
      await command(state.run.id, "resume");
      const resumedRun = await waitForRun(
        state.run.id,
        (candidate) => ["running", "completed"].includes(candidate.status),
        currentOperation,
      );
      if (!resumedRun) return;
      state.run = resumedRun;
      state.stage = "applied";
      state.outcomeTitle = "Original route retained";
      state.outcomeCopy = "The proposed page was rejected and research resumed without changing the plan revision.";
      render();
    } catch (error) {
      if (currentOperation === operation) showError(error);
    }
  }

  async function undoRoute() {
    if (!state.run) return;
    const currentOperation = ++operation;
    const appliedRevision = state.run.planRevision;
    state.stage = "applying";
    state.progress = "Pausing and restoring the route from before this intervention…";
    render();
    try {
      let pausedRun = state.run;
      if (pausedRun.status !== "paused" && pausedRun.status !== "completed") {
        await command(pausedRun.id, "pause");
        pausedRun = await waitForRun(
          pausedRun.id,
          (candidate) => candidate.status === "paused",
          currentOperation,
        );
        if (!pausedRun) return;
      }
      const undoResponse = await command(pausedRun.id, "undo_intervention");
      const successor = undoResponse?.restoredRun;
      const restoredRun = successor ?? await waitForRun(
        pausedRun.id,
        (candidate) => candidate.planRevision > appliedRevision
          && ["running", "completed"].includes(candidate.status),
        currentOperation,
      );
      if (!restoredRun) return;
      state.run = restoredRun;
      state.stage = "applied";
      state.outcomeTitle = `Intervention undone in revision ${restoredRun.planRevision}`;
      state.outcomeCopy = "Switchpath restored the pre-intervention route as a new audited revision.";
      state.canUndo = false;
      render();
    } catch (error) {
      if (currentOperation === operation) showError(error);
    }
  }

  async function waitForRun(runId, predicate, currentOperation, timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (currentOperation !== operation) return null;
      const { run } = await api(`/runs/${runId}`);
      if (run.status === "failed") throw new Error(run.failureMessage || "Research failed");
      if (run.status === "cancelled") throw new Error("The research run was cancelled");
      if (predicate(run)) return run;
      await delay(900);
    }
    throw new Error("Switchpath did not reach the next checkpoint in time.");
  }

  function startVoiceInput() {
    if (activeRecognition && state.listening) {
      activeRecognition.stop();
      return;
    }
    const SpeechRecognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      state.error = "Voice input is not available in this Chrome session. You can type the instruction instead.";
      render();
      return;
    }
    const recognition = new SpeechRecognition();
    activeRecognition = recognition;
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      state.listening = true;
      state.error = "";
      render();
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((result) => result?.[0]?.transcript || "")
        .join(" ")
        .trim();
      if (transcript) {
        state.instruction = transcript;
        state.inputMode = "voice";
        render();
      }
    };
    recognition.onerror = () => {
      state.error = "Chrome could not capture that voice instruction. Please try again or type it.";
    };
    recognition.onend = () => {
      activeRecognition = null;
      state.listening = false;
      render();
    };
    recognition.start();
  }

  async function command(runId, kind, payload = {}) {
    return api(`/runs/${runId}/commands`, {
      method: "POST",
      body: { kind, payload },
    });
  }

  async function api(path, options = {}) {
    const response = await chrome.runtime.sendMessage({
      type: "switchpath:api",
      request: { path, method: options.method ?? "GET", body: options.body },
    });
    if (!response?.ok) throw new Error(response?.error || "Unable to reach the local Switchpath API");
    return response.data;
  }

  function showError(error) {
    state.stage = state.run ? "ready" : "error";
    state.error = error instanceof Error ? error.message : String(error);
    render();
  }

  function render() {
    if (host.dataset.open !== "true") return;
    const expanded = state.stage === "comparison" || (state.stage === "ready" && !state.interventionType);
    surface.innerHTML = `
      <section class="sp-shell ${expanded ? "sp-shell-expanded" : "sp-shell-capsule"}" role="dialog" aria-modal="false" aria-label="Switchpath route intervention">
        <div class="sp-body" aria-live="polite">${renderStage()}</div>
      </section>`;
    if (state.stage === "ready" && state.composerMode === "typed") {
      queueMicrotask(() => shadow.querySelector("input")?.focus());
    }
  }

  function renderStage() {
    if (state.stage === "loading") return progressView("Finding the active research employee…");
    if (state.stage === "submitting" || state.stage === "applying") {
      return progressView(state.progress);
    }
    if (state.stage === "no-run") {
      return noRunView();
    }
    if (state.stage === "error") {
      return emptyView("Switchpath is unavailable", state.error, true);
    }
    if (state.stage === "comparison") return comparisonView();
    if (state.stage === "applied") return outcomeView();
    return readyView();
  }

  function readyView() {
    const run = state.run;
    const cannotRedirect = run?.planRevision < 1;
    if (!state.interventionType) {
      return interventionTypeView();
    }
    if (!state.composerMode) {
      return `
        <div class="sp-capsule sp-mode-capsule">
          ${compactBrand()}
          <div class="sp-capsule-copy">
            <strong>${escapeHtml(interventionTypeLabel(state.interventionType))}</strong>
            <span>${escapeHtml(run?.companyName || "Active research")} · ${escapeHtml(compactUrl(state.page?.url))}${state.page?.selectedText ? " · highlighted text attached" : ""}</span>
          </div>
          <button class="sp-mode-button sp-mode-voice" data-action="choose-voice" type="button"><span>●</span> Voice</button>
          <button class="sp-mode-button" data-action="choose-type" type="button">Type</button>
          <button class="sp-icon-button" data-action="change-intervention" type="button" aria-label="Choose another intervention">←</button>
          <button class="sp-icon-button" data-action="close" type="button" aria-label="Close Switchpath">×</button>
        </div>`;
    }
    if (state.composerMode === "voice") {
      return `
        <div class="sp-capsule-stack">
          <div class="sp-capsule sp-voice-capsule ${state.listening ? "is-listening" : ""}">
            <button class="sp-icon-button" data-action="back" type="button" aria-label="Choose another input mode">×</button>
            <div class="sp-wave" aria-hidden="true">${Array.from({ length: 13 }, (_, index) => `<i style="--i:${index}"></i>`).join("")}</div>
            <div class="sp-voice-copy">
              <strong>${state.listening ? "Listening…" : state.instruction ? "Voice instruction ready" : "Tap to speak again"}</strong>
              <span>${escapeHtml(state.instruction || "Tell Switchpath how this page should change the route")}</span>
            </div>
            <button class="sp-icon-button sp-mic-button" data-action="voice" type="button" aria-label="${state.listening ? "Stop listening" : "Start voice input"}">●</button>
            <button class="sp-submit-round" data-action="submit" type="button" ${cannotRedirect || !state.instruction.trim() ? "disabled" : ""} aria-label="Compare this source">✓</button>
          </div>
          ${state.error ? `<div class="sp-capsule-error">${escapeHtml(state.error)}</div>` : ""}
        </div>`;
    }
    return `
      <div class="sp-capsule-stack">
        <div class="sp-capsule sp-type-capsule">
          <button class="sp-icon-button" data-action="back" type="button" aria-label="Choose another input mode">×</button>
          <div class="sp-page-dot">↗</div>
          <input maxlength="1000" aria-label="Route instruction" placeholder="Tell Switchpath how to use this page…" value="${escapeHtml(state.instruction)}" />
          <button class="sp-type-to-voice" data-action="choose-voice" type="button" aria-label="Use voice instead">●</button>
          <button class="sp-submit-round" data-action="submit" type="button" ${cannotRedirect || !state.instruction.trim() ? "disabled" : ""} aria-label="Compare this source">↑</button>
        </div>
        <div class="sp-capsule-caption"><span>${escapeHtml(interventionTypeLabel(state.interventionType))} · ${escapeHtml(compactUrl(state.page?.url))}${state.page?.selectedText ? " · highlight attached" : ""}</span><kbd>Enter</kbd></div>
        ${state.error ? `<div class="sp-capsule-error">${escapeHtml(state.error)}</div>` : ""}
      </div>`;
  }

  function interventionTypeView() {
    return `
      <div class="sp-intervention-picker">
        <div class="sp-intervention-picker-head">${compactBrand()}<div><strong>What should change?</strong><span>${escapeHtml(compactUrl(state.page?.url))}</span></div><button class="sp-icon-button" data-action="close" type="button" aria-label="Close Switchpath">×</button></div>
        ${state.page?.selectedText ? `<div class="sp-selection-preview"><span>Highlighted evidence</span><p>${escapeHtml(state.page.selectedText.slice(0, 220))}</p></div>` : ""}
        <div class="sp-intervention-options">
          ${interventionOption("add_source", "Add source", "Use this page as additional evidence")}
          ${interventionOption("replace_source", "Replace source", "Use this page instead of the current source")}
          ${interventionOption("change_objective", "Change objective", "Modify what the employee is trying to establish")}
          ${interventionOption("challenge_conclusion", "Challenge conclusion", "Reconsider a conclusion using this page")}
        </div>
      </div>`;
  }

  function interventionOption(type, title, copy) {
    return `<button data-action="choose-intervention" data-intervention-type="${type}" type="button"><strong>${title}</strong><span>${copy}</span><i>→</i></button>`;
  }

  function comparisonView() {
    const comparison = state.intervention?.comparison;
    return `
      <div class="sp-popover">
      <header class="sp-popover-header">
        ${compactBrand()}
        <div><span>${escapeHtml(state.run?.companyName || "Active account")}</span><button class="sp-icon-button" data-action="close" aria-label="Close Switchpath" type="button">×</button></div>
      </header>
      <div class="sp-popover-body">
      <div class="sp-context-row">
        <span class="sp-status is-paused"><i></i>Awaiting approval</span>
        <span class="sp-account">${escapeHtml(state.run?.companyName || "Active account")}</span>
        <span class="sp-revision">REV ${state.run?.planRevision ?? 0}</span>
      </div>
      <div class="sp-title-row">
        <div><span class="sp-kicker">${escapeHtml(interventionTypeLabel(state.intervention?.interventionType || state.interventionType))}</span><h2>Review what will change</h2></div>
        <span class="sp-step">02 / 03</span>
      </div>
      ${state.intervention?.selectedText ? `<div class="sp-selection-preview"><span>Highlighted evidence supplied</span><p>${escapeHtml(state.intervention.selectedText.slice(0, 280))}</p></div>` : ""}
      <div class="sp-recommendation"><span>${escapeHtml(recommendationLabel(comparison?.recommendation))}</span><p>${escapeHtml(comparison?.expectedBenefit)}</p></div>
      <div class="sp-route-grid">
        <article><span>Current route</span><p>${escapeHtml(comparison?.previousRoute)}</p></article>
        <article class="is-proposed"><span>Proposed route</span><p>${escapeHtml(comparison?.proposedRoute)}</p></article>
      </div>
      <details class="sp-details">
        <summary>Evidence impact and risks <span>${(comparison?.conclusionsToRecheck?.length || 0) + (comparison?.risks?.length || 0)}</span></summary>
        ${listBlock("Retained", comparison?.retainedConclusions)}
        ${listBlock("Recheck", comparison?.conclusionsToRecheck)}
        ${listBlock("Risks", comparison?.risks)}
      </details>
      <footer class="sp-actions sp-approval-actions">
        <button class="sp-secondary" data-action="reject" type="button">Keep original route</button>
        <button class="sp-primary" data-action="approve" type="button">Approve & resume<span>→</span></button>
      </footer>
      <p class="sp-footnote">This approval applies to this research run. Permanent route memory comes after the run.</p>
      </div></div>`;
  }

  function progressView(copy) {
    return `
      <div class="sp-capsule sp-loading-capsule">
        ${compactBrand()}
        <div class="sp-loading-lines" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="sp-capsule-copy"><strong>${escapeHtml(copy)}</strong><span>The local worker continues if you close this capsule.</span></div>
        <button class="sp-icon-button" data-action="close" type="button" aria-label="Close Switchpath">×</button>
      </div>`;
  }

  function outcomeView() {
    return `
      <div class="sp-capsule-stack">
      <div class="sp-capsule sp-outcome-capsule">
        <span class="sp-success-icon">✓</span>
        <div class="sp-capsule-copy"><strong>${escapeHtml(state.outcomeTitle)}</strong><span>${escapeHtml(state.outcomeCopy)}</span></div>
        ${state.canUndo ? '<button class="sp-undo-button" data-action="undo" type="button">Undo</button>' : ""}
        <button class="sp-done-button" data-action="close" type="button">Done</button>
      </div>
      ${state.error ? `<div class="sp-capsule-error">${escapeHtml(state.error)}</div>` : ""}
      </div>
      `;
  }

  function noRunView() {
    return `
      <div class="sp-capsule sp-no-run-capsule">
        ${compactBrand()}
        <div class="sp-capsule-copy"><strong>No active research run</strong><span>Start an account in the dashboard, then use the hotkey here.</span></div>
        <button class="sp-dashboard-button" data-action="open-dashboard" type="button">Open dashboard →</button>
        <button class="sp-icon-button" data-action="close" type="button" aria-label="Close Switchpath">×</button>
      </div>
      `;
  }

  function emptyView(title, copy, canRetry = false) {
    return `
      <div class="sp-capsule sp-error-capsule">
        <span class="sp-error-icon">!</span>
        <div class="sp-capsule-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div>
        ${canRetry ? '<button class="sp-dashboard-button" data-action="retry" type="button">Try again</button>' : ""}
        <button class="sp-icon-button" data-action="close" type="button" aria-label="Close Switchpath">×</button>
      </div>`;
  }

  function compactBrand() {
    return `<span class="sp-compact-brand" aria-label="Switchpath"><span class="sp-mark"><i></i><i></i></span></span>`;
  }

  function listBlock(label, items = []) {
    if (!items.length) return "";
    return `<div class="sp-list-block"><strong>${escapeHtml(label)}</strong><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
  }

  function statusLabel(status) {
    return ({
      running: "Research running",
      planning: "Planning route",
      pause_requested: "Pause requested",
      paused: "Research paused",
      replanning: "Replanning route",
    })[status] || "Research active";
  }

  function recommendationLabel(value) {
    return ({
      use_new_route: "Recommended · use new route",
      keep_existing_route: "Recommended · keep current route",
      use_as_context: "Recommended · use as context",
    })[value] || "Route comparison ready";
  }

  function interventionTypeLabel(value) {
    return ({
      add_source: "Add source",
      replace_source: "Replace source",
      change_objective: "Change objective",
      challenge_conclusion: "Challenge conclusion",
    })[value] || "Redirect route";
  }

  function compactUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value);
      return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`.slice(0, 86);
    } catch {
      return String(value).slice(0, 86);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function initialState() {
    return {
      stage: "loading",
      page: null,
      run: null,
      intervention: null,
      interventionType: null,
      instruction: "",
      inputMode: "typed",
      progress: "",
      error: "",
      listening: false,
      composerMode: null,
      outcomeTitle: "",
      outcomeCopy: "",
      canUndo: false,
    };
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
})();
