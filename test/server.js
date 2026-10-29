'use strict';
const { createDb } = require('./src/db');
const { buildApp } = require('./src/app');
const PORT = Number(process.env.PORT || 3000);

// One database and app per process. `npm start` listens on PORT; on Vercel the exported
// handler is called for each request instead, so the app is built on the first one.
let ready = null;
function getApp() {
  if (!ready) ready = createDb().then((db) => ({ db, app: buildApp(db) })).catch((e) => { ready = null; throw e; });
  return ready;
}
module.exports = async (req, res) => (await getApp()).app(req, res);

if (require.main === module) {
  getApp().then(({ db, app }) => app.listen(PORT, () => console.log(`Accolm Check running at http://localhost:${PORT} (database: ${db.driver})`)));
}
