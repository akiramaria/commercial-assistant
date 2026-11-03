---
name: psykhe-case-study-curation
description: Match a client brief, RFP, ITQ or tender against PSYKHE's past work and approved case studies, and return a ranked shortlist ranked first by project type (for example mobile app redesign, design system, web portal build) and then by sector (for example insurance, banking, public sector). Use this whenever a PSYKHE teammate uploads or pastes a brief and asks which case studies, credentials, past work, references or similar projects to show, even if they only say "what have we done like this?" or "find relevant case studies for this lead". The psykhe-proposal-drafting skill also calls this skill at its case study step. Do not use it to write or edit a case study (use psykhe-case-study-output) or to track GeBIZ opportunities.
---

# PSYKHE case study curation

This skill finds the PSYKHE case studies that best evidence a client brief, ranks them, and explains why. It is used on its own by BD leads and consultants, and by `psykhe-proposal-drafting` when it reaches the case study step.

It selects and explains. It never writes, edits or rebuilds a case study, and never invents a result, figure, client or quote.

## When it runs

- **On its own:** someone shares a brief and asks for relevant case studies or past work. Return the curation note (below) in the chat. Make a file only if asked.
- **From `psykhe-proposal-drafting`:** return the same curation note to that skill's step 4 checkpoint, where the consultant approves the shortlist before anything is drafted around it.

## Inputs

| Input | Required? | If missing |
| --- | --- | --- |
| Brief or RFP, with annexes, addenda and Q&A | Yes | Stop and ask. |
| Access to the Knowledge Pool case study library | Yes | Stop and say so. Never shortlist from memory. |
| BD notes | No | Use them for sector, users and context if provided. |
| Proposed team (names) | No | Used as a tie-breaker only. `psykhe-proposal-drafting` passes it from the estimate. |
| Number of case studies wanted | No | Use the brief's number if it states one; otherwise 3 to 5. |

Personal data: if the brief contains NRIC or FIN numbers, phone numbers or bank details, do not quote or store them. Say where they are and ask for a redacted copy, as PSYKHE policy requires.

## Where to look

- **Candidates:** only the approved case study library in the Knowledge Pool, which is hosted on PSYKHE's Knowledge Pool web app (access route: [to confirm]). If you cannot reach it with the access you have, stop and say so. Never ask for, store or write a password, token or access link into a search, a file or the curation note.
- **Never shortlist a case study from a past proposal,** however well it matches. Past proposals may hold named versions written for another client, and their naming permission does not carry over.
- **Past proposals and project records** may still be searched to find relevant work that has no approved case study. Report those separately (see the curation note), so the team can decide whether to write one up with `psykhe-case-study-output`. They never go into a deck.
- If a case study catalogue or index exists in the library, use it for the first pass, then open each shortlisted case study to confirm its classification. Where there is no catalogue, read each case study and classify it yourself using `references/taxonomy.md`, and show your classifications in the curation note so a person can check them.

## Reading the files

The library is mostly PDF and PPTX. Use the existing skills for the mechanics rather than improvising:

- **PPTX:** read text with the `pptx` skill's reading approach (`markitdown`). Case study slides are visual, and key facts are often inside images, so render the slides with that skill's thumbnail or image conversion when the text alone does not tell you the work type, surface, sector or results.
- **PDF:** follow the `pdf-reading` skill. If a PDF is scanned or mostly images, use its rasterising route rather than concluding the file is empty.

Read text for every case study first, since it is cheap. Render images only for case studies that are still in contention and where the text is not enough.

Where to find the facts: PSYKHE case studies follow the structure in `psykhe-case-study-output` (project basics, cover, mission, approach, insights, output, project summary). The project summary's challenge, approach and impact paragraphs usually give the work type, surface and verified results; the cover and project basics give the client, tags and status.

Handle duplicates and versions:

- The same case study often exists as both PDF and PPTX, and as masked and named versions. Treat them as one case study and list every file. Name the PPTX as the source for any deck, since it is editable; use the PDF only for reading.
- If there are several versions, use the most recently modified one and say which. If versions disagree on facts such as results or dates, flag it and do not choose.
- **Check that a "masked" file really is masked.** Search its text for the client's name and look at the rendered slides or pages for client logos and screenshots that identify the client. If either appears, treat the file as named and flag it.

## Workflow

### 1. Profile the brief

Extract, each with its clause reference:

- **Project type or types**, as work type plus product surface from `references/taxonomy.md`. A brief can have more than one (for example a mobile app redesign plus a design system). Record each.
- **Client sector and sector group.** Take it from the brief or BD notes. If the brief does not say, use the client's publicly known business. If it is still unclear, ask.
- **Context for tie-breaks:** who the users are (customers, staff, agents, citizens), platform or technology named, regulatory context (for example MAS TRM, IM8, accessibility standards), and key deliverables.
- **The brief's own rules on credentials:** number of case studies or references, a recency window ("completed in the last three years"), a definition of "similar project", evaluation weighting for experience, and whether referees or contactable references are required.

The brief's rules override this skill's defaults. If the evaluation criteria define relevant experience explicitly (for example "public sector projects of similar scope"), rank by that definition and say so.

### 2. Check eligibility

A case study is eligible only if all of these hold:

- it is in the approved library;
- it is approved for external use, and not marked confidential or internal only;
- it is completed, or approved for external use while in progress;
- it falls inside the brief's recency window, if the brief sets one.

Record the naming status of each eligible case study: **named** if permission is recorded (say where), otherwise **masked**. If you cannot find a permission record, treat it as masked.

### 3. Score and rank

Score each eligible case study against each project type in the brief, using the match levels in `references/taxonomy.md`:

- **Project type match:** P1 exact, P2 close, P3 partial. Anything below P3 is not relevant and is not ranked.
- **Sector match:** S1 same sector, S2 same sector group, S3 other.

Rank by project type first, then sector: every P1 ranks above every P2, whatever the sector, and within the same project type level S1 ranks above S2 above S3. This is the order PSYKHE has chosen; change it only when the brief's evaluation criteria say otherwise.

Break ties within the same project type and sector level in this order:

1. Fit with the brief's context: same users, platform or technology, regulatory context, deliverables.
2. Verified outcome evidence in the case study (results stated as achieved, not projected).
3. Recency of completion.
4. Delivered by someone on the proposed team.
5. Named ahead of masked.

### 4. Select the shortlist

Take the top case studies up to the number wanted, then apply balance:

- At most one case study per client.
- If the brief has more than one project type, cover each with at least one case study where an eligible match exists.
- Do not pad. If fewer good matches exist than the number wanted, present what you have and say how many are missing. A P3 match is included only if you say plainly that it is a weak match.

### 5. Flag, do not decide

Flag these for the consultant rather than excluding them, since they are judgement calls:

- the case study is for a direct competitor of the target client;
- the case study is for the target client itself (often the strongest evidence, but confirm it is approved and current);
- completed more than five years ago;
- no verified outcome evidence;
- the brief requires contactable referees. Never supply contact names; list it as a gap for the consultant.

## Curation note

Return this, in this order. Use the case study's library title, not the real client name, unless naming permission is recorded. Never include client contact names or contract values.

1. **Brief profile:** project types, sector, users, platform, regulatory context and the brief's credential rules, each with its clause reference.
2. **Ranked shortlist:** rank | case study | project type match (P level and why) | sector match (S level) | why it fits this brief | naming status | flags | library file.
3. **Considered but not shortlisted:** title and the one reason it missed (for example "ineligible: confidential", "P1 but same client as rank 2").
4. **Relevant work with no approved case study:** project, where you found it, and why it is relevant. Recommend whether it is worth writing up.
5. **Gaps:** brief requirements or project types no eligible case study evidences.
6. **Classification appendix:** only when you classified case studies yourself: title, work type, surface, sector, year completed, status.

Write in British English. Keep reasons to one line each.

## Failure behaviour

| Situation | Action |
| --- | --- |
| Brief missing | Stop and ask. |
| Case study library unreachable | Stop; name the library you need. Do not fall back to past proposals or memory. |
| A file cannot be opened or read, even after rendering | List it under Gaps with its file name; do not guess its contents. |
| A masked file identifies the client | Treat it as named; flag it for whoever maintains the library. |
| Personal data in the brief | Stop; say where it is; ask for a redacted copy. |
| Client sector unclear after checking the brief, BD notes and public information | Ask before ranking. |
| No eligible match at P3 or better | Say so plainly; list relevant work with no case study and the gaps. |
| Asked to edit, rewrite or "improve" a case study | Decline here and point to `psykhe-case-study-output`. |
