const { isAuthed, noStore } = require('./_auth');
const { page } = require('./_dashboard-page');

// This is the guard. Copy these five lines into any future private module.
module.exports = (req, res) => {
  noStore(res);

  if (!isAuthed(req)) {
    res.statusCode = 302;
    res.setHeader('Location', '/login.html');
    return res.end();
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(page());
};
