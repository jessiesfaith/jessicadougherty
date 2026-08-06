// The private page. It lives inside /api as a "_" module, which means Vercel
// never publishes it as a static file — the only way to see this HTML is to
// pass the cookie check in api/dashboard.js. There is no URL that leaks it.
//
// ADDING A MODULE LATER:
//   1. Add an entry to MODULES below (set `href` once the page exists).
//   2. Create api/<module>.js, copy the guard from api/dashboard.js, and add a
//      rewrite in vercel.json: { "source": "/dashboard/x", "destination": "/api/x" }
//   Anything served from an /api route with that guard is private by default.

/* Tabs, not one flat wall of cards. Each module belongs to a group, and the
   dashboard shows one group at a time — with sub-tabs where a group has more
   than one place to land. Everything still ends up at a URL behind the same
   cookie check; the grouping is only how you find it.
   ADDING A MODULE: add it to MODULES with a `group`, and if it needs a page of
   its own, create api/<module>.js with the guard from api/dashboard.js and a
   rewrite in vercel.json. */
/* Tabs, not one flat wall of cards. The Career group is the workspace itself:
   one card per tab of /career, in the order they appear there, so the dashboard
   and the app never drift into describing different things.
   ADDING A MODULE: add it to MODULES with a `group`, and a `sub` if its group
   has sub-tabs. If it needs a page of its own, create api/<module>.js with the
   guard from api/dashboard.js and a rewrite in vercel.json. */
const GROUPS = [
  { key: 'career', title: 'Career', blurb: 'The workspace, one card per tab.' },
  { key: 'edex', title: 'Education and Experience', blurb: 'What you studied and what you have done, kept apart from the documents that quote them.' },
  { key: 'public', title: 'Public', blurb: 'The parts of this anyone can see.' },
];

// Sub-tabs, for a group with more than one destination.
const SUBTABS = {
  edex: [
    { key: 'education', title: 'Education' },
    { key: 'experience', title: 'Experience' },
  ],
};

const MODULES = [
  {
    key: 'resume', group: 'career',
    title: 'Resume',
    blurb: 'Your master resume and cover letter, read-only and shown exactly as they print.',
    icon: 'M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM14 4v6h6',
    href: '/career#career',
  },
  {
    key: 'postings', group: 'career',
    title: 'Job Postings',
    blurb: 'Every application on one row — deadline, sent date, contact, notes, and what has been built.',
    icon: 'M3 9h18M7 3v4m10-4v4M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
    href: '/career#archive',
  },
  {
    key: 'fit', group: 'career',
    title: 'Fit Score',
    blurb: 'Every requirement scored twice, then a proposed next version you edit and approve.',
    icon: 'M4 19V9m5 10V5m5 14v-7m5 7V8',
    href: '/career#fit',
  },
  {
    key: 'prep', group: 'career',
    title: 'Interview Prep',
    blurb: 'Likely questions, where your three documents disagree, and what to ask them.',
    icon: 'M12 3a9 9 0 1 0 9 9M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01',
    href: '/career#prep',
  },
  {
    key: 'other', group: 'career',
    title: 'Other',
    blurb: 'Education, experience, events and project plans — what you intend to do, not what you have done.',
    icon: 'M9 11H3v10h6zM15 3H9v18h6zM21 7h-6v14h6z',
    href: '/career#other',
  },
  {
    key: 'education', group: 'edex', sub: 'education',
    title: 'Education notes',
    blurb: 'Your separate education page, behind this same login.',
    icon: 'M22 10 12 5 2 10l10 5zM6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5',
    href: '/education.html',
  },
  {
    key: 'education-editor', group: 'edex', sub: 'education',
    title: 'Edit education',
    blurb: 'Add and change what is on the education page.',
    icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    href: '/education-editor.html',
  },
  {
    key: 'experience', group: 'edex', sub: 'experience',
    title: 'Experience',
    blurb: 'Roles, dates and the bullets under them — the entries every resume is selected from.',
    icon: 'M3 7h18v12H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    href: '/career#career',
  },
  {
    key: 'keywords', group: 'edex', sub: 'experience',
    title: 'Keywords',
    blurb: 'The job titles and skills each entry is evidence for. An untagged entry is invisible to the agent.',
    icon: 'M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7 7h.01',
    href: '/career#career',
  },
  {
    key: 'publicresume', group: 'public',
    title: 'Public resume',
    blurb: 'What both Resume buttons on the landing page show. Publish it from a row in Job Postings.',
    icon: 'M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
    href: '/resume',
  },
  {
    key: 'site', group: 'public',
    title: 'The site itself',
    blurb: 'jessicadougherty.com as everyone else sees it.',
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
    href: '/',
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

  .tabs{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding-bottom:0;margin-top:8px}
  .tab{background:none;border:0;border-bottom:2px solid transparent;color:var(--faint);font:inherit;font-size:14.5px;
    font-weight:600;padding:10px 14px;cursor:pointer;margin-bottom:-1px}
  .tab:hover{color:var(--text)}
  .tab.on{color:var(--text);border-bottom-color:var(--accent)}
  .panel-blurb{color:var(--muted);font-size:14.5px;padding:16px 0 2px;max-width:640px}
  .subtabs{display:flex;gap:6px;flex-wrap:wrap;padding:10px 0 2px}
  .subtab{background:var(--card-2);border:1px solid var(--border);color:var(--muted);font:inherit;font-size:13px;
    font-weight:600;padding:6px 13px;border-radius:100px;cursor:pointer}
  .subtab:hover{color:var(--text)}
  .subtab.on{color:var(--text);border-color:var(--accent);background:rgba(233,169,125,.14)}
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
  <div class="tabs" role="tablist">
    ${GROUPS.map((g, i) => '<button class="tab' + (i === 0 ? ' on' : '') + '" role="tab" data-tab="' + g.key + '">' + g.title + '</button>').join('\n    ')}
  </div>
  ${GROUPS.map((g, i) => {
    const subs = SUBTABS[g.key];
    const mine = MODULES.filter((m) => m.group === g.key);
    const body = subs
      ? '<div class="subtabs">' +
          subs.map((sb, k) => '<button class="subtab' + (k === 0 ? ' on' : '') + '" data-sub="' + g.key + ':' + sb.key + '">' + sb.title + '</button>').join('') +
        '</div>' +
        subs.map((sb, k) => '<section class="grid sub" data-subpanel="' + g.key + ':' + sb.key + '"' + (k === 0 ? '' : ' hidden') + '>' +
          mine.filter((m) => m.sub === sb.key).map(card).join('') + '</section>').join('')
      : '<section class="grid">' + mine.map(card).join('') + '</section>';
    return '<div class="panel" data-panel="' + g.key + '"' + (i === 0 ? '' : ' hidden') + '>' +
      '<p class="panel-blurb">' + g.blurb + '</p>' + body + '</div>';
  }).join('\n  ')}

  <div class="note">
    <strong>Session:</strong> expires when you close your browser, and after 2 hours regardless.
    Signing in again is the point &mdash; it proves the gate still works.
  </div>
</main>

<footer class="wrap">Private area &middot; jessicadougherty.com</footer>
<script>
  // Which tab you were last on, so coming back from a module lands where you
  // left rather than at the top every time.
  var KEY = 'jd_dash_tab';
  function showTab(key) {
    var found = false;
    document.querySelectorAll('[data-panel]').forEach(function (p) {
      var on = p.dataset.panel === key;
      p.hidden = !on;
      if (on) found = true;
    });
    if (!found) return showTab(document.querySelector('[data-panel]').dataset.panel);
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === key); });
    try { localStorage.setItem(KEY, key); } catch (e) {}
  }
  function showSub(id) {
    var group = id.split(':')[0];
    document.querySelectorAll('[data-subpanel]').forEach(function (p) {
      if (p.dataset.subpanel.split(':')[0] === group) p.hidden = p.dataset.subpanel !== id;
    });
    document.querySelectorAll('.subtab').forEach(function (b) {
      if (b.dataset.sub.split(':')[0] === group) b.classList.toggle('on', b.dataset.sub === id);
    });
  }
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.dataset.tab); });
  });
  document.querySelectorAll('.subtab').forEach(function (b) {
    b.addEventListener('click', function () { showSub(b.dataset.sub); });
  });
  try { var saved = localStorage.getItem(KEY); if (saved) showTab(saved); } catch (e) {}
</script>
</body>
</html>`;
}

module.exports = { page, MODULES };
