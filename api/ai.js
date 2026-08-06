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

async function callClaude({ system, user, maxTokens = 4000 }) {
  const model = await resolveModel();
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
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.message || 'Claude API error (HTTP ' + r.status + ')');
  const text = (body.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return { text, model };
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
Score 0 where there is genuinely no evidence — do not be generous. A fix must be achievable from facts already present in the career data; if the requirement simply is not met, say so in the fix rather than inventing a way to claim it.`,

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
    if (['analyze', 'cover', 'score', 'scoresections', 'coversuggest', 'questions', 'revise'].includes(action) && !body.posting) {
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

    const { text, model } = await callClaude({
      system: GUARDRAILS,
      user: PROMPTS[action](body),
      maxTokens: action === 'cover' ? 2000 : action === 'keywords' ? 800 : (action === 'scoresections' || action === 'revise') ? 8000 : 5000,
    });

    const parsed = parseJson(text);
    if (!parsed) {
      return res.status(502).json({ ok: false, error: 'Claude returned something unparseable. Try again.', raw: text.slice(0, 800) });
    }

    return res.status(200).json({ ok: true, action, model, result: parsed });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
};
