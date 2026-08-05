// Thin JSON-document store on top of Vercel Blob (private access).
// Each "kind" is one JSON document. Data is tiny (kilobytes), so a document
// per kind keeps this simple and avoids a database entirely.

const PATHS = {
  master: 'career/master.json',
  templates: 'career/templates.json',
  archives: 'career/archives.json',
  jobs: 'career/jobs.json',
  settings: 'career/settings.json',
};

let blobMod = null;
async function blob() {
  // @vercel/blob ships as ESM; dynamic import keeps this file CommonJS.
  if (!blobMod) blobMod = await import('@vercel/blob');
  return blobMod;
}

function pathFor(kind) {
  const p = PATHS[kind];
  if (!p) throw new Error('Unknown kind: ' + kind);
  return p;
}

async function streamToString(stream) {
  if (!stream) return '';
  if (typeof stream.text === 'function') return stream.text();
  const reader = stream.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

// Returns the parsed document, or null when it has never been written.
async function readDoc(kind) {
  const { get } = await blob();
  let result;
  try {
    // useCache:false — we read straight after writing, and a stale read here
    // would silently show the user their previous edit.
    result = await get(pathFor(kind), { access: 'private', useCache: false });
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
  if (!result || result.statusCode !== 200) return null;
  const text = await streamToString(result.stream);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Stored ' + kind + ' document is not valid JSON.');
  }
}

async function writeDoc(kind, data) {
  const { put } = await blob();
  await put(pathFor(kind), JSON.stringify(data, null, 2), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
  return data;
}

function isNotFound(err) {
  const msg = String((err && err.message) || err || '');
  return /not.?found/i.test(msg) || /404/.test(msg) || (err && err.status === 404);
}

function configured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN || process.env.BLOB_STORE_ID);
}

module.exports = { readDoc, writeDoc, configured, PATHS };
