import fs from 'fs';
import path from 'path';
import axios from 'axios';
import cheerio from 'cheerio';

// Base URL for Visit Madeira trails section
const VISIT_BASE = 'https://www.visitmadeira.com';
const GUESS_LISTING = `${VISIT_BASE}/en-gb/what-to-do/activities/walking-routes`;

// Optional hints for specific PR codes if automatic guessing fails
const SLUG_HINTS = {
  // Example override:
  // "PR1": "https://www.visitmadeira.com/en-gb/what-to-do/activities/walking-routes/pr1-vereda-do-areeiro/",
};

/**
 * Enrich all trails in the given dataFile by scraping Visit Madeira pages for
 * distance, duration, difficulty and images. Uses a cache file to avoid
 * redundant network requests on subsequent runs.
 */
export async function enrichAll({ dataFile }) {
  const root = path.dirname(dataFile);
  const metaFile = path.join(root, 'trails_meta.json');
  const base = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const all = [...base.island_groups[0].trails, ...base.island_groups[1].trails];
  let cache = {};
  if (fs.existsSync(metaFile)) {
    try {
      cache = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    } catch {
      cache = {};
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const t of all) {
    if (cache[t.code]?.refreshed_today === today) continue;
    try {
      const url = SLUG_HINTS[t.code] || (await findTrailUrl(t));
      if (!url) {
        cache[t.code] = { ...cache[t.code], url: null, refreshed_today: today };
        continue;
      }
      const meta = await scrapeTrail(url);
      cache[t.code] = {
        ...(cache[t.code] || {}),
        ...meta,
        url,
        refreshed_today: today
      };
    } catch (e) {
      cache[t.code] = {
        ...(cache[t.code] || {}),
        error: e.message,
        refreshed_today: today
      };
    }
  }
  fs.writeFileSync(metaFile, JSON.stringify(cache, null, 2));
  return { metaFile, count: Object.keys(cache).length };
}

async function findTrailUrl(trail) {
  // Try to guess by listing page
  try {
    const html = (await axios.get(GUESS_LISTING, { timeout: 20000 })).data;
    const $ = cheerio.load(html);
    const links = $('a[href*="/walking-routes/"]')
      .map((_, a) => $(a).attr('href'))
      .get()
      .filter(Boolean)
      .map(href => (href.startsWith('http') ? href : VISIT_BASE + href));
    const code = trail.code.replace(/\s+/g, '').toLowerCase();
    const nameKey = trail.name
      .toLowerCase()
      .split(/[()\-–]/)[0]
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join('-');
    const best = links.find(u => u.toLowerCase().includes(code)) || links.find(u => u.toLowerCase().includes(nameKey));
    if (best) return best;
  } catch {
    /* ignore */
  }
  // Fallback: try constructing common slugs
  const candidates = [
    `${VISIT_BASE}/en-gb/what-to-do/activities/walking-routes/${trail.code.toLowerCase().replace(/\s+/g, '')}`,
    `${VISIT_BASE}/en-gb/what-to-do/activities/walking-routes/${slugify(trail.name)}`
  ];
  for (const c of candidates) {
    try {
      const resp = await axios.head(c, {
        maxRedirects: 0,
        validateStatus: s => s < 400
      });
      if (resp.status < 400) return c;
    } catch {
      // ignore
    }
  }
  return null;
}

async function scrapeTrail(url) {
  const html = (await axios.get(url, { timeout: 20000 })).data;
  const $ = cheerio.load(html);
  const text = $('body')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const distance = pick(text, /(distance)\s*[:\-]?\s*([0-9.,]+\s*(km|mi))/i);
  const duration = pick(text, /(duration|time)\s*[:\-]?\s*([0-9h:\s]+(min|m)?)/i);
  const difficulty = pick(text, /(difficulty)\s*[:\-]?\s*(easy|moderate|medium|hard|difficult|exigent)/i);
  let image =
    $('main img, .c-detail img, article img, .content img')
      .first()
      .attr('src') ||
    $('meta[property="og:image"]').attr('content');
  if (image && !/^https?:\/\//.test(image)) image = VISIT_BASE + image;
  return {
    distance: distance?.value || null,
    duration: duration?.value || null,
    difficulty: difficulty?.value || null,
    image: image || null
  };
}

function pick(text, re) {
  const m = text.match(re);
  if (!m) return null;
  return { label: m[1], value: m[2] || m[0] };
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// CLI support
if (process.argv[1]?.endsWith('enrich.js')) {
  const dataFile = path.join(process.cwd(), 'public', 'data', 'trails.json');
  enrichAll({ dataFile })
    .then(r => console.log(r))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
