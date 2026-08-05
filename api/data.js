const { isAuthed, noStore } = require('./_auth');
const { readDoc, writeDoc, configured } = require('./_store');
const { seed } = require('./_seed');

const LIST_KINDS = ['templates', 'archives', 'jobs', 'settings'];
const ALL_KINDS = ['master', ...LIST_KINDS];

function emptyList() {
  return { schema: 1, version: 1, updatedAt: null, items: [] };
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.resolve(null); }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 5 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => { try { resolve(JSON.parse(raw || 'null')); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

module.exports = async (req, res) => {
  noStore(res);

  if (!isAuthed(req)) return res.status(401).json({ ok: false, error: 'Not signed in.' });

  if (!configured()) {
    return res.status(503).json({
      ok: false,
      error: 'Storage is not connected yet. In Vercel: Storage → Create Database → Blob → set access to Private → connect it to this project, then redeploy.',
      code: 'NO_STORE',
    });
  }

  const url = new URL(req.url, 'https://local');
  const kind = url.searchParams.get('kind') || '';

  if (!ALL_KINDS.includes(kind)) {
    return res.status(400).json({ ok: false, error: 'Unknown kind. Expected one of: ' + ALL_KINDS.join(', ') });
  }

  try {
    if (req.method === 'GET') {
      let doc = await readDoc(kind);
      if (!doc) {
        doc = kind === 'master' ? seed() : emptyList();
        await writeDoc(kind, doc); // first run: lay down the starting document
      }
      return res.status(200).json({ ok: true, doc });
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      if (!body || typeof body.doc !== 'object' || body.doc === null) {
        return res.status(400).json({ ok: false, error: 'Body must be {doc, expectedVersion}.' });
      }

      const current = await readDoc(kind);
      const currentVersion = current && typeof current.version === 'number' ? current.version : 0;

      // Guards against two open tabs silently clobbering each other.
      if (typeof body.expectedVersion === 'number' && body.expectedVersion !== currentVersion) {
        return res.status(409).json({
          ok: false,
          code: 'VERSION_CONFLICT',
          error: 'This was changed somewhere else since you loaded it. Reload before saving so you do not overwrite the newer copy.',
          currentVersion,
          doc: current,
        });
      }

      const next = { ...body.doc, version: currentVersion + 1, updatedAt: new Date().toISOString() };
      await writeDoc(kind, next);
      return res.status(200).json({ ok: true, doc: next });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
};
