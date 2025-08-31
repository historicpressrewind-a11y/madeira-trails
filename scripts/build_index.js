import fs from 'fs';
import path from 'path';

export async function buildIndex({ dataFile }) {
  const root = path.dirname(dataFile);
  const metaFile = path.join(root, 'trails_meta.json');
  const outFile = path.join(path.dirname(root), 'index.html');

  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};

  const cards = [];
  for (const group of data.island_groups) {
    for (const t of group.trails) {
      const m = meta[t.code] || {};
      const distKm = normalizeKm(m.distance);
      const durMin = normalizeMinutes(m.duration);
      cards.push(
        cardHtml({
          island: group.island,
          code: t.code,
          name: t.name,
          status: t.status,
          notes: t.notes || '',
          distance: m.distance || '',
          duration: m.duration || '',
          difficulty: (m.difficulty || '').toLowerCase(),
          image: m.image || '',
          url: m.url || '',
          distanceKm: distKm ?? '',
          durationMin: durMin ?? ''
        })
      );
    }
  }
  const bodyHtml = pageHtml({ cardsHtml: cards.join('\n'), generatedAt: data.generated_at });
  const html = layoutHtml({ title: 'Madeira & Porto Santo — Hiking Trails', headExtra: headCss(), bodyHtml });
  fs.writeFileSync(outFile, html);
  return { outFile, count: cards.length };
}

/* ---------------------- Layout / Page / Components ---------------------- */

function layoutHtml({ title, headExtra = '', bodyHtml = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
${headExtra}
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function pageHtml({ cardsHtml, generatedAt }) {
  return `
  <header>
    <div class="wrap">
      <h1>Madeira & Porto Santo — Hiking Trails</h1>
      <div class="sub">Live index • Updated daily • Last update: ${new Date(generatedAt).toLocaleString()}</div>

      <div class="filters" id="filters">
        <input id="q" type="text" placeholder="Search name / code…" />
        <select id="status">
          <option value="">Any status</option>
          <option value="open">Open</option>
          <option value="partially_open">Partially open</option>
          <option value="partially_closed">Partially closed</option>
          <option value="closed">Closed</option>
        </select>
        <select id="difficulty">
          <option value="">Any difficulty</option>
          <option value="easy">Easy</option>
          <option value="moderate">Moderate</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
          <option value="difficult">Difficult</option>
        </select>
        <div class="range">
          <label for="dist">≤ Distance (km)</label>
          <input id="dist" type="range" min="0" max="30" step="1" value="30" />
          <span id="distv">30</span>
        </div>
        <div class="range">
          <label for="dur">≤ Duration (min)</label>
          <input id="dur" type="range" min="0" max="600" step="15" value="600" />
          <span id="durv">600</span>
        </div>
      </div>
      <div class="count"><span id="count"></span></div>
    </div>
  </header>

  <main class="wrap">
    <div class="grid" id="grid">
      ${cardsHtml}
    </div>
  </main>

  <footer>
    <div class="wrap sub" style="padding-bottom:28px;">
      Built by you ✌️ • Data refresh at 06:10 Atlantic/Madeira
    </div>
  </footer>

  ${inlineFilterScript()}
`;
}

function cardHtml(t) {
  const statusCls = t.status?.replace(/\s+/g, '_') || 'open';
  const imgTag = t.image ? `<img alt="${escapeHtml(t.name)}" src="${t.image}">` : '';
  return `<article class="card"
      data-code="${t.code}"
      data-status="${t.status}"
      data-difficulty="${t.difficulty || ''}"
      data-distance-km="${t.distanceKm}"
      data-duration-min="${t.durationMin}">
    <div class="thumb">${imgTag}</div>
    <div class="content">
      <div class="title">${escapeHtml(t.name)}</div>
      <div class="meta">
        <span class="chip code">${t.code}</span>
        <span class="chip status ${statusCls}">${labelStatus(t.status)}</span>
        ${t.distance ? `<span class="chip">Distance: ${escapeHtml(t.distance)}</span>` : ''}
        ${t.duration ? `<span class="chip">Duration: ${escapeHtml(t.duration)}</span>` : ''}
        ${t.difficulty ? `<span class="chip">Difficulty: ${escapeHtml(cap(t.difficulty))}</span>` : ''}
      </div>
    </div>
    <div class="footer">
      <span>${escapeHtml(t.island || '')}</span>
      ${t.url ? `<a class="more" href="${t.url}" target="_blank" rel="noopener">Details →</a>` : '<span></span>'}
    </div>
  </article>`;
}

/* ---------------------- Styles & Client Script ---------------------- */

function headCss() {
  return `<style>
  :root { --bg:#0b1020; --fg:#eaf0ff; --muted:#91a0c6; --card:#121832; --chip:#1a2246; --open:#27c26a; --partial:#f0c419; --closed:#ff5d5d; }
  *{box-sizing:border-box}
  body{margin:0;background:linear-gradient(180deg,#0b1020,#0c1328);color:var(--fg);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial;}
  header{position:sticky;top:0;backdrop-filter:blur(6px);background:#0b1020cc;border-bottom:1px solid #222b52}
  .wrap{max-width:1200px;margin:0 auto;padding:16px 20px}
  h1{font-size:22px;margin:6px 0 2px}
  .sub{color:var(--muted);font-size:14px}
  .filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:12px}
  .filters input,.filters select{width:100%;padding:8px 10px;border-radius:10px;border:1px solid #263061;background:#0e1530;color:#eaf0ff}
  .filters .range{display:flex;gap:8px;align-items:center}
  .filters .range input{flex:1}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px;margin-top:16px}
  .card{background:var(--card);border:1px solid #1d2650;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;min-height:320px}
  .thumb{aspect-ratio:16/9;background:#0b1020 url('/data/placeholder.svg') center/cover no-repeat}
  .thumb img{width:100%;height:100%;object-fit:cover;display:block}
  .content{padding:12px 14px 14px}
  .title{font-weight:600;font-size:16px;line-height:1.3;margin:0 0 6px}
  .meta{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 0}
  .chip{font-size:12px;background:var(--chip);padding:4px 8px;border-radius:999px;border:1px solid #2a356a;color:#cfe0ff}
  .code{color:#a9b7e7}
  .status{font-weight:600}
  .open{color:var(--open)} .partially_open{color:var(--partial)} .partially_closed{color:var(--partial)} .closed{color:var(--closed)}
  .footer{margin-top:auto;padding:10px 14px;border-top:1px solid #1d2650;display:flex;justify-content:space-between;align-items:center;color:#a9b7e7;font-size:12px}
  a.more{color:#cfe0ff;text-decoration:none}
  a.more:hover{opacity:.85}
  .count{margin-top:8px;color:#c3cff9;font-size:13px}
</style>`;
}

function inlineFilterScript() {
  return `<script>
(function(){
  const grid = document.getElementById('grid');
  const cards = Array.from(grid.children);
  const q = document.getElementById('q');
  const status = document.getElementById('status');
  const difficulty = document.getElementById('difficulty');
  const dist = document.getElementById('dist'); const distv = document.getElementById('distv');
  const dur = document.getElementById('dur'); const durv = document.getElementById('durv');
  const count = document.getElementById('count');

  function val(x){ return (x||'').toLowerCase().trim(); }
  function n(x){ const v = Number(x); return isNaN(v) ? null : v; }

  function apply(){
    distv.textContent = dist.value;
    durv.textContent = dur.value;
    let shown = 0;
    const qv = val(q.value);
    cards.forEach(c => {
      const name = c.querySelector('.title').textContent.toLowerCase();
      const code = c.getAttribute('data-code').toLowerCase();
      const st = c.getAttribute('data-status');
      const dif = c.getAttribute('data-difficulty');
      const km = n(c.getAttribute('data-distance-km'));
      const min = n(c.getAttribute('data-duration-min'));
      let ok = true;
      if (qv && !(name.includes(qv) || code.includes(qv))) ok = false;
      if (ok && status.value && st !== status.value) ok = false;
      if (ok && difficulty.value && dif !== difficulty.value) ok = false;
      if (ok && n(dist.value) && km !== null && km > n(dist.value)) ok = false;
      if (ok && n(dur.value) && min !== null && min > n(dur.value)) ok = false;
      c.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    count.textContent = shown + ' trails';
  }
  [q,status,difficulty,dist,dur].forEach(el => el.addEventListener('input', apply));
  apply();
})();
</script>`;
}

/* ---------------------- Helpers ---------------------- */

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
function labelStatus(s = 'open') {
  const map = {
    open: 'Open',
    partially_open: 'Partially open',
    partially_closed: 'Partially closed',
    closed: 'Closed'
  };
  return map[s] || 'Open';
}
function cap(s) {
  return (s || '').slice(0, 1).toUpperCase() + (s || '').slice(1);
}
function escapeHtml(s) {
  return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// CLI support
if (process.argv[1]?.endsWith('build_index.js')) {
  const dataFile = path.join(process.cwd(), 'public', 'data', 'trails.json');
  buildIndex({ dataFile })
    .then(r => console.log('Index built:', r))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
