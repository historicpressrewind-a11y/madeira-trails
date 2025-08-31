import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Derive history and schema locations relative to dataFile
const HISTORY_DIR = dataFile => path.join(path.dirname(dataFile), 'history');
const SCHEMA_FILE = dataFile => path.join(path.dirname(dataFile), 'schema.trails.json');

/**
 * Write JSON atomically by first writing to a tmp file and then renaming.
 * Ensures readers never see partially written content.
 */
export function writeAtomicJSON(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, filePath);
}

/** Ensure required directories exist */
export function ensureDirs(dataFile) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.mkdirSync(HISTORY_DIR(dataFile), { recursive: true });
}

/** Timestamp string safe for filenames (ISO with colons replaced) */
export function timestamp() {
  return new Date().toISOString().replace(/[:]/g, '-');
}

/** List available history snapshots chronologically */
export function listSnapshots(dataFile) {
  const dir = HISTORY_DIR(dataFile);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => /^trails_.*\.json$/.test(f))
    .sort()
    .map(f => ({ name: f, path: path.join(dir, f) }));
}

/** Prune oldest snapshots to keep the last N */
export function pruneSnapshots(dataFile, keep = 30) {
  const snaps = listSnapshots(dataFile);
  const toDelete = Math.max(0, snaps.length - keep);
  for (let i = 0; i < toDelete; i++) {
    try {
      fs.unlinkSync(snaps[i].path);
    } catch {
      // ignore
    }
  }
}

/** Load JSON schema and compile a validator */
export function loadSchema(dataFile) {
  const schemaPath = SCHEMA_FILE(dataFile);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

/** Validate a payload against the trails schema */
export function validateJSON(dataFile, payload) {
  const validate = loadSchema(dataFile);
  const ok = validate(payload);
  return { ok, errors: ok ? [] : validate.errors };
}

/** Promote a snapshot by copying it over the current data file atomically */
export function promoteSnapshot(dataFile, snapshotPath) {
  writeAtomicJSON(dataFile, JSON.parse(fs.readFileSync(snapshotPath, 'utf8')));
}

/** Find the most recent valid snapshot */
export function latestGoodSnapshot(dataFile) {
  const snaps = listSnapshots(dataFile).reverse();
  for (const s of snaps) {
    try {
      const json = JSON.parse(fs.readFileSync(s.path, 'utf8'));
      const { ok } = validateJSON(dataFile, json);
      if (ok) return s;
    } catch {
      // skip invalid JSON
    }
  }
  return null;
}

/** Save a payload as a new snapshot and return the path */
export function saveAsSnapshot(dataFile, payload) {
  const dir = HISTORY_DIR(dataFile);
  const file = path.join(dir, `trails_${timestamp()}.json`);
  writeAtomicJSON(file, payload);
  return file;
}
