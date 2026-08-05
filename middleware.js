// Runs at the edge BEFORE any static file is served, so the pages listed in
// `matcher` below cannot be read by anyone without a valid session cookie —
// even though they are still ordinary .html files you can edit on GitHub.
//
// To gate another page, add its path to the matcher array. That's the whole job.

export const config = {
  matcher: [
    '/education.html',
    '/education-editor.html',
    '/education',
    '/education-editor',
  ],
};

const COOKIE = 'jd_session';

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function base64urlToBytes(s) {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Same token format as api/_auth.js: "<expiry>.<nonce>.<hmac>".
// Edge runtime has Web Crypto, not node:crypto, hence subtle.verify here.
async function verifyToken(token, secret) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  let sig;
  try {
    sig = base64urlToBytes(parts[2]);
  } catch {
    return false;
  }

  const ok = await crypto.subtle.verify('HMAC', key, sig, enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) return false;

  const exp = Number(parts[0]);
  return Number.isFinite(exp) && Date.now() < exp;
}

export default async function middleware(request) {
  const secret = process.env.SESSION_SECRET;
  const token = readCookie(request.headers.get('cookie'), COOKIE);

  let authed = false;
  try {
    // No secret configured -> nobody is authenticated. Fail closed.
    if (secret && token) authed = await verifyToken(token, secret);
  } catch {
    authed = false;
  }

  if (authed) return; // let the static file through

  const url = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL('/login.html', url.origin).toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}
