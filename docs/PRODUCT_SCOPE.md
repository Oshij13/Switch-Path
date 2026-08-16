# Switchpath MVP — Product Scope

## Primary User

An account executive researching a new prospect before an initial meeting or meaningful sales interaction.

## Core Problem

Existing AI research tools complete work as a black box. When an account executive finds a better source or wants to change the direction of research, redirecting the system is inconvenient, unclear, or requires restarting the work.

## Product Promise

Switchpath is a steerable sales-research agent that learns how an account executive researches, performs that workflow using live public sources, and allows the account executive to redirect the research while it is running.

## Supported Sales Stage

The MVP supports the initial prospecting stage only: learning about a new account and preparing for an early meeting.

## First-Time User Experience

Switchpath supports two workflow-teaching methods:

1. Automatic browser observation as the primary method.
2. Written workflow instructions as the secondary method.

Switchpath converts either input into a draft playbook. The account executive can review, customize, approve, and save it.

## Returning User Inputs

- Company name
- Meeting context and purpose
- Goal for the prospect
- Initial prospecting stage
- Additional research instructions
- Saved workflow selection

Before a new research run, the account executive can run the saved workflow unchanged or ask Switchpath to suggest changes for the account. Suggested changes require approval before execution.

## Research Scope

The system must perform live research for any company with publicly accessible web information. Supported sources include company websites, public reports and filings, public news, publicly accessible articles, and general web-search results.

The MVP does not require logged-in platforms, paywalled sources, private databases, or inaccessible pages. When information cannot be found, Switchpath must report that limitation instead of inventing an answer.

## Source Intervention

When an account executive introduces a source during an active run, Switchpath must:

1. Pause the current research route.
2. Preserve the existing source and conclusions in the audit history.
3. Inspect the proposed source.
4. Compare the existing and proposed evidence.
5. Explain how adopting the source would change the remaining route.
6. Ask for approval before making the change.
7. Replan and resume only after approval.

After the meeting brief is generated, Switchpath asks whether the intervention was for this meeting only or should update the saved workflow.

## Workflow Memory

A permanent update stores a generalized source rule rather than a company-specific URL. For example: visit the prospect's official website, locate sustainability or ESG information, extract current commitments and priorities, and use them when developing the sales strategy.

The original URL remains part of the account's evidence history. Switchpath shows the inferred generalized rule and requires approval before saving it.

## Dashboard Output

- Short overall summary
- Account brief
- Sales opportunities
- Recommended questions
- Suggested sales strategy
- Additional agent recommendations

## Downloadable Output

Switchpath generates a complete meeting-preparation document as a downloadable PDF.

## Evidence Transparency

Every important research item must be classified as one of the following:

- **Sourced fact:** directly supported by linked evidence.
- **Agent interpretation:** a conclusion derived from clearly identified sources.
- **Unsupported hypothesis:** an unverified idea explicitly presented as such, never as fact.

These classifications and source links must appear in both the dashboard and PDF.

## Formal MVP Success Criterion

The MVP is successful when an account executive can:

1. Demonstrate a workflow through browser observation.
2. Review, customize, and save the generated playbook.
3. Enter any company, meeting context, and prospecting goal.
4. Run live research using public sources.
5. Observe the agent's research steps.
6. Introduce a new source during execution.
7. See the existing and proposed routes compared.
8. Approve the new route.
9. Watch the agent replan and resume.
10. Receive an evidence-backed dashboard and downloadable PDF.
11. Save the intervention as either a one-time change or a generalized future workflow rule.

## Future Roadmap & Backlog

- Integration with CRM platforms (Salesforce, HubSpot) for automated research triggers.
- Support for internal authenticated data sources (private wikis, call recordings, internal notes).
- Multi-user workspace authorization, organization role permissions, and shared playbooks.
- Enterprise security compliance and OAuth SSO.

