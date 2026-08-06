// Ingest endpoint for the Gmail agent.
//
// This is the ONE route that is not behind your login, because it is called by
// a machine, not a browser. It authenticates with a shared secret instead, and
// it can only do one thing: create draft applications. It cannot read your data,
// generate documents, or send anything.
//
// The Apps Script that calls this runs inside your own Google account, so no
// Google credential is ever stored on this site.

const { readDoc, writeDoc, configured } = require('./_store');

const MAX_PER_CALL = 40;

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.resolve(null); }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 4 * 1024 * 1024) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || 'null')); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

// Constant-time compare so the secret can't be discovered by timing the endpoint.
function secretOk(given) {
  const expected = process.env.INBOX_SECRET || '';
  if (!expected || !given) return false;
  const crypto = require('node:crypto');
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 300);

function newApplication(job, source) {
  return {
    id: 'job-' + Math.random().toString(36).slice(2, 10),
    company: clean(job.company, 160),
    role: clean(job.role, 200),
    url: clean(job.url, 600),
    // The alert email is a teaser. The real description still has to be fetched,
    // and pretending otherwise would quietly produce resumes aimed at nothing.
    text: '',
    teaser: clean(job.teaser, 1200),
    needsDescription: true,
    status: 'draft',
    deadline: '',
    appliedOn: '',
    createdAt: new Date().toISOString(),
    source: source || 'inbox',
    sourceMessageId: clean(job.messageId, 200),
    resume: { status: 'draft', itemIds: [], summary: '', frozenText: '', frozenHtml: '', generatedAt: null },
    coverLetter: { status: 'draft', paragraphs: [], frozenText: '', generatedAt: null },
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!process.env.INBOX_SECRET) {
    return res.status(503).json({ ok: false, code: 'NO_SECRET', error: 'INBOX_SECRET is not set on this deployment.' });
  }
  if (!secretOk(req.headers['x-inbox-secret'])) {
    return res.status(401).json({ ok: false, error: 'Bad or missing secret.' });
  }
  if (!configured()) {
    return res.status(503).json({ ok: false, code: 'NO_STORE', error: 'Data repo is not connected.' });
  }

  const body = await readBody(req);
  const incoming = Array.isArray(body && body.jobs) ? body.jobs : null;
  if (!incoming) return res.status(400).json({ ok: false, error: 'Body must be {jobs:[...]}.' });

  try {
    const doc = (await readDoc('jobs')) || { schema: 1, version: 0, updatedAt: null, items: [] };
    doc.items = Array.isArray(doc.items) ? doc.items : [];

    // Same posting arriving twice — a re-run, or LinkedIn resending the alert —
    // must not create a second application.
    const seenUrl = new Set(doc.items.map((j) => (j.url || '').trim()).filter(Boolean));
    const seenMsg = new Set(doc.items.map((j) => j.sourceMessageId).filter(Boolean));

    const added = [];
    let skipped = 0;
    for (const job of incoming.slice(0, MAX_PER_CALL)) {
      const url = clean(job.url, 600);
      const msg = clean(job.messageId, 200);
      if ((url && seenUrl.has(url)) || (msg && url && seenMsg.has(msg) && seenUrl.has(url))) { skipped++; continue; }
      if (!url && !clean(job.role, 200)) { skipped++; continue; }
      const app = newApplication(job, body.source);
      doc.items.unshift(app);
      if (url) seenUrl.add(url);
      if (msg) seenMsg.add(msg);
      added.push({ id: app.id, company: app.company, role: app.role });
    }

    if (added.length) {
      doc.version = (typeof doc.version === 'number' ? doc.version : 0) + 1;
      doc.updatedAt = new Date().toISOString();
      await writeDoc('jobs', doc);
    }

    return res.status(200).json({
      ok: true,
      added: added.length,
      skippedAsDuplicate: skipped,
      truncated: incoming.length > MAX_PER_CALL ? incoming.length - MAX_PER_CALL : 0,
      items: added,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
};
