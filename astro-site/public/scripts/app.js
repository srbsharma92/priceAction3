import { FO_LIST } from './fo_list.js';
import { QUOTES } from './quotes.js';

// The Pages Function that serves the latest JSON pushed by the GitHub
// Action (see functions/api/data.js). Same-origin, so a plain path works.
const DATA_URL = '/api/data';

// Poll on the same 5-minute cadence as the old st_autorefresh call.
const REFRESH_MS = 5 * 60 * 1000;

const SECTIONS = [
  {
    tab: '5m',
    tables: [
      { key: '5m_price', sortCol: 'Price Change% in 5mins', icon: '⚡', label: 'Price Momentum in Last 5 Mins' },
      { key: '5m_vol', sortCol: 'Volume Change% in 5mins', icon: '📊', label: 'Volume Momentum in Last 5 Mins' },
    ],
  },
  {
    tab: '15m',
    tables: [
      { key: '15m_price', sortCol: 'Price Change% in 15mins', icon: '⚡', label: 'Price Momentum in Last 15 Mins' },
      { key: '15m_vol', sortCol: 'Volume Change% in 15mins', icon: '📊', label: 'Volume Momentum in Last 15 Mins' },
    ],
  },
  {
    tab: 'D',
    tables: [
      { key: 'd_price', sortCol: 'Price Change% in Day', icon: '⚡', label: 'Price Momentum for the Day' },
      { key: 'd_vol', sortCol: 'Volume Change% in Day', icon: '📊', label: 'Volume Momentum for the Day' },
    ],
  },
  {
    tab: 'open',
    tables: [
      { key: 'opening', sortCol: 'Opening Gap', icon: '🔔', label: 'Pre-Open Momentum' },
    ],
  },
];

let latestData = null;
let foFilterEnabled = true;

function isNseMarketOpen() {
  // Same window as the Python is_nse_market_open(): Mon-Fri, 09:03-15:36 IST.
  const nowUtc = new Date();
  const istMs = nowUtc.getTime() + (5 * 60 + 30) * 60 * 1000; // UTC+5:30
  const ist = new Date(istMs);
  const day = ist.getUTCDay(); // computed on the shifted clock, still 0-6
  if (day === 0 || day === 6) return false;
  const minutesNow = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const open = 9 * 60 + 3;
  const close = 15 * 60 + 39;
  return minutesNow >= open && minutesNow <= close;
}

function applyFoFilter(rows, sortCol) {
  if (!rows) return rows;
  let out = rows;
  if (foFilterEnabled) {
    out = out.filter((r) => FO_LIST.includes(r['Stock Name']));
  }
  if (sortCol && out.length && sortCol in out[0]) {
    out = [...out].sort((a, b) => (b[sortCol] ?? -Infinity) - (a[sortCol] ?? -Infinity));
  }
  return out;
}

function formatCell(col, val) {
  if (val === null || val === undefined || val === '') return '';
  if (col.includes('%') && typeof val === 'number') {
    return `${val.toFixed(2)}%`;
  }
  return String(val);
}

function momentumRowClass(row) {
  if (row.Momentum === 'Bullish') return 'momentum-bullish';
  if (row.Momentum === 'Bearish') return 'momentum-bearish';
  return '';
}

function renderTable(rows) {
  if (!rows || rows.length === 0) {
    return '<div class="empty-note">No data available.</div>';
  }
  const cols = Object.keys(rows[0]);
  const head = cols.map((c) => `<th>${c}</th>`).join('');
  const body = rows
    .map((row) => {
      const cls = momentumRowClass(row);
      const cells = cols.map((c) => `<td>${formatCell(c, row[c])}</td>`).join('');
      return `<tr class="${cls}">${cells}</tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderStatusPill() {
  const marketOpen = isNseMarketOpen();
  const dotClass = marketOpen ? 'status-dot' : 'status-dot closed';
  const statusText = marketOpen ? 'LIVE' : 'CLOSED';
  const lastUpdated = latestData?.last_updated_ist ?? 'Unknown';
  const nextRefreshHtml = marketOpen ? '&nbsp;•&nbsp;Next refresh in 5mins' : '';
  document.getElementById('status-pill-wrap').innerHTML = `
    <span class="status-pill">
      <span class="${dotClass}"></span>
      <span class="status-label">${statusText}</span>&nbsp;•&nbsp;Updated (IST): ${lastUpdated}${nextRefreshHtml}
    </span>`;
}

function pickQuote(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return QUOTES[hash % QUOTES.length];
}

function renderQuote() {
  const el = document.getElementById('quote-block');
  if (!el || !QUOTES.length) return;
  const seed = latestData?.last_updated_ist ?? String(Date.now());
  const quote = pickQuote(seed);
  el.innerHTML = `"${quote.text}" — ${quote.author}`;
}

function renderAllTabs() {
  if (!latestData) return;
  for (const section of SECTIONS) {
    const panel = document.getElementById(`panel-${section.tab}`);
    if (!panel) continue;
    let html = '';
    for (const t of section.tables) {
      const rows = applyFoFilter(latestData[t.key], t.sortCol);
      if (rows && rows.length) {
        html += `<div class="section-badge"><span class="icon">${t.icon}</span><span class="label">${t.label}</span></div>`;
        html += renderTable(rows);
      }
    }
    panel.innerHTML = html || '<div class="empty-note">No data available.</div>';
  }
}

function setupTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function setupCheckbox() {
  const checkbox = document.getElementById('fo-checkbox');
  checkbox.addEventListener('change', () => {
    foFilterEnabled = checkbox.checked;
    renderAllTabs();
  });
}

function playDing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // up to A6

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (err) {
    // Web Audio unavailable or blocked (e.g. autoplay policy) — fail silently
  }
}

function fireConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const colors = ['#c9a227', '#ffd700', '#ffffff', '#2ecc71', '#e74c3c'];
  const count = 120;
  const particles = Array.from({ length: count }, () => ({
    x: canvas.width / 2,
    y: canvas.height / 2,
    vx: (Math.random() - 0.5) * 12,
    vy: (Math.random() - 1.5) * 12,
    size: Math.random() * 6 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 20,
    gravity: 0.35,
    life: 1,
  }));

  let frame = 0;
  const maxFrames = 90;

  function animate() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.life = 1 - frame / maxFrames;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });

    if (frame < maxFrames) {
      requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  }
  requestAnimationFrame(animate);
}

function setupLuckyNumber() {
  const btn = document.getElementById('lucky-btn');
  const display = document.getElementById('lucky-number');
  if (!btn || !display) return;

  let spinning = false;

  btn.addEventListener('click', () => {
    if (spinning || btn.disabled) return; // guard against any leftover clicks
    spinning = true;
    btn.disabled = true;
    display.classList.remove('lucky-pop');

    const finalNumber = Math.floor(Math.random() * 99) + 1;
    const spinDuration = 1200;
    const intervalMs = 60;
    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      if (elapsed < spinDuration) {
        const progress = elapsed / spinDuration;
        const currentInterval = intervalMs + progress * 120;
        display.textContent = Math.floor(Math.random() * 99) + 1;
        setTimeout(() => requestAnimationFrame(tick), currentInterval);
      } else {
        display.textContent = finalNumber;
        display.classList.add('lucky-pop');
        playDing();
        fireConfetti();
        spinning = false;
        // btn stays disabled — no re-enable here, so it only resets on page refresh
      }
    }
    requestAnimationFrame(tick);
  });
}

async function fetchData() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`status ${res.status}`);
    latestData = await res.json();
  } catch (err) {
    console.error('Failed to load live data:', err);
    latestData = latestData ?? {};
  }
  renderStatusPill();
  renderQuote();
  renderAllTabs();
}

function setupAboutToggle() {
  const toggle = document.getElementById('about-toggle');
  const content = document.getElementById('about-content');
  if (!toggle || !content) return;

  toggle.addEventListener('click', () => {
    const isOpen = content.classList.toggle('open');
    toggle.textContent = isOpen ? 'Developed by Saurabh Sharma ▴' : 'Developed by Saurabh Sharma ▾';
  });
}

export function initApp() {
  setupTabs();
  setupCheckbox();
  setupLuckyNumber();
  fetchData();
  setupAboutToggle();
  setInterval(fetchData, REFRESH_MS);
  // Status pill also depends on the clock, not just data — tick it every minute.
  setInterval(renderStatusPill, 60 * 1000);
}

initApp();
