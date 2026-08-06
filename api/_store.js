// JSON document store backed by a PRIVATE GitHub repository.
//
// Why GitHub rather than a hosted database: your data ends up as plain JSON
// files in a repo you own. You can `git clone` it, keep it forever, and read it
// with nothing but a text editor. Every save is a commit, so the full history of
// your career master and every resume is recoverable — and none of it depends on
// this site, on Vercel, or on any subscription staying paid.
//
// Setup (all free):
//   1. Create a PRIVATE repo, e.g. jessiesfaith/career-data. Tick "Add a README".
//   2. GitHub → Settings → Developer settings → Personal access tokens →
//      Fine-grained tokens. Repository access: only that repo.
//      Permissions: Repository permissions → Contents → Read and write.
//   3. In Vercel, set GITHUB_DATA_REPO (e.g. jessiesfaith/career-data) and
//      GITHUB_DATA_TOKEN (the token). Optionally GITHUB_DATA_BRANCH (default main).

const API = 'https://api.github.com';

const PATHS = {
  master: 'career/master.json',
  templates: 'career/templates.json',
  archives: 'career/archives.json',
  jobs: 'career/jobs.json',
  fits: 'career/fit-scores.json',
  cover: 'career/cover-blocks.json',
  settings: 'career/settings.json',
  // The one document that is served to the public, by api/resume.js. It only
  // ever holds what she pressed Publish on — never the working version.
  published: 'career/published-resume.json',
  // What she intends to do, as opposed to what she has done.
  plans: 'career/plans.json',
};

function cfg() {
  return {
    token: process.env.GITHUB_DATA_TOKEN || '',
    repo: process.env.GITHUB_DATA_REPO || '',
    branch: process.env.GITHUB_DATA_BRANCH || 'main',
  };
}

function configured() {
  const c = cfg();
  return Boolean(c.token && c.repo && c.repo.includes('/'));
}

function pathFor(kind) {
  const p = PATHS[kind];
  if (!p) throw new Error('Unknown kind: ' + kind);
  return p;
}

async function gh(url, init = {}) {
  const { token } = cfg();
  return fetch(API + url, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'jessicadougherty-career-workspace',
      ...(init.headers || {}),
    },
  });
}

// Turns GitHub's failure modes into something you can act on, instead of a 500.
async function explain(res) {
  let detail = '';
  try { detail = (await res.json()).message || ''; } catch { /* ignore */ }
  if (res.status === 401) {
    return new Error('GitHub rejected the token (401). Fine-grained tokens expire — generate a new one and update GITHUB_DATA_TOKEN in Vercel, then redeploy.');
  }
  if (res.status === 403) {
    return new Error('GitHub refused the request (403). The token most likely lacks "Contents: Read and write" on this repository. ' + detail);
  }
  if (res.status === 404) {
    return new Error('Repository or branch not found (404). Check GITHUB_DATA_REPO is exactly owner/name, that the repo exists, and that the token grants access to it.');
  }
  if (res.status === 409 || res.status === 422) {
    return new Error('GitHub could not apply the write (' + res.status + '). ' + detail + ' If the repo is brand new, make sure it has at least one commit — create it with a README.');
  }
  return new Error('GitHub API error ' + res.status + '. ' + detail);
}

// A 404 on a file is ambiguous: either the file has simply never been written
// (normal on first run) or the repo/token is wrong (fatal, and silently seeding
// a fresh master over it would look like data loss). Ask which it is.
async function repoReachable() {
  const { repo } = cfg();
  const res = await gh('/repos/' + repo);
  if (res.ok) return true;
  throw await explain(res);
}

async function getFile(kind) {
  const { repo, branch } = cfg();
  const res = await gh('/repos/' + repo + '/contents/' + pathFor(kind) + '?ref=' + encodeURIComponent(branch));
  if (res.status === 404) {
    await repoReachable(); // throws with a useful message if the repo/token is the problem
    return null;           // repo is fine — this file just does not exist yet
  }
  if (!res.ok) throw await explain(res);
  const body = await res.json();
  const text = Buffer.from(String(body.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
  return { sha: body.sha, text };
}

async function readDoc(kind) {
  const file = await getFile(kind);
  if (!file || !file.text) return null;
  try {
    return JSON.parse(file.text);
  } catch {
    throw new Error('The stored ' + kind + ' file is not valid JSON. Open it in the data repo and fix or revert it — the history is intact.');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* The Contents API reads and writes files up to 1 MB. Past that GitHub returns
   a 403 whose message is about blobs, which is not something you can act on
   halfway through a save. These documents grow — every score run keeps its full
   result, every prep redraft keeps a snapshot — so the wall is reachable. Say
   which file, how big it got, and what to prune, while a save still works. */
const MAX_BYTES = 1000 * 1024;
const WARN_BYTES = 800 * 1024;
const PRUNE_HINT = {
  fits: 'Delete older runs in Score history.',
  jobs: 'Delete prep versions you no longer need, or remove applications you are done with (tick them and Remove).',
};
function checkSize(kind, json) {
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > MAX_BYTES) {
    throw new Error('Your ' + kind + ' file has reached ' + Math.round(bytes / 1024) + ' KB. GitHub will not store a file over 1 MB through this API, so this save was stopped before anything was lost. ' +
      (PRUNE_HINT[kind] || 'Remove some older entries.') + ' Nothing already saved has been touched.');
  }
  return bytes;
}

// A 409 from the Contents API means the file moved under us between reading its
// sha and writing — another commit landed on the branch first. That is normal
// git behaviour, not an error to show the user: re-read the sha and try again.
async function writeDoc(kind, data, attempt = 0) {
  const { repo, branch } = cfg();
  const json = JSON.stringify(data, null, 2);
  const bytes = checkSize(kind, json);
  const existing = await getFile(kind); // fetch sha immediately before writing
  const payload = {
    message: 'Update ' + kind + (typeof data.version === 'number' ? ' (v' + data.version + ')' : '') +
      (bytes > WARN_BYTES ? ' [' + Math.round(bytes / 1024) + ' KB — approaching the 1 MB limit]' : ''),
    content: Buffer.from(json, 'utf8').toString('base64'),
    branch,
  };
  if (existing && existing.sha) payload.sha = existing.sha;

  const res = await gh('/repos/' + repo + '/contents/' + pathFor(kind), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if ((res.status === 409 || res.status === 422) && attempt < 4) {
    await sleep(220 * (attempt + 1)); // stagger so racing writers do not collide again
    return writeDoc(kind, data, attempt + 1);
  }
  if (!res.ok) throw await explain(res);
  return data;
}

module.exports = { readDoc, writeDoc, configured, PATHS, MAX_BYTES, WARN_BYTES };
