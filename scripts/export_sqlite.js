import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

function normalizeKm(txt) {
  if (!txt) return null;
  const m = String(txt).replace(',', '.').match(/([\d.]+)\s*km/i);
  return m ? Number(m[1]) : null;
}
function normalizeMinutes(txt) {
  if (!txt) return null;
  const s = txt.toLowerCase().replace(',', '.').replace(/\s+/g, '');
  const h = /(\d+(?:\.\d+)?)h/.exec(s);
  const m = /(\d+)\s*(?:m|min)/.exec(txt.toLowerCase());
  if (h && !m) return Math.round(parseFloat(h[1]) * 60);
  if (h && m) return Math.round(parseFloat(h[1]) * 60 + parseInt(m[1], 10));
  const h2 = /(\d+)h(\d{1,2})$/.exec(s);
  if (h2) return parseInt(h2[1], 10) * 60 + parseInt(h2[2], 10);
  if (!h && m) return parseInt(m[1], 10);
  return null;
}

// Determine paths relative to project root
const root = process.cwd();
const dataFile = path.join(root, 'public', 'data', 'trails.json');
const metaFile = path.join(root, 'public', 'data', 'trails_meta.json');
const schemaFile = path.join(root, 'db', 'schema.sql');
const outFile = path.join(root, 'db', 'trails.sqlite');

// Load data
const base = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};

// Prepare database
fs.mkdirSync(path.join(root, 'db'), { recursive: true });
const db = new Database(outFile);
db.exec(fs.readFileSync(schemaFile, 'utf8'));

const upsert = db.prepare(`
  INSERT INTO trails (code, name, island, status, difficulty, distance_km, duration_min, url, image, notes)
  VALUES (@code, @name, @island, @status, @difficulty, @distance_km, @duration_min, @url, @image, @notes)
  ON CONFLICT(code) DO UPDATE SET
    name=excluded.name,
    island=excluded.island,
    status=excluded.status,
    difficulty=excluded.difficulty,
    distance_km=excluded.distance_km,
    duration_min=excluded.duration_min,
    url=excluded.url,
    image=excluded.image,
    notes=excluded.notes
`);

const tx = db.transaction(rows => rows.forEach(r => upsert.run(r)));
const rows = [];
for (const group of base.island_groups) {
  for (const t of group.trails) {
    const m = meta[t.code] || {};
    rows.push({
      code: t.code,
      name: t.name,
      island: group.island,
      status: t.status,
      difficulty: (m.difficulty || '').toLowerCase() || null,
      distance_km: normalizeKm(m.distance),
      duration_min: normalizeMinutes(m.duration),
      url: m.url || null,
      image: m.image || null,
      notes: t.notes || null
    });
  }
}
tx(rows);
db.close();
console.log({ outFile, inserted: rows.length });
