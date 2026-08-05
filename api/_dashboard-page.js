// The private page. It lives inside /api as a "_" module, which means Vercel
// never publishes it as a static file — the only way to see this HTML is to
// pass the cookie check in api/dashboard.js. There is no URL that leaks it.
//
// ADDING A MODULE LATER:
//   1. Add an entry to MODULES below (set `href` once the page exists).
//   2. Create api/<module>.js, copy the guard from api/dashboard.js, and add a
//      rewrite in vercel.json: { "source": "/dashboard/x", "destination": "/api/x" }
//   Anything served from an /api route with that guard is private by default.

const MODULES = [
  {
    key: 'career',
    title: 'Career master',
    blurb: 'Every role, degree, certification, event and hackathon — one editable source of truth.',
    icon: 'M3 7h18v12H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    href: '/career#career',
  },
  {
    key: 'builder',
    title: 'Resume builder',
    blurb: 'Pick sections from the master and build a version aimed at a specific role.',
    icon: 'M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM14 4v6h6',
    href: '/career#builder',
  },
  {
    key: 'archive',
    title: 'Resume archive',
    blurb: 'Frozen snapshots of every resume you saved, so you know what you actually sent.',
    icon: 'M3 7h18v13H3zM3 7l2-4h14l2 4M10 12h4',
    href: '/career#archive',
  },
  {
    key: 'jobs',
    title: 'Jobs',
    blurb: 'Paste a posting, get a fit read and gap list, generate a tailored resume and cover letter.',
    icon: 'M3 9h18M7 3v4m10-4v4M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
    href: '/career#jobs',
  },
  {
    key: 'education',
    title: 'Education notes',
    blurb: 'Your separate education page, now behind this same login.',
    icon: 'M22 10 12 5 2 10l10 5zM6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5',
    href: '/education.html',
  },
  {
    key: 'resume',
    title: 'Public resume',
    blurb: 'The version anyone can see at /resume.html. The builder does not touch it.',
    icon: 'M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
    href: '/resume.html',
  },
];

function card(m) {
  const tag = m.href
    ? '<a class="mod" href="' + m.href + '">'
    : '<div class="mod is-todo" role="group" aria-label="' + m.title + ', not built yet">';
  const close = m.href ? '</a>' : '</div>';
  return (
    tag +
    '<span class="mod-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' +
    m.icon +
    '"/></svg></span>' +
    '<h3>' + m.title + '</h3>' +
    '<p>' + m.blurb + '</p>' +
    (m.href ? '<span class="mod-go">Open &rarr;</span>' : '<span class="mod-tag">Not built yet</span>') +
    close
  );
}

function page() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow, noarchive" />
<title>Private — Jessica Dougherty</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap" rel="stylesheet" />
<style>
  :root{
    --bg:#0e1513; --card:linear-gradient(150deg,#152017 0%,#1d2b21 55%,#26372c 100%);
    --card-2:rgba(255,255,255,.07); --border:rgba(255,255,255,.09);
    --text:#f3eee1; --muted:#bcc6ba; --faint:#8b978b;
    --accent:#e9a97d; --accent-2:#9fc7a6;
    --radius:18px; --maxw:940px; --shadow:0 16px 42px rgba(0,0,0,.42);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{background:var(--bg)}
  body{color:var(--text);font-family:'DM Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased;letter-spacing:-.01em;min-height:100vh}
  a{color:inherit;text-decoration:none}
  .wrap{max-width:var(--maxw);margin:0 auto;padding:0 22px}

  .smoke{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;animation:swirl 120s linear infinite}
  .smoke b{position:absolute;border-radius:50%;filter:blur(72px);opacity:.5;mix-blend-mode:soft-light;display:block}
  .smoke .s1{width:62vw;height:62vw;left:-12vw;top:-14vh;background:radial-gradient(circle,#a9cab4,transparent 66%)}
  .smoke .s2{width:58vw;height:58vw;right:-14vw;bottom:-16vh;background:radial-gradient(circle,#5a836e,transparent 66%)}
  .smoke .s3{width:44vw;height:44vw;left:6vw;bottom:2vh;background:radial-gradient(circle,#d9a179,transparent 68%)}
  @keyframes swirl{to{transform:rotate(360deg)}}
  @media(prefers-reduced-motion:reduce){.smoke{animation:none}}

  nav{position:sticky;top:0;z-index:50;backdrop-filter:blur(12px);background:rgba(14,21,19,.86);border-bottom:1px solid var(--border)}
  .nav-inner{display:flex;align-items:center;gap:16px;height:64px}
  .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px}
  .lock{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:9px;background:rgba(159,199,166,.14);border:1px solid rgba(159,199,166,.3);color:var(--accent-2)}
  .lock svg{width:15px;height:15px}
  .nav-links{margin-left:auto;display:flex;align-items:center;gap:18px}
  .nav-links a{color:var(--muted);font-size:14px;font-weight:500;transition:color .15s}
  .nav-links a:hover{color:var(--text)}
  .signout{background:var(--card-2);border:1px solid var(--border);padding:7px 14px;border-radius:10px;font-size:13px;font-weight:600;color:var(--text) !important}
  .signout:hover{border-color:var(--accent)}

  header.hero{padding:56px 0 26px}
  .pill{display:inline-flex;align-items:center;gap:8px;background:rgba(159,199,166,.14);border:1px solid rgba(159,199,166,.3);color:var(--accent-2);padding:6px 13px;border-radius:100px;font-size:12.5px;font-weight:600}
  .dot{width:7px;height:7px;border-radius:50%;background:var(--accent-2)}
  h1{font-family:'Fraunces',Georgia,serif;font-size:clamp(30px,5.4vw,44px);line-height:1.06;font-weight:600;margin:20px 0 10px;letter-spacing:-.02em}
  h1 .accent{color:var(--accent)}
  .lead{font-size:16.5px;color:var(--muted);max-width:620px}

  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(268px,1fr));gap:16px;padding:14px 0 10px}
  .mod{display:flex;flex-direction:column;gap:9px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:22px;box-shadow:var(--shadow);transition:transform .14s,border-color .15s}
  .mod:not(.is-todo):hover{transform:translateY(-2px);border-color:var(--accent)}
  .mod-ico{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:11px;background:rgba(233,169,125,.16);border:1px solid rgba(233,169,125,.28);color:var(--accent)}
  .mod-ico svg{width:19px;height:19px}
  .mod h3{font-family:'Fraunces',Georgia,serif;font-size:19px;font-weight:600;letter-spacing:-.01em}
  .mod p{font-size:14px;color:var(--muted);flex:1}
  .mod-go{font-size:13px;font-weight:700;color:var(--accent)}
  .mod-tag{font-size:12px;font-weight:600;color:var(--faint);border:1px dashed rgba(255,255,255,.16);padding:4px 9px;border-radius:8px;align-self:flex-start}
  .is-todo{opacity:.82}

  .note{margin:26px 0 60px;background:var(--card-2);border:1px solid var(--border);border-radius:14px;padding:18px 20px;font-size:14px;color:var(--muted)}
  .note strong{color:var(--text);font-weight:600}
  footer{border-top:1px solid var(--border);padding:22px 0 40px;font-size:13px;color:var(--faint)}
</style>
</head>
<body>
<div class="smoke" aria-hidden="true"><b class="s1"></b><b class="s2"></b><b class="s3"></b></div>

<nav>
  <div class="wrap nav-inner">
    <span class="brand">
      <span class="lock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></svg></span>
      Private workspace
    </span>
    <span class="nav-links">
      <a href="/">Public site</a>
      <a class="signout" href="/api/logout">Sign out</a>
    </span>
  </div>
</nav>

<header class="hero">
  <div class="wrap">
    <span class="pill"><span class="dot"></span> Signed in</span>
    <h1>Your <span class="accent">private</span> workspace.</h1>
    <p class="lead">Nothing here is reachable from the public site. Each card below becomes a module as you build it &mdash; the login already covers all of them.</p>
  </div>
</header>

<main class="wrap">
  <section class="grid">
    ${MODULES.map(card).join('\n    ')}
  </section>

  <div class="note">
    <strong>Session:</strong> expires when you close your browser, and after 2 hours regardless.
    Signing in again is the point &mdash; it proves the gate still works.
  </div>
</main>

<footer class="wrap">Private area &middot; jessicadougherty.com</footer>
</body>
</html>`;
}

module.exports = { page, MODULES };
