import { FO_LIST } from './fo_list.js';

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
  const close = 15 * 60 + 36;
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
  document.getElementById('status-pill-wrap').innerHTML = `
    <span class="status-pill">
      <span class="${dotClass}"></span>
      <span class="status-label">${statusText}</span>&nbsp;•&nbsp;Updated (IST): ${lastUpdated}&nbsp;•&nbsp;Next refresh in 5mins
    </span>`;
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
  renderAllTabs();
}

export function initApp() {
  setupTabs();
  setupCheckbox();
  fetchData();
  setInterval(fetchData, REFRESH_MS);
  // Status pill also depends on the clock, not just data — tick it every minute.
  setInterval(renderStatusPill, 60 * 1000);
}
