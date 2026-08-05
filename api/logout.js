const { clearedCookie, noStore } = require('./_auth');

module.exports = (req, res) => {
  noStore(res);
  res.setHeader('Set-Cookie', clearedCookie());

  // Fired by navigator.sendBeacon on tab close — no redirect wanted there.
  if (req.method === 'POST') {
    res.statusCode = 204;
    return res.end();
  }

  res.statusCode = 302;
  res.setHeader('Location', '/login.html?signedout=1');
  res.end();
};
