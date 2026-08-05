const {
  createToken,
  sessionCookie,
  secretsMatch,
  clientIp,
  noStore,
} = require('./_auth');

// Best-effort throttle. Serverless instances come and go, so this slows a
// casual guesser rather than acting as a hard guarantee. The real protection
// is that the password is long and random.
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map();

function throttled(ip) {
  const rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() > rec.resetAt) {
    attempts.delete(ip);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    rec.count += 1;
  }
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      return Promise.resolve({});
    }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 4096) req.destroy(); // don't buffer junk
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (req, res) => {
  noStore(res);

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const expected = process.env.SITE_PASSWORD;
  if (!expected || !process.env.SESSION_SECRET) {
    // Misconfigured -> refuse to let anyone in.
    return res
      .status(500)
      .json({ ok: false, error: 'Login is not configured yet. Set SITE_PASSWORD and SESSION_SECRET in Vercel.' });
  }

  const ip = clientIp(req);
  if (throttled(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many attempts. Wait a few minutes and try again.' });
  }

  const body = await readBody(req);
  const supplied = typeof body.password === 'string' ? body.password : '';

  // Constant-ish delay so a wrong password is not measurably faster.
  await sleep(350);

  if (!supplied || !secretsMatch(supplied, expected)) {
    recordFailure(ip);
    return res.status(401).json({ ok: false, error: 'That password is not right.' });
  }

  attempts.delete(ip);
  res.setHeader('Set-Cookie', sessionCookie(createToken()));
  return res.status(200).json({ ok: true, redirect: '/dashboard' });
};
