# Switchpath MVP — Design System

## Direction

Switchpath should feel like a calm research console rather than a conventional sales dashboard. The interface prioritizes evidence, route visibility and user control. It avoids decorative AI imagery, chat-first patterns and high-density CRM chrome.

## Brand Idea

The Switchpath mark uses two points connected by a changing route. The visual language repeats nodes, paths, revisions and checkpoints throughout the product.

## Color System

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#F3F0E9` | Main workspace background |
| Surface | `#FFFDF8` | Cards and input surfaces |
| Ink | `#191916` | Primary text |
| Muted | `#6D6B64` | Secondary text |
| Navigation | `#22243A` | Sidebar and agent-route panels |
| Route violet | `#605E8D` | Interpretation and interactive emphasis |
| Signal lime | `#D9FF72` | Live status, route control and important actions |
| Verified green | `#16856A` | Sourced facts |
| Hypothesis amber | `#AA6C12` | Unsupported hypotheses and caution |

## Typography

- Geist Sans for interface text and headings.
- Geist Mono for statuses, indices, revision numbers, evidence metadata and keyboard shortcuts.
- Headlines use compact line height and negative tracking to give the product a precise editorial character.

## Spacing and Shape

- Base spacing unit: 4px.
- Standard control height: 40–42px.
- Input radius: 12px.
- Card radius: 18–28px depending on hierarchy.
- Borders carry structure; shadows remain subtle.

## Evidence Language

Every important output uses one of three persistent labels:

1. **Sourced fact** — green; direct source and excerpt available.
2. **Agent interpretation** — violet; reasoning linked to supporting evidence.
3. **Unsupported hypothesis** — amber; explicitly unverified.

Color is never the only differentiator. Every state includes a written label.

## Core Components

- Application sidebar
- Workspace header
- Chrome connection status
- Run/Teach segmented control
- Account-research setup form
- Research-route timeline
- Evidence-type cards
- Primary and secondary buttons
- Status pills and keyboard shortcuts
- Inline success, warning and error notices

## Interaction Principles

- Research actions remain visible and reversible where possible.
- Workflow changes require clear approval.
- Voice transcription stays editable before submission.
- Pause and redirect controls remain reachable from both dashboard and extension.
- The interface explains what changed, not merely that a change occurred.
- Reduced-motion preferences are respected.

## Responsive Behavior

- Desktop: fixed navigation and two-column account/route setup.
- Tablet: route preview moves below the setup card.
- Mobile: navigation becomes a bottom bar, layouts become single-column and primary actions become full-width.
