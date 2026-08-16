from __future__ import annotations

import json
import sys
from datetime import datetime
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)


NAVY = colors.HexColor("#20213A")
INK = colors.HexColor("#1C1C1A")
MUTED = colors.HexColor("#66645F")
ACCENT = colors.HexColor("#247466")
LINE = colors.HexColor("#D9D4CA")
AMBER = colors.HexColor("#8A5B17")


def build_styles():
    base = getSampleStyleSheet()
    return {
        "cover_brand": ParagraphStyle(
            "CoverBrand",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=ACCENT,
            tracking=1.8,
            alignment=TA_CENTER,
            spaceAfter=12,
        ),
        "cover_title": ParagraphStyle(
            "CoverTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=30,
            leading=35,
            textColor=NAVY,
            alignment=TA_CENTER,
            spaceAfter=14,
        ),
        "cover_company": ParagraphStyle(
            "CoverCompany",
            parent=base["Heading1"],
            fontName="Times-Roman",
            fontSize=21,
            leading=27,
            textColor=INK,
            alignment=TA_CENTER,
            spaceAfter=24,
        ),
        "cover_meta": ParagraphStyle(
            "CoverMeta",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=15,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=5,
        ),
        "eyebrow": ParagraphStyle(
            "Eyebrow",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=ACCENT,
            tracking=1.2,
            spaceAfter=5,
        ),
        "h1": ParagraphStyle(
            "SectionHeading",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=23,
            textColor=NAVY,
            spaceBefore=8,
            spaceAfter=11,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "ItemHeading",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=ACCENT,
            spaceBefore=9,
            spaceAfter=4,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Times-Roman",
            fontSize=10.5,
            leading=16,
            textColor=INK,
            alignment=TA_LEFT,
            spaceAfter=7,
            allowWidows=0,
            allowOrphans=0,
        ),
        "summary": ParagraphStyle(
            "Summary",
            parent=base["BodyText"],
            fontName="Times-Roman",
            fontSize=12,
            leading=18,
            textColor=INK,
            spaceAfter=10,
        ),
        "evidence_basis": ParagraphStyle(
            "EvidenceBasis",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=8,
            leading=12,
            textColor=MUTED,
            leftIndent=5 * mm,
            spaceAfter=7,
        ),
        "unknown": ParagraphStyle(
            "Unknown",
            parent=base["BodyText"],
            fontName="Times-Roman",
            fontSize=10.5,
            leading=15.5,
            textColor=INK,
            leftIndent=5 * mm,
            firstLineIndent=-3 * mm,
            bulletIndent=0,
            spaceAfter=5,
        ),
        "reference_title": ParagraphStyle(
            "ReferenceTitle",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=13,
            textColor=NAVY,
            spaceAfter=3,
        ),
        "reference_url": ParagraphStyle(
            "ReferenceUrl",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=11,
            textColor=ACCENT,
            wordWrap="CJK",
            spaceAfter=4,
        ),
        "reference_excerpt": ParagraphStyle(
            "ReferenceExcerpt",
            parent=base["BodyText"],
            fontName="Times-Italic",
            fontSize=9,
            leading=13.5,
            textColor=MUTED,
            leftIndent=5 * mm,
            spaceAfter=12,
        ),
        "method": ParagraphStyle(
            "Method",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=13,
            textColor=MUTED,
            spaceAfter=5,
        ),
    }


def safe_text(value) -> str:
    text = str(value or "").strip()
    for dash in ("‐", "‑", "‒", "–", "—", "―"):
        text = text.replace(dash, "-")
    return escape(text)


def formal_date(value) -> str:
    text = str(value or "").strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed.strftime("%d %B %Y, %H:%M")
    except ValueError:
        return text


def label_for(kind: str) -> str:
    return {
        "sourced_fact": "SOURCED FACT",
        "agent_interpretation": "AGENT INTERPRETATION",
        "unsupported_hypothesis": "UNSUPPORTED HYPOTHESIS",
    }.get(kind, "UNCLASSIFIED")


def collect_citations(brief: dict):
    ordered = []
    number_by_id = {}
    sections = [
        "accountBrief",
        "salesOpportunities",
        "discoveryQuestions",
        "recommendedStrategy",
        "agentSuggestions",
    ]
    for section in sections:
        for item in brief.get(section, []):
            for citation in item.get("citations", []):
                evidence_id = str(citation.get("evidenceId", ""))
                if not evidence_id or evidence_id in number_by_id:
                    continue
                number_by_id[evidence_id] = len(ordered) + 1
                ordered.append(citation)
    return ordered, number_by_id


def citation_numbers(item: dict, number_by_id: dict) -> list[int]:
    numbers = []
    for citation in item.get("citations", []):
        number = number_by_id.get(str(citation.get("evidenceId", "")))
        if number and number not in numbers:
            numbers.append(number)
    return numbers


def footer(canvas, doc, company_name: str):
    canvas.saveState()
    width, _ = A4
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.4)
    canvas.line(doc.leftMargin, 15 * mm, width - doc.rightMargin, 15 * mm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, 10 * mm, f"Switchpath | {company_name} meeting preparation")
    canvas.drawRightString(width - doc.rightMargin, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_pdf(payload: dict, output_path: Path):
    brief = payload["brief"]
    company_name = str(brief.get("companyName") or "Account")
    styles = build_styles()
    citations, number_by_id = collect_citations(brief)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=22 * mm,
        leftMargin=22 * mm,
        topMargin=22 * mm,
        bottomMargin=23 * mm,
        title=f"{company_name} Meeting Preparation Brief",
        author="Switchpath",
        subject="Evidence-bound account research and meeting preparation",
    )
    story = []

    story.extend([
        Spacer(1, 38 * mm),
        Paragraph("SWITCHPATH", styles["cover_brand"]),
        Paragraph("Account Meeting<br/>Preparation Brief", styles["cover_title"]),
        HRFlowable(width="34%", thickness=1.2, color=ACCENT, spaceBefore=2, spaceAfter=18, hAlign="CENTER"),
        Paragraph(safe_text(company_name), styles["cover_company"]),
        Paragraph(f"<b>Meeting context:</b> {safe_text(payload.get('meetingContext'))}", styles["cover_meta"]),
        Paragraph(f"<b>Research objective:</b> {safe_text(payload.get('researchGoal'))}", styles["cover_meta"]),
        Paragraph(f"<b>Research revision:</b> {safe_text(brief.get('revision'))}", styles["cover_meta"]),
        Paragraph(f"<b>Generated:</b> {safe_text(formal_date(brief.get('generatedAt')))}", styles["cover_meta"]),
        Spacer(1, 46 * mm),
        Paragraph("Prepared for account-executive use. Public-source research only.", styles["cover_meta"]),
        Paragraph("Supported facts and interpretations are traceable to the references in this document.", styles["cover_meta"]),
        PageBreak(),
    ])

    story.extend([
        Paragraph("EXECUTIVE SUMMARY", styles["eyebrow"]),
        Paragraph("Meeting preparation at a glance", styles["h1"]),
        Paragraph(safe_text(brief.get("shortSummary")), styles["summary"]),
        Spacer(1, 3 * mm),
        Paragraph("Evidence classification", styles["h2"]),
        Paragraph(
            "<b>Sourced fact</b> means the statement is supported directly by saved evidence. "
            "<b>Agent interpretation</b> means Switchpath has drawn a practical conclusion from cited evidence. "
            "<b>Unsupported hypothesis</b> is a useful but unverified idea that should be tested in the meeting.",
            styles["method"],
        ),
        Spacer(1, 4 * mm),
    ])

    section_specs = [
        ("1", "Account brief", "accountBrief", "What the research establishes about the account and its relevant priorities."),
        ("2", "Sales opportunities", "salesOpportunities", "Potential openings for the conversation, separated from verified company facts."),
        ("3", "Questions to ask", "discoveryQuestions", "Questions designed to validate assumptions, expose constraints and advance discovery."),
        ("4", "Recommended strategy", "recommendedStrategy", "A practical approach for positioning, sequencing and handling the meeting."),
        ("5", "Agent suggestions", "agentSuggestions", "Additional actions that may improve preparation or follow-through."),
    ]

    for section_number, title, key, description in section_specs:
        story.append(KeepTogether([
            HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=8, spaceAfter=11),
            Paragraph(f"SECTION {section_number}", styles["eyebrow"]),
            Paragraph(safe_text(title), styles["h1"]),
            Paragraph(safe_text(description), styles["method"]),
        ]))
        items = brief.get(key, [])
        if not items:
            story.append(Paragraph("No supported content was produced for this topic.", styles["body"]))
            continue
        for index, item in enumerate(items, start=1):
            numbers = citation_numbers(item, number_by_id)
            references = " ".join(f"<super>[{number}]</super>" for number in numbers)
            item_story = [
                Paragraph(f"{section_number}.{index} &nbsp; {label_for(str(item.get('kind')))}", styles["h2"]),
                Paragraph(f"{safe_text(item.get('text'))} {references}", styles["body"]),
            ]
            if numbers:
                joined = ", ".join(f"[{number}]" for number in numbers)
                item_story.append(Paragraph(f"Evidence basis: {joined}", styles["evidence_basis"]))
            else:
                item_story.append(Paragraph("Evidence basis: none. Validate this hypothesis during the meeting.", styles["evidence_basis"]))
            story.append(KeepTogether(item_story))

    story.append(KeepTogether([
        HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=8, spaceAfter=11),
        Paragraph("SECTION 6", styles["eyebrow"]),
        Paragraph("Open questions and unknowns", styles["h1"]),
        Paragraph("The following gaps should not be treated as established facts.", styles["method"]),
    ]))
    unknowns = brief.get("unknowns", [])
    if unknowns:
        for item in unknowns:
            story.append(Paragraph(f"- &nbsp; {safe_text(item)}", styles["unknown"]))
    else:
        story.append(Paragraph("No unresolved uncertainty was recorded.", styles["body"]))

    story.extend([
        HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=12, spaceAfter=12),
        Paragraph("SECTION 7", styles["eyebrow"]),
        Paragraph("Sources and supporting evidence", styles["h1"]),
        Paragraph(
            "References are ordered by first appearance. Excerpts reproduce the evidence saved during the research run; links open the original public source.",
            styles["method"],
        ),
        Spacer(1, 4 * mm),
    ])
    if citations:
        for index, citation in enumerate(citations, start=1):
            source_title = safe_text(citation.get("sourceTitle") or "Public source")
            source_url = str(citation.get("sourceUrl") or "")
            safe_url = escape(source_url, quote=True)
            reference_story = [Paragraph(f"[{index}] {source_title}", styles["reference_title"])]
            if source_url:
                reference_story.append(Paragraph(f'<link href="{safe_url}">{safe_text(source_url)}</link>', styles["reference_url"]))
            reference_story.append(Paragraph(f'“{safe_text(citation.get("excerpt"))}”', styles["reference_excerpt"]))
            story.append(KeepTogether(reference_story))
    else:
        story.append(Paragraph("No supporting evidence was available for this revision.", styles["body"]))

    story.extend([
        HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=10, spaceAfter=10),
        Paragraph("Method and limitations", styles["h2"]),
        Paragraph(
            "This document was synthesized from the exact claims and evidence stored for the stated research revision. "
            "It does not replace account-executive judgment, private customer context or confirmation during the meeting. "
            "Web content may change after retrieval, and parent-company evidence may not apply to a subsidiary unless explicitly established.",
            styles["method"],
        ),
    ])

    doc.build(
        story,
        onFirstPage=lambda canvas, current_doc: footer(canvas, current_doc, company_name),
        onLaterPages=lambda canvas, current_doc: footer(canvas, current_doc, company_name),
    )


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: generate_meeting_brief_pdf.py OUTPUT_PATH")
    payload = json.load(sys.stdin)
    build_pdf(payload, Path(sys.argv[1]).resolve())


if __name__ == "__main__":
    main()
