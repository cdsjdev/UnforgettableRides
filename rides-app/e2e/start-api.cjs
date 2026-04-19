const fs = require('fs');
const path = require('path');

const dbPath = process.env.ANALYTICS_DB_PATH || path.resolve(__dirname, '../../rides-api/tests/data/analytics.app.e2e.db');

for (const suffix of ['', '-wal', '-shm']) {
  const p = `${dbPath}${suffix}`;
  try {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  } catch (err) {
    console.warn(`[app-e2e] failed to remove ${p}: ${err.message}`);
  }
}

console.log(`[app-e2e] starting API with db: ${dbPath}`);
const { app } = require('../../rides-api/src/index.js');
const port = Number(process.env.PORT || 3100);
app.listen(port, '127.0.0.1', () => {
  console.log(`[app-e2e] API listening on http://127.0.0.1:${port}`);
});
