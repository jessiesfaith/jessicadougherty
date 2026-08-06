// The PUBLIC resume. No cookie check on purpose: this is the one thing in the
// workspace meant to be read by anyone, and it is only ever what she pressed
// Publish on — never the working version, never a draft aimed at one posting.
//
// Nothing is published until she publishes something. Until then this hands off
// to the resume.html that ships with the site, so the link on the landing page
// is never broken.
const { readDoc, configured } = require('./_store');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function shell(doc) {
  const name = doc.name || 'Resume';
  const updated = doc.at ? new Date(doc.at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Resume &mdash; ${esc(name)}</title>
<meta name="description" content="${esc(doc.headline || name)}" />
<meta name="theme-color" content="#0e1513" />
<style>
  :root{ --ink:#1f4e79 }
  *{box-sizing:border-box;margin:0;padding:0}
  html{background:#0e1513}
  body{background:#0e1513;padding:28px 18px 64px;font-family:Georgia,'Times New Roman',serif}
  .sheet{max-width:8in;margin:0 auto;background:#fff;color:#1a1a1a;padding:.6in .55in;border-radius:12px;
    box-shadow:0 18px 50px rgba(0,0,0,.45);font-size:11.5pt;line-height:1.5}
  h1{font-size:22pt;margin-bottom:2px;color:var(--ink);letter-spacing:-.4px}
  .ph{font-size:11.5pt;color:#444}
  .pc{font-size:10pt;color:#555;margin-bottom:16px}
  h2{font-size:10.5pt;text-transform:uppercase;letter-spacing:.1em;color:var(--ink);
    border-bottom:1.5px solid var(--ink);padding-bottom:2px;margin:16px 0 9px;
    font-family:Helvetica,Arial,sans-serif}
  .e{margin-bottom:11px}
  .e-top{display:flex;justify-content:space-between;gap:14px;align-items:baseline}
  .e-org{font-weight:700;color:var(--ink)}
  .e-meta{font-size:9.5pt;color:#666;white-space:nowrap}
  .e-role{font-style:italic;font-size:11pt;margin-bottom:2px}
  ul{margin:0 0 0 19px}
  li{margin-bottom:3px}
  b.hi{color:var(--ink)}
  .foot{max-width:8in;margin:16px auto 0;color:#8b978b;font-size:12px;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;gap:14px;flex-wrap:wrap}
  .foot a{color:#e9a97d;text-decoration:none}
  @media print{
    body{background:#fff;padding:0}
    .sheet{box-shadow:none;border-radius:0;max-width:none;padding:.5in}
    .foot{display:none}
    @page{margin:.5in}
  }
</style>
</head>
<body>
<article class="sheet">${doc.html || ''}</article>
<div class="foot">
  <a href="/">jessicadougherty.com</a>
  ${updated ? '<span>Updated ' + esc(updated) + '</span>' : ''}
</div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  // A published resume is meant to be cached and crawled, unlike everything
  // else here — but not for so long that pressing Publish looks like it failed.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=600');

  let doc = null;
  try {
    if (configured()) doc = await readDoc('published');
  } catch {
    doc = null; // a storage problem must not take the public page down
  }

  if (!doc || !doc.html) {
    res.statusCode = 302;
    res.setHeader('Location', '/resume.html');
    return res.end();
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(shell(doc));
};
