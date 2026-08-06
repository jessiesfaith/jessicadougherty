# Career workspace — how it is put together

Everything private lives behind one password at `/career`. No build step, no
dependencies, no framework: `app.html` is the whole client, `api/*.js` are
Vercel functions, and your data is JSON in a private GitHub repo you own.

## The shape of it

| Piece | What it is |
| --- | --- |
| `app.html` | The entire workspace — four tabs, one file, one inline script |
| `api/data.js` | Read/write the JSON documents, with an optimistic-lock check |
| `api/_store.js` | GitHub Contents API as the database |
| `api/ai.js` | Every Claude call. One action per feature |
| `api/_auth.js` | HMAC session token, signed cookie, fail-closed |
| `middleware.js` | Blocks the private pages at the edge, before a file is served |
| `api/inbox.js` | Lets an email agent post a posting in, using `INBOX_SECRET` |

### The four tabs

**Resume** — your master resume and cover letter, read-only, shown exactly as
they print. A read-only mirror of the postings table sits above them.

**Job Postings** — the editable table. Add or capture postings, edit tracking
fields in the row, tick and Remove. Removing is a soft delete: status becomes
`deleted` and *show deleted* brings it back.

**Fit Score** — the working tab. Posting, resume and cover letter side by side;
every requirement scored twice; the agent's questions; a proposed next version
you edit and approve; versions; score history.

**Interview Prep** — after the documents are sent. Likely questions, a
double-check of where the three documents disagree, questions to ask them, and
prep versions.

## Two rules the code keeps

**Nothing an agent writes becomes yours without you approving it.** Revise
produces a *proposal*, not a version. Answer help drafts into a review box, not
into the answer field. Anything the model cannot source from your career data is
listed as something to confirm rather than a sentence to sign. If you change one
thing in here, do not change this.

**A completed version is a record.** Marking a document complete freezes its
text. The Interview Prep tab shows documents read-only for the same reason — the
resume is generated from a version's entries and summary, so there is no text
field to edit, and editing means making the next version in Fit Score.

## Environment variables

| Name | Needed for | Notes |
| --- | --- | --- |
| `SESSION_SECRET` | Everything private | 32+ chars. Without it nobody is authenticated |
| `CAREER_PASSWORD` | Signing in | Long and random; the throttle is best-effort only |
| `GITHUB_DATA_REPO` | Storage | `owner/name` of a **private** repo |
| `GITHUB_DATA_TOKEN` | Storage | Fine-grained token, Contents: Read and write, that repo only. **Expires — diarise it** |
| `GITHUB_DATA_BRANCH` | Storage | Optional, defaults to `main` |
| `ANTHROPIC_API_KEY` | The AI buttons | Everything else works without it |
| `ANTHROPIC_MODEL` | The AI buttons | **Recommended.** Unset, the app takes the first model the API lists, which is not pinned to anything |
| `INBOX_SECRET` | The email agent | Optional |

## The one real constraint: 1 MB per file

The GitHub Contents API will not read or write a file over 1 MB, and these
documents grow — every score run keeps its whole result, every prep redraft
keeps a snapshot. Three things hold the line:

- Score history is capped at **200 runs**, oldest dropped.
- Prep versions are capped at **20 per position**, oldest dropped.
- `api/_store.js` refuses a save that would exceed the limit **before** sending
  it, naming the file, its size and what to prune. Nothing already saved is
  touched. Above 800 KB the commit message carries the size as a warning, so
  the data repo's history shows you it coming.

If you ever see that error, prune from Score history first — it is the fastest
win per KB.

## Deploying

Push to `main`. Vercel builds it. There is nothing to compile.

`.github/workflows/check.yml` parses every API module, every inline script in
every page, and the edge middleware on each push. It exists because the two bugs
that came closest to shipping here were both a stray bracket inside a
template-string expression — invisible in review, fatal at load. **Do not merge
with that check red.**

## Working on `app.html`

It is one long file of string-built HTML. Two habits keep it safe:

1. **Parse it before you commit.** The workflow does it, but so should you:
   `node -e '…new Function(script)…'` — the check step in the workflow is
   copy-pasteable.
2. **Escape everything.** `esc()` for plain text; `rich()` where `**bold**` and
   `***bold blue***` are allowed, which escapes first and then adds the only two
   tags permitted. Never interpolate raw input. Do not pass an HTML entity
   through `esc()` — escape the parts and join with the entity afterwards.

## Known gaps

- **No automated tests.** Everything here was verified by driving a real browser
  against a mock API, run by hand. The CI check catches syntax, not behaviour.
- **The login throttle is per-instance.** Serverless instances come and go, so it
  slows a guesser rather than stopping one. The password is the real protection.
- **Anthropic's hosted web search** is used by answer help and interview prep. If
  the key or model lacks it, both still work and simply return no sources.
- **No Content-Security-Policy.** The app is inline-script heavy, so a useful one
  needs care rather than a one-line header.
