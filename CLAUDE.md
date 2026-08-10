# Working on this repo

Read this before changing anything. It exists so you don't re-litigate
decisions that are already settled, or repeat mistakes that have already been
made here.

`HANDOFF.md` explains what the app *is*. This file is how to work on it.

---

## The one rule that outranks everything

**Nothing an agent writes becomes hers without her approving it.**

Jessica is an accounting professional pursuing a CPA licence. A fabricated line
on a resume is a professional problem, not a UX problem. Every AI path in this
app therefore ends in a review step:

| Feature | Where AI output lands | How it becomes real |
| --- | --- | --- |
| Revise | a *proposal* on the application | she presses Approve / Save |
| Add to resume, Add to letter | the same proposal | same |
| AI help on a question | a review box beside the answer | she presses Use this |
| Interview prep | its own section, answers blank | she writes and approves each |

Anything the model cannot source from her career data goes in a **confirm**
list, never into the draft. If you add an AI feature, it ends in a review step
too. **Do not "improve" this by writing straight into a document.**

The second rule follows from it: **a completed version is a record.** Marking a
document complete freezes its text. Never add a path that edits a frozen
version.

---

## Settled decisions — do not revisit

These were each decided deliberately, several after being tried the other way.

**Editing lives in exactly one place per thing.**
- Posting text → Job Postings only. It is read-only on Fit Score and Interview
  Prep, each with an *Edit in Job Postings* button.
- The postings table → editable in Job Postings, read-only mirror on Resume.
- Resume and cover letter → changed only by approving a draft in Fit Score.
- The master → changed only on the Resume tab.

**Everything is collapsed by default.** Every section on Fit Score, Interview
Prep, Other, and both postings tables. Counts stay on the headings. A fresh
draft and a redraft both arrive closed. Action buttons stay *outside* the
collapse so a section is actionable without opening it.

**Sorting is display-only.** Both postings tables and all four plan lists.
The stored order is never rewritten by a sort. Blanks sort last in both
directions — an empty deadline is not an early one. Columns compare the right
thing: Posting by word count, Built by version count, Priority high→medium→low.

**Plans are not evidence.** The four lists on Other are intentions. No agent
reads them; no version is built from them. When something happens it goes into
the master by hand.

**Publishing is per posting row, and it is a copy.** Editing a version
afterwards changes nothing live until Publish is pressed again.

**Batched AI runs are sequential**, with a counter on the button. Firing eight
at once buys a rate limit and an unreadable bill.

**One list of tabs.** `TABS` drives the hash router. Adding a tab without adding
it there is how `#prep` and `#other` silently landed on the Resume tab.

---

## How to make a change safely

`app.html` is ~4,500 lines: one file, one inline script, HTML built by string
concatenation. That shape has specific failure modes.

**1. Prefer `Edit` over scripted replacements.** If you do use a script, make
each replacement its own step. A failed `assert` aborts every later edit in the
same script, and you get a half-applied change that still parses.

**2. A replacement that misses is silent.** Twice here, markup replacements
missed on whitespace or a missing quote while the *handler* replacement landed,
leaving handlers wired to elements that no longer existed. After removing a
name, grep for it:

```bash
grep -n "removedFlag\|removedId" app.html    # must return nothing
```

**3. Syntax checking is necessary, not sufficient.** It catches brackets. It
does not catch a function nested inside another (parses, renders, throws when
anything else calls it), a stale identifier, or a detached state object.

```bash
node -e 'const fs=require("fs");const h=fs.readFileSync("app.html","utf8");
  const m=[...h.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  fs.writeFileSync("/tmp/app.js", m[0][1]);' && node --check /tmp/app.js
```

**4. Verify by driving the page.** Every feature here was checked in a real
browser against a mock API. That is the only step that has ever caught the
interesting bugs. See "Testing" below.

**5. Then run the full check** — the same one CI runs. Do not merge with it red.

---

## Traps that have already bitten

**Never reassign a `state.*` document.** Use `adoptVersion(state.x, saved)`.
Assigning `state.plans = await api(...)` swapped the arrays out from under every
handler bound to a row; the next keystroke went into a list nothing rendered.

**Never pass an HTML entity through `esc()`.** `esc('a &middot; b')` renders the
literal `&middot;`. Escape the parts, join with the entity:
`[a, b].map(esc).join(' &middot; ')` — that is what `jobLabel()` does.

**Never declare functions inside a render function.** They become invisible to
every other caller. Declare at top level.

**Never re-render a list on `input`.** It steals focus mid-word. Update state,
`queueSave*()`, and let the next natural render pick it up.

**Escape everything.** `esc()` for plain text; `rich()` where `**bold**` and
`***bold blue***` are allowed — it escapes first, then adds the only two tags
permitted. `plain()` strips the markers for anything the agent or a frozen
record sees. Never interpolate raw input.

**`node_modules` does not exist and must not.** No dependencies, no build step.
Keep it that way.

---

## Testing

There is no test suite. Drive the page instead — Playwright is available and
Chromium is preinstalled at `/opt/pw-browsers`.

The pattern that works: a small Node server that serves the repo's files and
mocks `/api/data` (persisting PUTs in memory, so saves round-trip) and
`/api/ai` (returning a fixed result per action). Then a Playwright script that
clicks through the feature and prints assertions.

Two things that will waste your time otherwise:

- **Restart the mock server on a new port for each run.** It persists PUTs, so a
  second run starts from the first run's mutated state and assertions fail for
  no real reason.
- **`newPage({ viewport: ... })`**, not `viewportSize` — the latter is silently
  ignored and every "responsive" assertion runs at 1280px.

---

## Deploying

Push to `main`; Vercel builds it. Nothing compiles.

`.github/workflows/check.yml` parses every API module, every inline script in
every page, and the edge middleware. It skips `<script type="application/json">`
— `education.html` carries an encrypted vault in one.

Environment variables live in Vercel and are listed in `HANDOFF.md`. Changing
one requires a **redeploy**; saving alone does nothing to what is running.
