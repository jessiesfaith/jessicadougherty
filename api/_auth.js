// Shared auth helpers. Files in /api that start with "_" are NOT routes on
// Vercel — this is a private module, never reachable over HTTP.
const crypto = require('node:crypto');

const COOKIE = 'jd_session';

// How long a session stays valid on the server, even if the browser stays open.
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET is missing or too short (needs 32+ chars).');
  }
  return s;
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function createToken() {
  const exp = String(Date.now() + TTL_MS);
  const nonce = crypto.randomBytes(9).toString('base64url');
  const payload = exp + '.' + nonce;
  return payload + '.' + sign(payload);
}

function verifyToken(token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const payload = parts[0] + '.' + parts[1];
  const given = Buffer.from(parts[2]);
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(given, expected)) return false;

  const exp = Number(parts[0]);
  return Number.isFinite(exp) && Date.now() < exp;
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
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

function isAuthed(req) {
  try {
    return verifyToken(readCookie(req, COOKIE));
  } catch {
    // SESSION_SECRET not configured -> nobody is authenticated. Fail closed.
    return false;
  }
}

// No Max-Age and no Expires => a *session* cookie. The browser throws it away
// when the browser is closed, so you sign in again next time.
function sessionCookie(token) {
  return COOKIE + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Strict';
}

function clearedCookie() {
  return COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}

// Compares two secrets without leaking length or content through timing.
function secretsMatch(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
}

module.exports = {
  COOKIE,
  TTL_MS,
  createToken,
  verifyToken,
  isAuthed,
  readCookie,
  sessionCookie,
  clearedCookie,
  secretsMatch,
  clientIp,
  noStore,
};
