# Switchpath — Pitch Script for Zamp

**Recommended length:** 4–5 minutes  
**Format:** Founder-style product pitch with a live product demonstration  
**Audience:** Zamp product and hiring team

---

## 0:00–0:25 — Opening

**On screen:** Start with the Switchpath dashboard. Do not begin with slides.

**Say:**

> Zamp describes its AI employees as mini-CEOs: they understand a goal, perform the work, and deliver an outcome.
>
> I became interested in what happens when the employee is already working and the human discovers something the AI does not know—a better source, a more recent report, or a different direction worth investigating.
>
> Today, correcting an AI agent often means returning to its dashboard, rewriting a prompt, or restarting the task. I built Switchpath to explore a different interaction model: an AI employee that can be redirected while it is working.

---

## 0:25–0:55 — The Problem

**On screen:** Show a research run or the new-account form.

**Say:**

> Consider an account executive preparing for a first meeting with a prospect. They have a repeatable process: understand the company, find its current priorities, inspect reports and leadership statements, and translate those findings into sales opportunities and discovery questions.
>
> An AI employee can automate that process. But research is not completely predictable. The account executive may find a more authoritative page while browsing, or realize that the agent is following an outdated source.
>
> The important problem is not whether the AI can accept another URL. The problem is whether it can understand the correction, explain its impact, change only the affected part of its plan, and remember the lesson appropriately.

---

## 0:55–1:15 — The Product

**On screen:** Show the Switchpath overview and Chrome connection state.

**Say:**

> Switchpath is a steerable research layer for AI employees.
>
> It learns how an account executive researches, executes that playbook using live public sources, and lets the user intervene from any Chrome page with a keyboard shortcut.
>
> It is not another meeting-preparation chatbot. The meeting brief is the output. The product is the control layer between the human's judgment and the agent's execution.

---

## 1:15–1:45 — Teach the Workflow

**On screen:** Open **Teach a workflow**. Briefly show browser observation and written instructions. Show the editable draft playbook.

**Say:**

> A first-time user can teach Switchpath in two ways. They can demonstrate their normal research process in Chrome, or describe the steps in writing.
>
> Switchpath converts that behavior into an explicit playbook. Before anything becomes reusable, the account executive can review the steps, edit their order and instructions, and approve the version.
>
> This matters because the agent is not inventing an invisible workflow. The human can see and control the operating procedure it will follow.

---

## 1:45–2:10 — Start Live Research

**On screen:** Enter a company, meeting context, research goal, and saved playbook. Start the run.

**Say:**

> For a returning user, the input is deliberately small: the prospect, what the meeting is about, what the account executive wants to learn, and which approved playbook to use.
>
> Switchpath creates a bounded research plan and executes it against live public sources. The user can see the current step, the sources being examined, and the plan revision instead of waiting for a black-box answer.

---

## 2:10–3:15 — The Core Demonstration

**On screen:** While the research run is active, open a relevant public webpage in Chrome. Press **Ctrl + Shift + Y**. Show the compact Switchpath capsule and submit the current page as a better source.

**Say:**

> Now imagine I find a source that the agent did not include—perhaps the prospect's newest sustainability report.
>
> I do not need to return to the dashboard or restart the research. From the page I am already viewing, I press Control, Shift, Y. Switchpath captures the current URL, page title, and—when relevant—the text I selected. I can explain the correction by typing or speaking.

**On screen:** Submit the intervention. Show pause/comparison state.

**Say:**

> The agent does not blindly obey the new instruction. It pauses at a controlled checkpoint, reads the proposed source, and compares the two research routes.
>
> It tells me what would change, what would remain valid, which conclusions must be checked again, and what risk comes with adopting the new route.

**On screen:** Show the route comparison and approve the proposed route.

**Say:**

> Only after I approve does Switchpath create a new plan revision and resume. Existing work that is still valid is preserved. Conclusions affected by the correction are revisited, and late results from the older revision cannot silently enter the new answer.
>
> This is the central Switchpath demonstration: pause, understand, compare, approve, replan, and resume.

---

## 3:15–3:45 — Evidence and Output

**On screen:** Open the completed research result, evidence view, and downloadable PDF.

**Say:**

> At completion, Switchpath produces an account brief, relevant opportunities, recommended questions, a suggested sales strategy, and a downloadable meeting-preparation PDF.
>
> Every important statement is classified as a sourced fact, an agent interpretation, or an unsupported hypothesis. Facts include the original source and exact supporting evidence. Interpretations show the evidence from which they were derived. If the system cannot support something, it says so instead of presenting it as fact.

---

## 3:45–4:10 — Learning Without Overfitting

**On screen:** Show the post-run question: **This meeting only** versus **Use for future meetings**. Then show Preferences.

**Say:**

> After the run, Switchpath asks whether the correction was useful only for this meeting or should influence future work.
>
> It does not save the exact Patagonia or Blinkit URL as a universal rule. It generalizes the behavior—for example: find the target or verified parent company's official sustainability disclosures, search the impact and packaging sections, and confirm that parent-level claims apply to the target.
>
> The user reviews that rule before it becomes future behavior, and can later inspect, disable, or revise it.

---

## 4:10–4:40 — Why This Matters to Zamp

**On screen:** Return to the clean Switchpath overview or show a simple flow: **Observe → Execute → Intervene → Learn**.

**Say:**

> Zamp already demonstrates that AI employees can own workflows and outcomes. Switchpath explores the next product question: how should a human correct an AI employee without taking the work back from it?
>
> My answer is not a larger chat window. It is an intervention layer that is available in the user's existing context, makes the consequence of a correction legible, preserves an audit trail, and turns approved judgment into reusable behavior.
>
> Sales research is the first use case, but the interaction applies wherever an AI employee performs long-running, source-dependent work: finance, compliance, recruiting, procurement, and operations.

---

## 4:40–5:00 — Honest Status and Close

**On screen:** Show the working deployed product and architecture briefly.

**Say:**

> This is a working prototype, not a claim that every production edge case is solved. It performs live public-web research, persists its state, supports Chrome-based intervention, revisions the plan, preserves evidence, and generates a sourced brief and PDF.
>
> I built it because I wanted to move beyond describing an AI employee and work through the difficult product questions: control, trust, memory, interruption, and recovery.
>
> I would love to discuss what I learned building Switchpath—and how this interaction model could strengthen the way people work with Zamp's AI employees.

---

## Recording Checklist

- Begin with the product, not a title slide.
- Use one prospect and one clear research goal throughout the demonstration.
- Have the intervention source open in another Chrome tab before recording.
- Confirm the frontend, API, worker, Supabase, and Chrome extension are connected.
- Reset the demo state and verify that the new-account form is empty.
- Use an intervention source that materially changes the remaining research route.
- Pause briefly on the route comparison so the viewer can read it.
- Show the new plan revision after approval.
- Open at least one evidence link and its supporting excerpt.
- Download and briefly display the PDF.
- Show the generalized memory rule, not only the save confirmation.
- Keep the final recording under five minutes.

## Claims to Avoid

Do not say that Switchpath:

- Integrates directly with Zamp today.
- Has production customers or measured commercial impact.
- Can reliably research every company or access private/paywalled sources.
- Replaces Zamp's existing meeting-preparation employee.
- Is production-ready for enterprise deployment.

The strongest honest positioning is:

> Switchpath is a working exploration of a Chrome-native intervention and learning layer for long-running AI employees.
