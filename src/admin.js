// Admin page: password login, usage stats and feedback. Loaded only when #/admin is opened.
import { h, fill } from './dom.js';

const EVENT_LABELS = {
  'visit': 'Visits',
  'open:world': 'World saves opened',
  'open:character': 'Character saves opened',
  'open:server': 'DedicatedServer.ini opened',
  'open:building': 'BuildingSettings.ini opened',
  'open:engine': 'Engine.ini opened',
  'download:world': 'World saves downloaded',
  'download:character': 'Character saves downloaded',
  'download:server': 'DedicatedServer.ini downloaded',
  'download:building': 'BuildingSettings.ini downloaded',
  'download:engine': 'Engine.ini downloaded',
  'template:server': 'Server template used',
  'template:building': 'Totem template used',
  'template:engine': 'Engine template used',
  'feedback:sent': 'Feedback sent',
};

let root = null;
const ui = { filter: 'new' };

async function api(path, opts = {}) {
  const res = await fetch('/api/' + path, {
    credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, data };
}

export function mount(el) {
  root = el;
  load();
}

async function load() {
  fill(root, h('p', { class: 'muted' }, 'Loading…'));
  let r;
  try { r = await api('admin/data'); } catch { return fill(root, h('p', { class: 'error' }, 'Could not reach the server.')); }
  if (r.status === 401 || r.data?.signedIn === false) return showLogin();
  if (!r.ok) return fill(root, h('p', { class: 'error' }, r.data?.error ?? 'Could not load the dashboard.'));
  showDashboard(r.data);
}

function showLogin(message) {
  const pw = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Admin password', required: true });
  const status = h('p', { class: 'error', role: 'alert' }, message ?? '');
  const form = h('form', {
    class: 'card login-card',
    onsubmit: async e => {
      e.preventDefault();
      status.textContent = '';
      const r = await api('admin/login', { method: 'POST', body: { password: pw.value } }).catch(() => ({ ok: false, data: { error: 'Could not reach the server.' } }));
      if (r.ok) load();
      else { status.textContent = r.data?.error ?? 'Login failed.'; pw.select(); }
    },
  },
  h('h2', {}, 'Admin sign in'),
  h('label', { class: 'field' }, h('span', { class: 'label' }, 'Password'), pw),
  status,
  h('div', { class: 'actions' }, h('button', { class: 'primary', type: 'submit' }, 'Sign in')));
  fill(root, form);
  pw.focus();
}

// ---------------------------------------------------------------------------

function sumSince(daily, event, fromDay) {
  return daily.filter(r => r.event === event && r.day >= fromDay).reduce((n, r) => n + r.count, 0);
}

const isoDay = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function showDashboard(data) {
  const { daily, totals, feedback } = data;
  const d0 = isoDay(0), d6 = isoDay(6), d29 = isoDay(29);
  const sumGroup = (prefix, from) => daily.filter(r => r.event.startsWith(prefix) && r.day >= from).reduce((n, r) => n + r.count, 0);
  const newCount = feedback.filter(f => f.status === 'new').length;

  const tile = (label, value, sub) => h('div', { class: 'stat-tile' }, h('span', { class: 'stat-label' }, label), h('strong', { class: 'stat-value' }, value.toLocaleString()), sub ? h('span', { class: 'stat-sub' }, sub) : null);

  fill(root,
    h('div', { class: 'admin-head' },
      h('h2', {}, 'Admin'),
      h('span', { class: 'muted' }, 'Updated ' + new Date(data.generatedAt).toLocaleString()),
      h('div', { class: 'actions' },
        h('button', { onclick: load }, 'Refresh'),
        h('button', { onclick: async () => { await api('admin/logout', { method: 'POST' }); showLogin('Signed out.'); } }, 'Sign out'))),
    h('div', { class: 'stat-row' },
      tile('Visits today', sumSince(daily, 'visit', d0), sumSince(daily, 'visit', d6).toLocaleString() + ' in 7 days'),
      tile('Visits, 30 days', sumSince(daily, 'visit', d29)),
      tile('Files opened, 30 days', sumGroup('open:', d29), sumGroup('open:', d6).toLocaleString() + ' in 7 days'),
      tile('Downloads, 30 days', sumGroup('download:', d29), sumGroup('download:', d6).toLocaleString() + ' in 7 days'),
      tile('New feedback', newCount, feedback.length + ' total')),
    visitsChart(daily),
    usageTable(daily, totals),
    feedbackList(feedback),
  );
}

// Single series, so no legend: the title names it. Bars rise from the baseline with rounded tops.
function visitsChart(daily) {
  const days = Array.from({ length: 30 }, (_, i) => isoDay(29 - i));
  const counts = days.map(d => daily.filter(r => r.day === d && r.event === 'visit').reduce((n, r) => n + r.count, 0));
  const max = Math.max(1, ...counts);
  const W = 720, H = 180, padL = 36, padB = 22, padT = 8;
  const plotW = W - padL, plotH = H - padB - padT;
  const slot = plotW / days.length;
  const barW = Math.max(4, slot - 4);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'bar-chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Visits per day for the last 30 days. Peak ' + max + '.');
  const el = (tag, attrs) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

  // Recessive gridlines at 0, half and max.
  for (const f of [0, 0.5, 1]) {
    const y = padT + plotH - f * plotH;
    svg.append(el('line', { x1: padL, x2: W, y1: y, y2: y, class: 'grid' }));
    const t = el('text', { x: padL - 6, y: y + 4, class: 'axis', 'text-anchor': 'end' });
    t.textContent = Math.round(f * max);
    svg.append(t);
  }
  const tip = h('div', { class: 'chart-tip', hidden: true });
  counts.forEach((c, i) => {
    const x = padL + i * slot + (slot - barW) / 2;
    const bh = (c / max) * plotH;
    const y = padT + plotH - bh;
    const r = Math.min(4, bh / 2, barW / 2);
    // Rounded top corners only; square at the baseline.
    const d = bh <= 0 ? '' : `M${x},${padT + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${padT + plotH} Z`;
    if (d) svg.append(el('path', { d, class: 'bar' }));
    // Hit target covers the whole column so small bars are easy to hover.
    const hit = el('rect', { x: padL + i * slot, y: padT, width: slot, height: plotH, class: 'hit', tabindex: 0 });
    const show = () => {
      tip.hidden = false;
      tip.textContent = new Date(days[i] + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) + ': ' + c.toLocaleString() + ' visit' + (c === 1 ? '' : 's');
      const box = svg.getBoundingClientRect();
      tip.style.left = ((padL + i * slot + slot / 2) / W) * box.width + 'px';
      // Keep the tooltip inside the chart near the edges.
      tip.dataset.edge = i < 3 ? 'start' : i > days.length - 4 ? 'end' : '';
    };
    hit.addEventListener('mouseenter', show);
    hit.addEventListener('focus', show);
    hit.addEventListener('mouseleave', () => { tip.hidden = true; });
    hit.addEventListener('blur', () => { tip.hidden = true; });
    svg.append(hit);
    // Label today and every 7th day before it, so labels never collide.
    if ((days.length - 1 - i) % 7 === 0) {
      const last = i === days.length - 1;
      const t = el('text', { x: last ? W - 2 : padL + i * slot + slot / 2, y: H - 6, class: 'axis', 'text-anchor': last ? 'end' : 'middle' });
      t.textContent = days[i].slice(5).replace('-', '/');
      svg.append(t);
    }
  });
  return h('section', { class: 'card chart-card' },
    h('h3', {}, 'Visits per day, last 30 days'),
    h('div', { class: 'chart-wrap' }, svg, tip));
}

// Table view of every event: the accessible companion to the chart and tiles.
function usageTable(daily, totals) {
  const d0 = isoDay(0), d6 = isoDay(6), d29 = isoDay(29);
  const all = Object.fromEntries(totals.map(t => [t.event, t.count]));
  const events = Object.keys(EVENT_LABELS).filter(e => all[e]);
  return h('section', { class: 'card' },
    h('h3', {}, 'Usage'),
    events.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'slots usage-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Event'), h('th', {}, 'Today'), h('th', {}, '7 days'), h('th', {}, '30 days'), h('th', {}, 'All time'))),
      h('tbody', {}, events.map(e => h('tr', {},
        h('td', {}, EVENT_LABELS[e]),
        [d0, d6, d29].map(from => h('td', { class: 'num' }, sumSince(daily, e, from).toLocaleString())),
        h('td', { class: 'num' }, (all[e] ?? 0).toLocaleString())))))) : h('p', { class: 'muted' }, 'No usage recorded yet.'),
    h('p', { class: 'hint' }, 'Counts are anonymous daily totals (UTC). Visitors with Do Not Track or Global Privacy Control are not counted.'));
}

function feedbackList(items) {
  const listEl = h('div', { class: 'feedback-list' });
  const draw = () => {
    const shown = items.filter(f => ui.filter === 'all' || f.status === ui.filter);
    fill(listEl, shown.length ? shown.map(f => h('article', { class: 'feedback-item' + (f.status === 'done' ? ' done' : '') },
      h('div', { class: 'feedback-meta' },
        h('span', { class: 'tag' }, f.kind),
        h('span', {}, new Date(f.created_at).toLocaleString()),
        f.page ? h('span', { class: 'muted' }, 'from ' + f.page) : null,
        f.status === 'done' ? h('span', { class: 'tag' }, 'done') : null),
      h('p', { class: 'feedback-text' }, f.message),
      f.contact ? h('p', { class: 'muted' }, 'Contact: ', f.contact) : null,
      h('div', { class: 'actions' },
        h('button', {
          onclick: async () => {
            const status = f.status === 'done' ? 'new' : 'done';
            const r = await api('admin/feedback', { method: 'PATCH', body: { id: f.id, status } });
            if (r.status === 401) return showLogin('Your session ended. Sign in again.');
            if (r.ok) { f.status = status; draw(); }
          },
        }, f.status === 'done' ? 'Reopen' : 'Mark done'),
        h('button', {
          class: 'danger',
          onclick: async () => {
            if (!confirm('Delete this feedback permanently?')) return;
            const r = await api('admin/feedback', { method: 'DELETE', body: { id: f.id } });
            if (r.status === 401) return showLogin('Your session ended. Sign in again.');
            if (r.ok) { items.splice(items.indexOf(f), 1); draw(); }
          },
        }, 'Delete')))) : h('p', { class: 'muted' }, 'Nothing here.'));
  };
  draw();
  return h('section', { class: 'card' },
    h('div', { class: 'admin-head' }, h('h3', {}, 'Feedback'),
      h('div', { class: 'seg' }, [['new', 'New'], ['done', 'Done'], ['all', 'All']].map(([k, label]) => h('button', {
        'aria-pressed': String(ui.filter === k),
        onclick: e => { ui.filter = k; e.target.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.target))); draw(); },
      }, label, ' (' + items.filter(f => k === 'all' || f.status === k).length + ')')))),
    listEl);
}
