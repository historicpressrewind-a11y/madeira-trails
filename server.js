import express from 'express';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { refreshData } from './scripts/refresh.js';
import { enrichAll } from './scripts/enrich.js';
import { buildIndex } from './scripts/build_index.js';
import {
  latestGoodSnapshot,
  promoteSnapshot,
  listSnapshots
} from './scripts/utils/snapshots.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'public', 'data');
const DATA_FILE = path.join(DATA_DIR, 'trails.json');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// Health endpoint returns timestamp of last successful refresh
app.get('/health', (_, res) => {
  let updated_at = null;
  try {
    updated_at = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).generated_at;
  } catch {
    // ignore
  }
  res.json({ ok: true, updated_at });
});

// List available history snapshots
app.get('/admin/backups', (req, res) => {
  if (req.query.token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.json({ backups: listSnapshots(DATA_FILE).map(s => s.name) });
});

// Promote a specific snapshot to current
app.post('/admin/rollback', express.json(), (req, res) => {
  if (req.query.token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const name = req.body?.snapshot;
  const snap = listSnapshots(DATA_FILE).find(s => s.name === name);
  if (!snap) {
    return res.status(404).json({ error: 'snapshot_not_found' });
  }
  try {
    promoteSnapshot(DATA_FILE, snap.path);
    res.json({ ok: true, promoted: name });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Manual refresh pipeline: refresh -> enrich -> build index
app.post('/admin/refresh', express.json(), async (req, res) => {
  if (req.query.token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const ref = await refreshData({ dataFile: DATA_FILE });
    if (ref.ok) {
      const enr = await enrichAll({ dataFile: DATA_FILE });
      const idx = await buildIndex({ dataFile: DATA_FILE });
      return res.json({ ok: true, ref, enr, idx });
    }
    return res.status(503).json({ ok: false, ref, message: 'Using last known good snapshot.' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Schedule daily job at 06:10 Atlantic/Madeira
cron.schedule(
  '10 6 * * *',
  async () => {
    try {
      const ref = await refreshData({ dataFile: DATA_FILE });
      if (ref.ok) {
        await enrichAll({ dataFile: DATA_FILE });
        await buildIndex({ dataFile: DATA_FILE });
      } else {
        console.error('Daily refresh failed validation. Keeping last good snapshot.', ref.details);
      }
    } catch (e) {
      console.error('Daily job crashed:', e);
    }
  },
  { timezone: 'Atlantic/Madeira' }
);

// Bootstrapping and server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  try {
    // On first start, if no data file exists, promote latest snapshot
    if (!fs.existsSync(DATA_FILE)) {
      const latest = latestGoodSnapshot(DATA_FILE);
      if (latest) promoteSnapshot(DATA_FILE, latest.path);
    }
    const ref = await refreshData({ dataFile: DATA_FILE });
    if (ref.ok) {
      await enrichAll({ dataFile: DATA_FILE });
      await buildIndex({ dataFile: DATA_FILE });
    } else {
      console.warn('Initial refresh failed validation. Serving last good snapshot.');
      await buildIndex({ dataFile: DATA_FILE });
    }
  } catch (e) {
    console.error('Startup job failed:', e);
  }
  console.log(`Madeira trails site on :${PORT}`);
});
