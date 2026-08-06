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
  settings: 'career/settings.json',
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

// A 409 from the Contents API means the file moved under us between reading its
// sha and writing — another commit landed on the branch first. That is normal
// git behaviour, not an error to show the user: re-read the sha and try again.
async function writeDoc(kind, data, attempt = 0) {
  const { repo, branch } = cfg();
  const existing = await getFile(kind); // fetch sha immediately before writing
  const payload = {
    message: 'Update ' + kind + (typeof data.version === 'number' ? ' (v' + data.version + ')' : ''),
    content: Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64'),
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

module.exports = { readDoc, writeDoc, configured, PATHS };
