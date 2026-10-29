'use strict';
const { createDb } = require('./src/db');
const { buildApp } = require('./src/app');
const PORT = Number(process.env.PORT || 3000);
(async () => {
  const db = await createDb();
  buildApp(db).listen(PORT, () => console.log(`Accolm Check running at http://localhost:${PORT} (database: ${db.driver})`));
})();
