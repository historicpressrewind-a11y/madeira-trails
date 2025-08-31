import axios from 'axios';
import pdfParse from 'pdf-parse';
import path from 'path';
import {
  ensureDirs,
  validateJSON,
  saveAsSnapshot,
  promoteSnapshot,
  pruneSnapshots
} from './utils/snapshots.js';

// URL to the official Visit Madeira PDF listing trail statuses
const VISIT_MADEIRA_PDF =
  'https://visitmadeira.com/media/bl4glmch/percursos-pedestres-classificados-abertos-fechados.pdf';

// Map of multilingual status strings to canonical keys
const STATUS_MAP = {
  ABERTO: 'open',
  OPEN: 'open',
  ENCERRADO: 'closed',
  CLOSED: 'closed',
  'PARCIALMENTE ABERTO': 'partially_open',
  'PARTIALLY OPEN': 'partially_open',
  'PARCIALMENTE ENCERRADO': 'partially_closed',
  'PARTIALLY CLOSED': 'partially_closed'
};

// Regular expression to detect PR codes in the PDF text
const PR_CODE_RE = /\bPR\s?\d+(?:\.\d+)?\b/;

/**
 * Download and parse the Visit Madeira PDF, returning normalized trail objects
 */
async function fetchFromVisitMadeiraPDF() {
  const pdfResp = await axios.get(VISIT_MADEIRA_PDF, {
    responseType: 'arraybuffer',
    maxRedirects: 5
  });
  const pdfData = await pdfParse(pdfResp.data);
  const lines = pdfData.text.split('\n').map(s => s.trim()).filter(Boolean);

  const trails = [];
  let current = null;
  for (const line of lines) {
    if (/^MADEIRA$/i.test(line) || /^PORTO\s+SANTO$/i.test(line)) continue;
    if (PR_CODE_RE.test(line)) {
      if (current) trails.push(normalize(current));
      current = { raw: [line] };
      continue;
    }
    if (current) current.raw.push(line);
  }
  if (current) trails.push(normalize(current));

  return {
    trails: trails.filter(t => t && t.code && t.name),
    source_meta: [
      {
        kind: 'pdf',
        url: VISIT_MADEIRA_PDF,
        fetched_at: new Date().toISOString()
      }
    ]
  };
  
  function normalize(block) {
    const text = block.raw.join(' | ');
    const codeMatch = text.match(PR_CODE_RE);
    const code = codeMatch ? codeMatch[0].replace(/\s+/g, '') : null;
    let statusKey = null;
    for (const k of Object.keys(STATUS_MAP)) {
      if (text.toUpperCase().includes(k)) {
        statusKey = STATUS_MAP[k];
        break;
      }
    }
    const island = /PORTO\s+SANTO/i.test(text)
      ? 'Porto Santo'
      : /\b(Pico Branco|Terra Ch[ãa]|Pico do Castelo|Camacha|Capela da Gra\u00e7a)\b/i.test(text)
      ? 'Porto Santo'
      : 'Madeira';
    let name = text;
    if (code) {
      const idx = text.indexOf(code);
      name = text.slice(idx + code.length).replace(/\s*[\-\u2013]\s*/, ' ').trim();
    }
    name = name
      .replace(/ABERTO|ENCERRADO|PARCIALMENTE ABERTO|PARCIALMENTE ENCERRADO|OPEN|CLOSED|PARTIALLY OPEN|PARTIALLY CLOSED/gi, '')
      .trim();
    name = name.replace(/\s*\|\s*/g, ' ').replace(/\s{2,}/g, ' ');
    let notes = '';
    const noteMatch = text.match(/(?:Nota|Note)\s*:\s*([^|]+)/i);
    if (noteMatch) notes = noteMatch[1].trim();
    return { island, code, name, status: statusKey || 'open', notes };
  }
}

/**
 * Primary entry: scrape the PDF, validate the new payload, snapshot and promote if valid.
 */
export async function refreshData({ dataFile }) {
  ensureDirs(dataFile);
  const { trails, source_meta } = await fetchFromVisitMadeiraPDF();
  const payload = {
    generated_at: new Date().toISOString(),
    island_groups: [
      {
        island: 'Madeira',
        trails: trails.filter(t => t.island === 'Madeira').map(stripIsland)
      },
      {
        island: 'Porto Santo',
        trails: trails.filter(t => t.island === 'Porto Santo').map(stripIsland)
      }
    ],
    status_legend: {
      open: 'Fully open',
      partially_open: 'Open only on a specified section (see notes)',
      closed: 'Closed',
      partially_closed: 'Some sections closed; see notes'
    },
    sources: source_meta
  };

  const { ok, errors } = validateJSON(dataFile, payload);
  if (!ok) {
    return { ok: false, error: 'validation_failed', details: errors };
  }

  // Save and promote snapshot
  const snapPath = saveAsSnapshot(dataFile, payload);
  promoteSnapshot(dataFile, snapPath);
  pruneSnapshots(dataFile, 30);
  return { ok: true, count: trails.length, snapshot: path.basename(snapPath) };
}

function stripIsland(t) {
  const { island, ...rest } = t;
  return rest;
}

// CLI support: run refresh script standalone
if (process.argv[1]?.endsWith('refresh.js')) {
  const dataFile = path.join(process.cwd(), 'public', 'data', 'trails.json');
  refreshData({ dataFile })
    .then(r => {
      console.log(r);
    })
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
