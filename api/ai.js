const { isAuthed, noStore } = require('./_auth');

const API = 'https://api.anthropic.com/v1';
const VERSION = '2023-06-01';

let cachedModel = null;

function key() {
  return process.env.ANTHROPIC_API_KEY || '';
}

async function listModels() {
  const r = await fetch(API + '/models?limit=20', {
    headers: { 'x-api-key': key(), 'anthropic-version': VERSION },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.message || 'Could not list models (HTTP ' + r.status + ')');
  return (body.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
}

// Never hardcode a model id — they get retired and the feature would silently
// break months from now. Prefer the env var, else ask the API what exists.
async function resolveModel() {
  if (process.env.ANTHROPIC_MODEL) return process.env.ANTHROPIC_MODEL;
  if (cachedModel) return cachedModel;
  const models = await listModels();
  if (!models.length) throw new Error('No models available on this API key.');
  cachedModel = models[0].id;
  return cachedModel;
}

const GUARDRAILS = `You help Jessica Dougherty tailor her resume. She is an accounting professional pursuing a CPA licence, so accuracy is a professional obligation, not a preference.

HARD RULES:
- Use ONLY facts present in the CAREER DATA provided. Never invent or estimate employers, titles, dates, dollar figures, percentages, team sizes, or credentials.
- Never upgrade a credential. "Results pending" stays "results pending".
- You may reorder, select, condense, and rephrase existing content, and you may surface a fact that is buried in one bullet into a clearer one.
- If the job posting asks for something the career data does not evidence, do NOT write around it. Report it as a gap.
- Prefer her own wording where it is already strong. Do not add corporate filler.
- Output valid JSON only. No markdown fences, no commentary outside the JSON.`;

async function post(model, system, user, maxTokens, tools) {
  const r = await fetch(API + '/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key(),
      'anthropic-version': VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      ...(tools ? { tools } : {}),
    }),
  });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
}

// Anthropic's hosted search. Not every key or model has it, and a request that
// asks for it and is refused should still answer — just without sources.
const WEB_SEARCH = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
const NO_TOOL_ERR = /tool|unsupported|not supported|invalid.*type/i;

// Where a claim came from, so "is this legitimate" has an answer you can click.
function citationsOf(content) {
  const seen = new Set(), out = [];
  (content || []).forEach((c) => (c.citations || []).forEach((ct) => {
    const url = ct.url || '';
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, title: ct.title || url });
  }));
  return out;
}

// Models differ in how much they will write in one reply, and the ceiling is
// not something this app can know in advance. Ask for the room the longest
// answer needs; if that model will not take it, it says so in the error and we
// come back with the smaller figure rather than failing the whole request.
const CEILING_ERR = /max_tokens|output.*(limit|token)/i;

async function callClaude({ system, user, maxTokens = 4000, floorTokens, tools }) {
  const model = await resolveModel();
  let r = await post(model, system, user, maxTokens, tools);
  if (!r.ok && tools && NO_TOOL_ERR.test(r.body?.error?.message || '')) {
    r = await post(model, system, user, maxTokens);   // answer without sources
  }
  if (!r.ok && floorTokens && floorTokens < maxTokens && CEILING_ERR.test(r.body?.error?.message || '')) {
    r = await post(model, system, user, floorTokens, tools);
  }
  if (!r.ok) throw new Error(r.body?.error?.message || 'Claude API error (HTTP ' + r.status + ')');
  const text = (r.body.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return { text, model, stopReason: r.body.stop_reason || '', citations: citationsOf(r.body.content) };
}

/* A reply that ran out of room is still mostly good: the sections already
   written are complete and correct, and only the last one is half-finished.
   Closing the structure round them turns a dead request into a shorter score,
   which is worth far more than an error telling her to try again. */
function repairTruncatedJson(s) {
  const stack = [];
  let inStr = false, esc2 = false, lastSafe = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc2) esc2 = false;
      else if (c === '\\') esc2 = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') stack.pop();
    // A comma at depth 1 or 2 sits between whole elements: everything up to it
    // parses once the open brackets are closed.
    else if (c === ',' && stack.length && stack.length <= 2) lastSafe = i;
  }
  // Only ever cut back to a comma between whole elements. Closing the brackets
  // around a half-written section would hand back a requirement with a missing
  // score or a sentence that stops mid-word, and a wrong score is worse than
  // no score.
  if (!stack.length || lastSafe === -1) return null;
  const head = s.slice(0, lastSafe);
  const depth = [];
  let str = false, e = false;
  for (let i = 0; i < head.length; i++) {
    const c = head[i];
    if (str) { if (e) e = false; else if (c === '\\') e = true; else if (c === '"') str = false; continue; }
    if (c === '"') str = true;
    else if (c === '{' || c === '[') depth.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') depth.pop();
  }
  if (str) return null;   // the cut landed inside a string: not an element edge
  try { return JSON.parse(head + depth.reverse().join('')); } catch { return null; }
}

function parseJson(text) {
  const trimmed = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try { return JSON.parse(trimmed.slice(first, last + 1)); } catch { /* fall through */ }
    }
    if (first !== -1) return repairTruncatedJson(trimmed.slice(first));
    return null;
  }
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.resolve(null); }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 2 * 1024 * 1024) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || 'null')); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

const PROMPTS = {
  analyze: (b) => `CAREER DATA:
${JSON.stringify(b.master)}

JOB POSTING:
${b.posting}

Analyse the fit. Return JSON exactly in this shape:
{
 "roleTitle": "the role title from the posting",
 "company": "the company from the posting, or empty string",
 "matchScore": 0-100,
 "matchRationale": "two sentences, plain language, no flattery",
 "strengths": [{"itemId":"id from career data","why":"why this posting cares about it"}],
 "gaps": [{"requirement":"what the posting asks for","evidence":"none|partial","note":"what she could add to close it, or say if it is not closable"}],
 "keywords": ["terms from the posting worth mirroring, only if truthful for her"],
 "recommendedItemIds": ["career data ids to include, best first"],
 "summaryRewrite": "a professional summary tailored to this posting, built only from existing facts"
}`,

  tailor: (b) => `CAREER DATA:
${JSON.stringify(b.master)}

TARGET ROLE: ${b.targetRole || 'unspecified'}
${b.posting ? 'JOB POSTING:\n' + b.posting : ''}

Suggest bullet-level edits for the selected items (${JSON.stringify(b.itemIds || [])}). Return JSON:
{
 "suggestions": [
   {"itemId":"...","bulletId":"...","original":"...","suggested":"...","reason":"short"}
 ],
 "dropped": [{"itemId":"...","reason":"why this item is noise for this role"}]
}
Every "suggested" must be supported by "original" or by other facts in CAREER DATA. If a bullet is already right, leave it out.`,

  score: (b) => `FULL CAREER DATA — everything she has:
${JSON.stringify(b.master)}

THE RESUME BEING SCORED ("${b.templateName || 'untitled'}"), exactly as it reads:
"""
${b.resumeText || ''}
"""

JOB POSTING:
${b.posting}

Score how well THIS SPECIFIC RESUME answers THIS posting — not how good her career is overall. Return JSON:
{
 "score": 0-100,
 "verdict": "one or two plain sentences. No flattery. Say plainly if it is a weak fit.",
 "covered": [{"requirement":"what the posting asks for","evidence":"the line or role in the resume that shows it"}],
 "omitted": [{"requirement":"...","itemId":"an id that EXISTS in the career data but does NOT appear in this resume","why":"what including it would add"}],
 "missing": [{"requirement":"...","note":"nothing in her career data evidences this at all"}],
 "keywordsAbsent": ["terms the posting uses that this resume never says, and that would be truthful for her"]
}

The distinction between "omitted" and "missing" is the whole point of this task:
- omitted = she has the evidence, this version left it out. The itemId MUST appear in the career data. Never invent one.
- missing = she does not have it. Say so plainly rather than stretching something to fit.
If a requirement is genuinely unclear from the posting, leave it out rather than guessing.`,

  questions: (b) => `CAREER DATA:
${JSON.stringify(b.master)}

JOB DESCRIPTION:
"""
${b.posting}
"""

THE CURRENT RESUME:
"""
${b.resumeText || '(none yet)'}
"""

THE CURRENT COVER LETTER:
"""
${b.coverText || '(none yet)'}
"""

The posting asks for things these documents do not answer. Ask HER about them, so she can supply the truth rather than have it invented. Return JSON:
{
 "questions": [
   {
     "requirement": "what the posting asks for, in its words",
     "question": "a direct question to Jessica, answerable in a sentence or two",
     "why": "what answering it would let the documents claim",
     "guess": "if the career data hints at an answer, say what it hints; otherwise empty"
   }
 ]
}
Rules:
- Only ask where the answer is genuinely absent from the career data. Do not ask about things already evidenced.
- Ask about real experience, not about how she would like to be described.
- If she plainly does not have something, still ask once — but phrase it so a "no" is an easy and expected answer.
- At most 8 questions, most important first. Fewer is better.`,

  revise: (b) => `CAREER DATA:
${JSON.stringify(b.master)}

JOB DESCRIPTION:
"""
${b.posting}
"""

CURRENT RESUME:
"""
${b.resumeText || ''}
"""

CURRENT COVER LETTER:
"""
${b.coverText || ''}
"""

HER ANSWERS to the gaps you raised (these are new facts from her, and you MAY use them):
${JSON.stringify(b.answers || [])}

SCORING FEEDBACK from the last comparison, if any:
${JSON.stringify(b.fixes || [])}

Produce the next version of both documents. Return JSON:
{
 "summary": "the professional summary for this version",
 "itemIds": ["career data ids to include, best first"],
 "coverLetter": ["paragraph 1", "paragraph 2", "paragraph 3", "paragraph 4"],
 "changelog": ["short plain-language note per change you made"],
 "stillMissing": ["anything the posting wants that remains unanswered"]
}
Rules:
- You may use HER ANSWERS as fact. Everything else must come from the career data.
- Where an answer says she does not have something, do NOT write around it. Leave it in stillMissing.
- The letter must read as continuous prose in her voice, not as assembled fragments.
- changelog is for her to review at a glance: say what changed and why, one line each.`,

  keywords: (b) => `CAREER DATA (for context):
${JSON.stringify(b.master)}

THE ENTRY TO TAG:
${JSON.stringify(b.entry)}

Suggest keywords for this one entry so future matching can find it. Return JSON:
{
 "titles": ["job titles this entry is genuine evidence for"],
 "skills": ["capabilities it demonstrates"]
}
Titles must be roles she could credibly be considered for ON THE STRENGTH OF THIS ENTRY — not aspirational ones. Skills must be visible in the entry's own text. 4-8 of each at most. No duplicates between the two lists.`,

  scoresections: (b) => `JOB DESCRIPTION:
"""
${b.posting}
"""

THE RESUME:
"""
${b.resumeText || '(none attached)'}
"""

THE COVER LETTER:
"""
${b.coverText || '(none attached)'}
"""

Break the job description into its distinct requirement sections, then score EACH section twice: once against the resume, once against the cover letter. Return JSON:
{
 "overallResume": 0-100,
 "overallCover": 0-100,
 "verdict": "two plain sentences about the pair together",
 "sections": [
   {
     "requirement": "the section heading or requirement, in the posting's own words",
     "detail": "what it is actually asking for",
     "resumeScore": 0-100,
     "resumeEvidence": "the line in the resume that answers it, or empty if none",
     "resumeFix": "a specific, concrete suggestion for the resume, or empty if it is already fine",
     "coverScore": 0-100,
     "coverEvidence": "the sentence in the cover letter that answers it, or empty",
     "coverFix": "a specific suggestion for the cover letter, or empty"
   }
 ]
}
Score 0 where there is genuinely no evidence — do not be generous. A fix must be achievable from facts already present in the career data; if the requirement simply is not met, say so in the fix rather than inventing a way to claim it.
At most 12 sections. Merge requirements that ask for the same thing rather than listing them twice, and keep every evidence and fix to one sentence — a long posting must still return a complete, closed JSON object.`,

  interviewprep: (b) => `CAREER DATA:
${JSON.stringify(b.master)}

THE POSTING:
"""
${b.posting}
"""

THE RESUME THAT WAS SENT:
"""
${b.resumeText || '(none)'}
"""

THE COVER LETTER THAT WAS SENT:
"""
${b.coverText || '(none)'}
"""

She has an interview for this role. Read all three documents against each other and prepare her.

Return JSON:
{
 "questions": [
   {
     "question": "a question this panel is likely to actually ask, in their words",
     "why": "what in the posting or her documents makes them ask it",
     "probes": "what they are really testing",
     "angle": "the honest line she can take, built only from her record — or 'no evidence' if she has none"
   }
 ],
 "checks": ["anything an interviewer could challenge because the three documents disagree, overstate, or leave a gap — quote the wording"],
 "resumeSuggestions": ["what the posting suggests the resume should say differently, one per line"],
 "coverSuggestions": ["the same for the cover letter"]
}

Twelve questions at most, hardest first. Cover the obvious technical ground the posting names, the gaps her documents concede, and the two or three questions she would least like to be asked.
CHECKS ARE THE POINT: a claim in the letter the resume does not support, a title or company named wrongly, a date range that does not add up, a system named in one document and not the other — say it plainly and quote it. She would rather find it here than across a table.
Every angle must be built only from the career data and the documents above. Where there is nothing, say "no evidence" and let her answer it herself.`,

  answerhelp: (b) => `CAREER DATA:
${JSON.stringify(b.master)}

JOB DESCRIPTION:
"""
${b.posting}
"""

THE QUESTION SHE IS ANSWERING:
${b.question}

WHAT THE POSTING ASKS FOR:
${b.requirement}${b.why ? '\n' + b.why : ''}

WHAT HER OWN RECORD ALREADY HINTS AT:
${b.guess || '(nothing)'}

WHAT SHE HAS WRITTEN SO FAR:
"""
${(b.draft || '').trim() || '(nothing yet)'}
"""

${(b.draft || '').trim()
  ? 'She has written something. Tighten it into a clear answer a hiring manager could act on. Keep every fact she stated, in her meaning. Do not add experience she did not state.'
  : 'She has written nothing. Draft a STARTING POINT from the three columns above and the career data only. Where the career data does not settle something, leave a plain gap marker like [confirm: how many entities] rather than guessing a value — she fills those in.'}

Then use web search for two things, and only these two:
1. How comparable postings for this kind of role word this requirement, so she can see what the phrase is normally taken to mean.
2. The specific standard, regulation or code the requirement rests on where one exists — ASC topics, SOX sections, IRC sections, GAAP/GAAS references, state board rules — with the citation, so she can check it herself.

Return JSON:
{
 "draft": "the answer, in her voice, first person, no more than 90 words",
 "usedFacts": ["each fact you used, quoted from the career data or from what she wrote"],
 "mustConfirm": ["anything the draft needs that neither the career data nor her own text establishes"],
 "references": [{"label":"e.g. ASC 842 or 'comparable posting'","detail":"one sentence on what it says and why it is relevant","url":"the source"}],
 "note": "one sentence on what you did"
}
HARD RULE for this task: the draft may contain no claim about her experience that is not either in the career data or in what she has already written. Anything else belongs in mustConfirm, never in the draft. A short honest answer beats a fuller one you cannot source. If the honest answer is that she has not done this, write that.`,

  coversuggest: (b) => `CAREER DATA:
${JSON.stringify(b.master)}

EXISTING COVER LETTER BLOCKS she can reuse:
${JSON.stringify(b.blocks || [])}

JOB DESCRIPTION:
${b.posting}

Choose which existing blocks fit this posting, and draft any that are missing. Return JSON:
{
 "useBlockIds": ["ids from the existing blocks, in the order they should appear"],
 "newBlocks": [{"kind":"opening|proof|why|closing","title":"short label","text":"the paragraph"}],
 "note": "one sentence on the angle you took"
}
Every new block must be built only from facts in the career data. Kinds: opening (who she is, why this role), proof (a specific accomplishment), why (why this company), closing (the ask). No more than 4 new blocks.`,

  cover: (b) => `CAREER DATA:
${JSON.stringify(b.master)}

JOB POSTING:
${b.posting}

${b.notes ? 'HER NOTES TO INCORPORATE:\n' + b.notes : ''}

Draft a cover letter. Return JSON:
{
 "greeting": "...",
 "body": ["paragraph 1","paragraph 2","paragraph 3"],
 "closing": "...",
 "flags": ["anything you could not support from the career data"]
}
Three or four short paragraphs. Specific, not effusive. Lead with the single most relevant piece of her actual experience. No phrases like "I am excited to apply" or "perfect fit".`,
};

module.exports = async (req, res) => {
  noStore(res);

  if (!isAuthed(req)) return res.status(401).json({ ok: false, error: 'Not signed in.' });

  if (!key()) {
    return res.status(503).json({
      ok: false,
      code: 'NO_KEY',
      error: 'No Anthropic API key yet. Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy.',
    });
  }

  try {
    const url = new URL(req.url, 'https://local');

    if (req.method === 'GET' && url.searchParams.get('action') === 'models') {
      return res.status(200).json({ ok: true, models: await listModels(), active: process.env.ANTHROPIC_MODEL || cachedModel || null });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const body = await readBody(req);
    const action = body && body.action;
    if (!PROMPTS[action]) {
      return res.status(400).json({ ok: false, error: 'Unknown action. Expected one of: ' + Object.keys(PROMPTS).join(', ') });
    }
    if (!body.master) return res.status(400).json({ ok: false, error: 'Missing career data.' });
    if (action === 'answerhelp' && !String(body.question || '').trim()) {
      return res.status(400).json({ ok: false, error: 'No question to answer.' });
    }
    if (['analyze', 'cover', 'score', 'scoresections', 'coversuggest', 'questions', 'revise', 'interviewprep'].includes(action) && !body.posting) {
      return res.status(400).json({ ok: false, error: 'Paste the job posting first.' });
    }
    if (action === 'keywords' && !body.entry) {
      return res.status(400).json({ ok: false, error: 'No entry supplied to tag.' });
    }
    if (action === 'scoresections' && !String(body.resumeText || '').trim() && !String(body.coverText || '').trim()) {
      return res.status(400).json({ ok: false, error: 'Attach a resume or a cover letter before scoring.' });
    }
    if (action === 'score' && !String(body.resumeText || '').trim()) {
      return res.status(400).json({ ok: false, error: 'That resume version is empty — nothing to score.' });
    }

    const long = action === 'scoresections' || action === 'revise' || action === 'interviewprep';
    const { text, model, stopReason, citations } = await callClaude({
      system: GUARDRAILS,
      user: PROMPTS[action](body),
      maxTokens: action === 'cover' ? 2000 : action === 'keywords' ? 800 : long ? 16000 : 5000,
      floorTokens: long ? 8000 : undefined,
      // Only this one reaches the web, and only to show her where a claim came
      // from. Nothing it finds may become a fact about her career.
      tools: (action === 'answerhelp' || action === 'interviewprep') ? WEB_SEARCH : undefined,
    });

    let parsed = parseJson(text);
    // A salvage that reached no complete section is a header and nothing else.
    // Rendering it would read as "the posting asked for nothing".
    if (parsed && action === 'scoresections' && !(parsed.sections || []).length) parsed = null;
    if (!parsed) {
      // Say which failure it was. "Unparseable" sent her back to a button that
      // was always going to fail the same way on the same posting.
      return res.status(502).json(stopReason === 'max_tokens'
        ? { ok: false, error: 'The reply was cut off before it finished — this posting has more in it than fits in one answer. Shorten the job description, or score the resume and letter separately.', raw: text.slice(-800) }
        : { ok: false, error: 'Claude returned something unparseable. Try again.', raw: text.slice(0, 800) });
    }

    return res.status(200).json({ ok: true, action, model, result: parsed,
      truncated: stopReason === 'max_tokens', citations: citations || [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
};
