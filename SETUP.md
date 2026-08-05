# Private login — setup

Public site stays exactly as it is. `index.html`, `resume.html`, and `calendar.html`
were not touched. This adds a gated area at **jessicadougherty.com/dashboard**.

## What was added

```
login.html                  public sign-in page
vercel.json                 routes /dashboard -> the guarded function
api/login.js                checks the password, issues the session cookie
api/logout.js               clears the cookie
api/dashboard.js            the guard: no valid cookie -> redirect to login
api/_auth.js                cookie signing / verifying (private module)
api/_dashboard-page.js      the private page's HTML (private module)
```

Files inside `api/` that start with `_` are never published as URLs. The private
page's HTML only exists inside a function that checks your cookie first — there
is no static file anyone could find by guessing a URL.

## Step 1 — add the files to the repo

GitHub → **Add file → Upload files** on `jessiesfaith/jessicadougherty`.
Drag in `login.html`, `vercel.json`, and the whole `api` folder. Commit to `main`.

## Step 2 — set two environment variables in Vercel

Vercel → your project → **Settings → Environment Variables**. Add both to
**Production** (and Preview, if you use preview deploys):

| Name | Value |
| --- | --- |
| `SITE_PASSWORD` | your password — see below |
| `SESSION_SECRET` | `39fc3e07f15dcbfbf0bc30bd5f80df8e52468b5538e9300b2fafc680c9e2d48d` |

`SESSION_SECRET` is not a password you ever type. It is the key used to sign the
session cookie so a forged cookie can't be accepted. Never put it in the repo.

**Pick your own `SITE_PASSWORD`.** Generate one in your password manager, 20+
characters, used nowhere else. A starter value was suggested in chat — if you use
it, treat it as temporary and rotate it, since it has been sitting in a chat log.

## Step 3 — redeploy

Vercel → **Deployments → ⋯ → Redeploy** on the latest one. Environment variables
are only picked up by a new build.

## Step 4 — check it (takes 60 seconds)

1. Open `jessicadougherty.com` — public site loads normally, unchanged.
2. Open `jessicadougherty.com/dashboard` in a **private window** → you get bounced
   to the login page. This is the important one.
3. Type the wrong password → "That password is not right." No access.
4. Type the right password → the workspace opens.
5. Close the browser completely, reopen, go to `/dashboard` → login again. That's
   the behaviour you asked for.
6. Click **Sign out** → cookie cleared, back to login.

If step 2 shows you the workspace without asking, stop and tell me — that means
the env vars didn't get picked up.

## How the session behaves

- The cookie is set with **no expiry date**, which makes it a *session cookie* —
  the browser deletes it when the browser closes.
- The server also refuses any cookie older than **2 hours**, even if the browser
  stayed open.
- The cookie is `HttpOnly` (JavaScript can't read it), `Secure` (HTTPS only), and
  `SameSite=Strict` (not sent when arriving from another site).
- To change the 2-hour window, edit `TTL_MS` at the top of `api/_auth.js`.

## Adding a module later

Say you build Experience:

1. `api/experience.js` — copy the four-line guard from `api/dashboard.js`.
2. Add a rewrite in `vercel.json`:
   `{ "source": "/dashboard/experience", "destination": "/api/experience" }`
3. In `api/_dashboard-page.js`, set that module's `href` to `/dashboard/experience`.

Anything served from an `/api` route that starts with the guard is private by
default. That is the pattern to keep repeating.

## The tradeoff you're accepting

This is **one shared password**, not an identity check. It is strong against
guessing (long random password, constant-time comparison, signed cookie,
throttled attempts) but it has no notion of *who* is typing it — if the password
ever leaks, whoever has it is in, and there's no per-device revoke beyond
changing the password.

The upgrade, when you want it, is Google sign-in with your email hard-allowlisted:
nothing to leak, one click to sign in, and you'd still get a fresh session each
visit. It costs about 10 minutes of Google Cloud console setup, and only
`api/login.js` and `api/_auth.js` change — the guard, the routes, and every module
you build in the meantime stay exactly as they are.
