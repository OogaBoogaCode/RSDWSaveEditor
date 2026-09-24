// UI for the Dragonwilds save editor. Everything runs in the browser; files are
// read into memory, edited, and handed back as a download. Nothing is uploaded or stored.
import { parseSave, writeSave } from './spud.js';
import { WorldSave, typeName, isEditableType, shortClass } from './model.js';
import { parse as parseJson, stringify as stringifyJson, num, keysOf } from './uejson.js';
import { slots, putItem, removeItem, cloneItem, firstFreeSlot, itemCatalog } from './inventory.js';
import { DIFFICULTY_TAGS, DIFFICULTY_MODES } from './data.js';

const $ = sel => document.querySelector(sel);

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// replaceChildren would render null/false as text
const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter(k => k !== null && k !== undefined && k !== false));

const state = { kind: null, fileName: '', original: null, world: null, char: null, tab: null, dirty: 0, bom: false };
let blobCache = null;

function toast(msg, kind = 'info') {
  const box = $('#toasts');
  while (box.children.length >= 3) box.firstChild.remove();
  const t = h('div', { class: 'toast ' + kind, role: kind === 'error' ? 'alert' : 'status' }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.classList.add('out'), 3800);
  setTimeout(() => t.remove(), 4400);
}

function changed(msg) {
  state.dirty++;
  blobCache = null;
  updateBar();
  if (msg) toast(msg, 'ok');
}

function guard(fn) {
  return (...args) => {
    try { return fn(...args); } catch (e) { console.error(e); toast(e.message || String(e), 'error'); }
  };
}

const fmtBytes = n => (n > 1048576 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1024).toFixed(1) + ' KB');
const fmtNum = v => (typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(6) : String(v));

// ---------------------------------------------------------------------------
// Loading

async function loadFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  state.fileName = file.name;
  state.original = buf;
  state.dirty = 0;
  blobCache = null;
  state.world = state.char = null;
  if (buf.length >= 4 && String.fromCharCode(...buf.subarray(0, 4)) === 'SAVE') {
    state.world = new WorldSave(parseSave(buf));
    state.kind = 'world';
    state.tab = 'world';
  } else {
    let text = new TextDecoder('utf-8').decode(buf);
    state.bom = text.charCodeAt(0) === 0xfeff;
    if (state.bom) text = text.slice(1);
    if (!text.trimStart().startsWith('{')) {
      throw new Error('This is not a Dragonwilds world (.sav) or character (.json) save.');
    }
    const json = parseJson(text);
    if (!json.meta_data && !json.GameProgress && !json.Skills) throw new Error('This JSON file does not look like a Dragonwilds character save.');
    state.char = { json, root: json.GameProgress ?? json };
    state.kind = 'character';
    state.tab = 'character';
  }
  $('#landing').hidden = true;
  $('#editor').hidden = false;
  render();
  toast('Loaded ' + file.name, 'ok');
}

function buildOutput() {
  if (state.kind === 'world') return writeSave(state.world.root);
  const text = (state.bom ? '﻿' : '') + stringifyJson(state.char.json);
  return new TextEncoder().encode(text);
}

function download() {
  const bytes = buildOutput();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = h('a', { href: url, download: state.fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Downloaded ' + state.fileName + ' (' + fmtBytes(bytes.length) + ')', 'ok');
}

function reset() {
  if (state.dirty && !confirm('Discard your unsaved edits?')) return;
  Object.assign(state, { kind: null, world: null, char: null, original: null, dirty: 0 });
  $('#editor').hidden = true;
  $('#landing').hidden = false;
  $('#file').value = '';
}

// ---------------------------------------------------------------------------
// Layout

const WORLD_TABS = [
  ['world', 'World'],
  ['difficulty', 'Difficulty'],
  ['storage', 'Storage'],
  ['data', 'Stations & Data'],
  ['advanced', 'Advanced'],
];
const CHAR_TABS = [
  ['character', 'Character'],
  ['skills', 'Skills'],
  ['inventory', 'Inventory'],
  ['raw', 'Raw JSON'],
];

function updateBar() {
  $('#file-name').textContent = state.fileName;
  $('#file-meta').textContent = (state.kind === 'world' ? 'World save' : 'Character save') + ' · ' + fmtBytes(state.original.length);
  $('#dirty').textContent = state.dirty ? state.dirty + ' change' + (state.dirty === 1 ? '' : 's') + ' not yet downloaded' : 'No changes yet';
  $('#dirty').classList.toggle('has', !!state.dirty);
}

function render() {
  updateBar();
  const tabs = state.kind === 'world' ? WORLD_TABS : CHAR_TABS;
  const nav = $('#tabs');
  nav.replaceChildren(...tabs.map(([id, label]) =>
    h('button', { role: 'tab', 'aria-selected': String(state.tab === id), class: 'tab', onclick: () => { state.tab = id; render(); } }, label)));
  const panel = $('#panel');
  panel.replaceChildren();
  const views = {
    world: viewWorld, difficulty: viewDifficulty, storage: viewStorage, data: viewData, advanced: viewAdvanced,
    character: viewCharacter, skills: viewSkills, inventory: viewCharInventory, raw: viewRaw,
  };
  try {
    panel.append(views[state.tab]());
  } catch (e) {
    console.error(e);
    panel.append(h('p', { class: 'error' }, 'Could not display this section: ' + e.message));
  }
}

function card(title, sub, ...body) {
  return h('section', { class: 'card' }, h('h2', {}, title), sub ? h('p', { class: 'sub' }, sub) : null, ...body);
}

function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'label' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
}

function numberInput(value, onCommit, attrs = {}) {
  return h('input', {
    type: 'number', step: 'any', value: fmtNum(value), ...attrs,
    onchange: guard(e => {
      const v = Number(e.target.value);
      if (e.target.value === '' || !Number.isFinite(v)) { toast('Enter a number', 'error'); return; }
      onCommit(v);
    }),
  });
}

function textInput(value, onCommit, attrs = {}) {
  return h('input', { type: 'text', value, ...attrs, onchange: guard(e => onCommit(e.target.value)) });
}

// ---------------------------------------------------------------------------
// World: settings

function viewWorld() {
  const w = state.world;
  const hv = n => w.headerValue(n);
  const time = w.findObject(o => o.shortClass === 'BP_InGameTimeActor');
  const timePath = time && w.pathOf(time, 'StoredTime');
  const mode = hv('SurvivalDifficulty');

  const setBoth = (header, setting, value, settingValue = value) => {
    w.setHeaderValue(header, value);
    if (setting) w.setSetting(setting, settingValue);
  };

  return h('div', { class: 'stack' },
    card('World settings', 'Stored twice in the file (load-screen header and world state). The editor keeps both copies in sync.',
      h('div', { class: 'grid' },
        field('World name', textInput(hv('WorldName') ?? '', guard(v => {
          if (!v.trim()) throw new Error('World name cannot be empty');
          setBoth('WorldName', 'WorldName', v);
          changed('World renamed');
        })), 'Display name only. The file name stays the same.'),
        field('Difficulty mode', h('select', {
          onchange: guard(e => { const v = Number(e.target.value); setBoth('SurvivalDifficulty', 'SurvivalDifficulty', v); changed('Difficulty mode updated'); render(); }),
        }, ...modeOptions(mode)), 'Custom mode makes the game read the values on the Difficulty tab.'),
        field('Friendly fire', h('input', {
          type: 'checkbox', checked: !!hv('FriendlyFire'),
          onchange: guard(e => {
            const on = e.target.checked ? 1 : 0;
            setBoth('FriendlyFire', 'bFriendlyFire', on);
            const d = w.difficulty();
            const tag = d.find(x => x.tag === 'Difficulty.Environment.FriendlyFire');
            if (tag) { tag.value = on; w.setDifficulty(d); }
            changed('Friendly fire ' + (on ? 'enabled' : 'disabled'));
          }),
        })),
        field('Session password', textInput(hv('SessionPasswd') ?? '', guard(v => { w.setHeaderValue('SessionPasswd', v); changed('Password updated'); }), { autocomplete: 'off' }), 'Leave empty for no password.'),
        field('Crossplay', h('input', {
          type: 'checkbox', checked: !!hv('CrossplayEnabled'),
          onchange: guard(e => { w.setHeaderValue('CrossplayEnabled', e.target.checked ? 1 : 0); changed('Crossplay updated'); }),
        })),
        time && timePath ? field('In-game clock', numberInput(w.propAt(time, timePath).value, guard(v => {
          w.setProperty(time, timePath, v); changed('Clock updated');
        })), 'Stored time value of the world clock.') : null,
      )),
    card('About this world', null,
      h('dl', { class: 'facts' },
        fact('Owner', hv('WorldNameOwner')),
        fact('Saved at', w.headerTimestamp ?? ''),
        fact('Save revision', hv('Meta_SaveFileRevision')),
        fact('Hardcore state', hv('HardcoreState')),
        fact('Areas stored', w.containers.length - 1),
        fact('Objects stored', w.allObjects().length.toLocaleString()),
      )),
  );
}

function fact(k, v) {
  return [h('dt', {}, k), h('dd', {}, v === undefined || v === '' ? '—' : String(v))];
}

function modeOptions(current) {
  const opts = Object.entries(DIFFICULTY_MODES).map(([v, label]) => h('option', { value: v, selected: Number(v) === current }, label));
  if (!(current in DIFFICULTY_MODES)) opts.push(h('option', { value: current, selected: true }, 'Other (' + current + ')'));
  return opts;
}

// ---------------------------------------------------------------------------
// World: difficulty

function viewDifficulty() {
  const w = state.world;
  const current = new Map(w.difficulty().map(d => [d.tag, d.value]));
  const known = [...DIFFICULTY_TAGS];
  for (const tag of current.keys()) if (!known.some(k => k.tag === tag)) known.push({ tag, group: 'Other', kind: 'scale', def: 1 });

  const draft = new Map(current);
  const mode = w.headerValue('SurvivalDifficulty');

  const groups = [...new Set(known.map(k => k.group))];
  const table = h('div', { class: 'diff-groups' }, groups.map(g =>
    h('fieldset', { class: 'diff-group' }, h('legend', {}, g),
      known.filter(k => k.group === g).map(k => {
        const on = draft.has(k.tag);
        const val = on ? draft.get(k.tag) : k.def;
        const valueEl = k.kind === 'bool'
          ? h('input', { type: 'checkbox', checked: val >= 0.5, disabled: !on, onchange: e => draft.set(k.tag, e.target.checked ? 1 : 0) })
          : h('input', { type: 'number', step: '0.05', min: '0', value: fmtNum(val), disabled: !on, onchange: e => draft.set(k.tag, Number(e.target.value)) });
        const toggle = h('input', {
          type: 'checkbox', checked: on, 'aria-label': 'Override ' + k.tag,
          onchange: e => {
            if (e.target.checked) draft.set(k.tag, k.kind === 'bool' ? (valueEl.checked ? 1 : 0) : Number(valueEl.value));
            else draft.delete(k.tag);
            valueEl.disabled = !e.target.checked;
          },
        });
        return h('div', { class: 'diff-row' + (on ? ' on' : '') }, toggle, h('span', { class: 'diff-name', title: k.tag }, k.label ?? prettyTag(k.tag)), valueEl);
      }))));

  const switchMode = h('input', { type: 'checkbox', checked: mode !== 3 });
  return h('div', { class: 'stack' },
    card('Custom difficulty', 'Tick a setting to override it. Scales: 1 = normal, 0.5 = half, 2 = double. Unticked settings use the game default.',
      mode !== 3 ? h('p', { class: 'note' }, 'This world is not in Custom mode, so the game may ignore these values. ', h('label', { class: 'inline' }, switchMode, ' Switch the world to Custom when applying')) : null,
      table,
      h('div', { class: 'actions' },
        h('button', {
          class: 'primary',
          onclick: guard(() => {
            const list = known.filter(k => draft.has(k.tag)).map(k => ({ tag: k.tag, value: draft.get(k.tag) }));
            for (const d of list) if (!Number.isFinite(d.value) || d.value < 0) throw new Error(prettyTag(d.tag) + ' needs a number of 0 or more');
            w.setDifficulty(list);
            if (mode !== 3 && switchMode.checked && list.length) {
              w.setHeaderValue('SurvivalDifficulty', 3);
              w.setSetting('SurvivalDifficulty', 3);
            }
            changed('Difficulty applied (' + list.length + ' settings)');
            render();
          }),
        }, 'Apply difficulty'),
        h('button', { onclick: () => render() }, 'Revert'),
      )),
  );
}

function prettyTag(tag) {
  return tag.replace(/^Difficulty\./, '').split('.').map(s => s.replace(/([a-z])([A-Z])/g, '$1 $2')).join(' › ');
}

// ---------------------------------------------------------------------------
// World: storage

function worldBlobs() {
  if (!blobCache) blobCache = state.world.jsonBlobs();
  return blobCache;
}

function blobLabel(b) {
  const cls = b.obj.shortClass.replace(/^BP_/, '').replace(/_/g, ' ');
  return cls;
}

function areaLabel(name) {
  const m = /X(\d+)_Y(\d+)/.exec(name);
  return m ? 'Cell ' + m[1] + ',' + m[2] : name === 'L_World' ? 'World' : name;
}

const storageUi = { filter: '', hideEmpty: true, open: null };

function viewStorage() {
  const w = state.world;
  const invs = worldBlobs().filter(b => b.text.includes('"MaxSlotIndex"')).map(b => {
    let json = null;
    try { json = parseJson(b.text); } catch { /* shown as broken */ }
    return { ...b, json, count: json ? slots(json).length : 0 };
  });
  const catalog = itemCatalog(invs.filter(i => i.json).map(i => i.json));

  const list = h('div', { class: 'inv-list' });
  const detail = h('div', { class: 'inv-detail' });

  const draw = () => {
    const q = storageUi.filter.toLowerCase();
    const shown = invs.filter(i => (!storageUi.hideEmpty || i.count) &&
      (!q || (blobLabel(i) + ' ' + i.obj.container + ' ' + i.component + ' ' + i.text).toLowerCase().includes(q)));
    fill(list, 
      h('p', { class: 'muted' }, shown.length + ' of ' + invs.length + ' containers'),
      ...shown.slice(0, 400).map(i => h('button', {
        class: 'inv-item' + (storageUi.open === i.obj.key + i.path ? ' active' : ''),
        onclick: () => { storageUi.open = i.obj.key + i.path; draw(); },
      }, h('strong', {}, blobLabel(i)), h('span', {}, areaLabel(i.obj.container) + ' · ' + i.count + ' item' + (i.count === 1 ? '' : 's')))),
      shown.length > 400 ? h('p', { class: 'muted' }, 'Refine the search to see more.') : null,
    );
    const open = invs.find(i => i.obj.key + i.path === storageUi.open);
    fill(detail, open
      ? inventoryEditor(open.json, {
        title: blobLabel(open),
        subtitle: areaLabel(open.obj.container) + ' · ' + (open.component || open.name),
        catalog,
        commit: msg => { w.setProperty(open.obj, open.path, stringifyJson(open.json)); open.text = stringifyJson(open.json); open.count = slots(open.json).length; changed(msg); draw(); },
      })
      : h('div', { class: 'empty' }, h('p', {}, 'Pick a chest, crate or station on the left to edit what is inside.')));
  };

  const search = h('input', { type: 'search', placeholder: 'Search containers or item IDs', value: storageUi.filter, oninput: e => { storageUi.filter = e.target.value; draw(); } });
  const hide = h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: storageUi.hideEmpty, onchange: e => { storageUi.hideEmpty = e.target.checked; draw(); } }), ' Hide empty');
  draw();
  return h('div', { class: 'stack' },
    card('Storage', 'Chests, crates and other containers placed in this world. Item types are shown by their in-game ID.',
      h('div', { class: 'toolbar' }, search, hide),
      h('div', { class: 'split' }, list, detail)));
}

// Generic inventory editor used for world containers and character bags.
function inventoryEditor(inv, { title, subtitle, catalog, commit }) {
  if (!inv) return h('p', { class: 'error' }, 'This inventory could not be read.');
  const rows = slots(inv);
  const fieldsSeen = new Set();
  rows.forEach(r => keysOf(r.item).forEach(k => { if (k !== 'GUID' && k !== 'ItemData') fieldsSeen.add(k); }));
  const numFields = [...fieldsSeen].filter(f => rows.some(r => typeof num(r.item[f]) === 'number'));

  const table = h('table', { class: 'slots' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Slot'), h('th', {}, 'Item ID'), ...numFields.map(f => h('th', {}, f)), h('th', {}, ''))),
    h('tbody', {}, rows.length ? rows.map(({ slot, item }) => h('tr', {},
      h('td', { class: 'mono' }, slot),
      h('td', { class: 'mono id', title: item.ItemData }, item.ItemData ?? '—'),
      ...numFields.map(f => h('td', {}, typeof num(item[f]) === 'number'
        ? numberInput(num(item[f]), guard(v => { item[f] = Math.round(v) === v ? v : v; commit(f + ' updated in slot ' + slot); }), { class: 'small', min: '0' })
        : h('span', { class: 'muted' }, '—'))),
      h('td', {}, h('div', { class: 'row-actions' },
        h('button', { title: 'Duplicate into the first free slot', onclick: guard(() => { const s = firstFreeSlot(inv); putItem(inv, s, cloneItem(item)); commit('Duplicated into slot ' + s); }) }, 'Duplicate'),
        h('button', { class: 'danger', onclick: guard(() => { removeItem(inv, slot); commit('Removed slot ' + slot); }) }, 'Remove'))),
    )) : h('tr', {}, h('td', { colspan: 3 + numFields.length, class: 'muted' }, 'Empty'))));

  const countField = numFields.includes('Count');
  const bulk = countField ? h('div', { class: 'inline-form' },
    h('span', {}, 'Set every stack count to'),
    (() => {
      const inp = h('input', { type: 'number', min: '1', value: '100', class: 'small' });
      return [inp, h('button', {
        onclick: guard(() => {
          const v = Math.floor(Number(inp.value));
          if (!(v >= 1)) throw new Error('Enter a count of 1 or more');
          let n = 0;
          for (const r of rows) if ('Count' in r.item) { r.item.Count = v; n++; }
          commit(n + ' stacks set to ' + v);
        }),
      }, 'Apply')];
    })()) : null;

  let add = null;
  if (catalog && catalog.size) {
    const sel = h('select', {}, [...catalog.keys()].sort().map(id => h('option', { value: id }, id)));
    const slotIn = h('input', { type: 'number', min: '0', value: String(firstFreeSlot(inv)), class: 'small', 'aria-label': 'Slot' });
    add = h('div', { class: 'inline-form' },
      h('span', {}, 'Add item'), sel, h('span', {}, 'to slot'), slotIn,
      h('button', {
        onclick: guard(() => {
          const s = Math.floor(Number(slotIn.value));
          if (!(s >= 0)) throw new Error('Slot must be 0 or more');
          if (String(s) in inv && !confirm('Slot ' + s + ' is occupied. Replace it?')) return;
          putItem(inv, s, cloneItem(catalog.get(sel.value)));
          commit('Added item to slot ' + s);
        }),
      }, 'Add'));
  }

  return h('div', { class: 'inv-editor' },
    h('h3', {}, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null,
    h('div', { class: 'table-wrap' }, table),
    bulk, add,
    h('p', { class: 'hint' }, 'New items copy the stats of an existing item of the same type and get a fresh unique ID. Only items already present in this file can be added.'),
  );
}

// ---------------------------------------------------------------------------
// World: other embedded JSON (processing stations, weather, events)

const dataUi = { open: null, filter: '' };

function viewData() {
  const w = state.world;
  const blobs = worldBlobs().filter(b => !b.text.includes('"MaxSlotIndex"'));
  const list = h('div', { class: 'inv-list' });
  const detail = h('div', { class: 'inv-detail' });
  const draw = () => {
    const q = dataUi.filter.toLowerCase();
    const shown = blobs.filter(b => !q || (blobLabel(b) + ' ' + b.name + ' ' + b.text).toLowerCase().includes(q));
    fill(list, h('p', { class: 'muted' }, shown.length + ' entries'),
      ...shown.slice(0, 400).map(b => h('button', {
        class: 'inv-item' + (dataUi.open === b.obj.key + b.path ? ' active' : ''),
        onclick: () => { dataUi.open = b.obj.key + b.path; draw(); },
      }, h('strong', {}, blobLabel(b)), h('span', {}, areaLabel(b.obj.container) + ' · ' + (b.component || b.name)))));
    const open = blobs.find(b => b.obj.key + b.path === dataUi.open);
    fill(detail, open ? jsonEditor(open.text, text => {
      w.setProperty(open.obj, open.path, text);
      open.text = text;
      changed('Saved ' + blobLabel(open));
    }) : h('div', { class: 'empty' }, h('p', {}, 'Pick an entry to edit its data.')));
  };
  draw();
  return card('Stations & data', 'Processing stations, weather and world events keep their state as JSON. Edit carefully; keep the structure intact.',
    h('div', { class: 'toolbar' }, h('input', { type: 'search', placeholder: 'Search', value: dataUi.filter, oninput: e => { dataUi.filter = e.target.value; draw(); } })),
    h('div', { class: 'split' }, list, detail));
}

function jsonEditor(text, save) {
  const ta = h('textarea', { class: 'code', spellcheck: 'false', rows: 18 });
  ta.value = text.replace(/\r\n/g, '\n');
  const status = h('span', { class: 'hint' });
  return h('div', { class: 'json-editor' }, ta, h('div', { class: 'actions' },
    h('button', {
      class: 'primary',
      onclick: guard(() => {
        let parsed;
        try { parsed = parseJson(ta.value); } catch (e) { status.textContent = 'Invalid JSON: ' + e.message; return; }
        const out = stringifyJson(parsed);
        save(out);
        ta.value = out.replace(/\r\n/g, '\n');
        status.textContent = 'Saved.';
      }),
    }, 'Save JSON'), status));
}

// ---------------------------------------------------------------------------
// World: advanced object browser

const advUi = { filter: '', open: null };

function viewAdvanced() {
  const w = state.world;
  const objects = w.allObjects();
  const list = h('div', { class: 'inv-list' });
  const detail = h('div', { class: 'inv-detail' });
  const draw = () => {
    const q = advUi.filter.toLowerCase();
    const shown = q ? objects.filter(o => (o.className + ' ' + o.name + ' ' + o.container).toLowerCase().includes(q)) : objects;
    fill(list, h('p', { class: 'muted' }, shown.length.toLocaleString() + ' objects'),
      ...shown.slice(0, 300).map(o => h('button', {
        class: 'inv-item' + (advUi.open === o.key ? ' active' : ''),
        onclick: () => { advUi.open = o.key; draw(); },
      }, h('strong', {}, o.shortClass), h('span', {}, areaLabel(o.container) + (o.spawned ? ' · placed' : '')))),
      shown.length > 300 ? h('p', { class: 'muted' }, 'Showing the first 300. Search to narrow down.') : null);
    const obj = objects.find(o => o.key === advUi.open);
    fill(detail, obj ? objectEditor(obj, draw) : h('div', { class: 'empty' }, h('p', {}, 'Every saved object in the world, with its raw properties.')));
  };
  draw();
  return card('Advanced', 'Direct access to every stored property. Values the editor cannot decode safely are shown read-only.',
    h('div', { class: 'toolbar' }, h('input', { type: 'search', placeholder: 'Search by class, name or area', value: advUi.filter, oninput: e => { advUi.filter = e.target.value; draw(); } })),
    h('div', { class: 'split' }, list, detail));
}

function objectEditor(obj, redraw) {
  const w = state.world;
  const { props, valid } = w.properties(obj);
  const renderProps = (list, path) => h('ul', { class: 'props' }, list.map((p, i) => {
    const here = [...path, i];
    const head = h('span', { class: 'prop-name', title: p.path }, p.path);
    const type = h('span', { class: 'prop-type' }, p.kind === 'component' ? shortClass(p.className) : typeName(p.type));
    if (p.kind === 'component') {
      return h('li', {}, h('details', {}, h('summary', {}, head, ' ', type), p.children?.length ? renderProps(p.children, here) : h('p', { class: 'muted' }, p.valid === false ? 'Not decodable' : 'No properties')));
    }
    let control;
    if (p.kind === 'value' && p.json) {
      control = h('details', {}, h('summary', {}, 'JSON (' + p.value.length + ' chars)'), jsonEditor(p.value, text => { w.setProperty(obj, here, text); changed('Property saved'); }));
    } else if (valid && p.kind === 'value' && isEditableType(p.type) && !Array.isArray(p.value)) {
      const t = p.type;
      if (t === 30 || t === 31 || t === 23) control = textInput(p.value, guard(v => { w.setProperty(obj, here, v); changed(p.name + ' updated'); redraw(); }));
      else control = numberInput(typeof p.value === 'bigint' ? p.value.toString() : p.value, guard(v => {
        if (t <= 7 && !Number.isInteger(v)) throw new Error('Whole numbers only');
        w.setProperty(obj, here, t === 3 || t === 7 ? BigInt(Math.trunc(v)) : v); changed(p.name + ' updated'); redraw();
      }));
    } else if (valid && (p.kind === 'value' || p.kind === 'array') && Array.isArray(p.value) && isEditableType(p.type)) {
      control = textInput(JSON.stringify(p.value), guard(v => {
        const arr = JSON.parse(v);
        if (!Array.isArray(arr)) throw new Error('Expected a JSON array');
        w.setProperty(obj, here, arr); changed(p.name + ' updated'); redraw();
      }));
    } else {
      control = h('span', { class: 'muted' }, p.kind === 'unknown' ? 'unreadable' : (p.size ?? 0) + ' bytes (read-only)');
    }
    return h('li', {}, head, ' ', type, h('div', { class: 'prop-value' }, control));
  }));
  return h('div', { class: 'obj-editor' },
    h('h3', {}, obj.shortClass), h('p', { class: 'muted mono wrap' }, obj.name),
    h('p', { class: 'muted mono wrap' }, obj.className),
    valid ? null : h('p', { class: 'note' }, 'This object was stored with an older layout. It is shown read-only to avoid corrupting it.'),
    props.length ? renderProps(props, []) : h('p', { class: 'muted' }, 'No stored properties.'));
}

// ---------------------------------------------------------------------------
// Character

function charPath(...keys) {
  let o = state.char.root;
  for (const k of keys) { if (o == null) return undefined; o = o[k]; }
  return o;
}

function viewCharacter() {
  const j = state.char.json;
  const r = state.char.root;
  const c = r.Character ?? {};
  const vital = (label, obj, key) => obj && key in obj
    ? field(label, numberInput(num(obj[key]), guard(v => { obj[key] = v; changed(label + ' updated'); }), { min: '0' }))
    : null;
  return h('div', { class: 'stack' },
    card('Character', null,
      h('div', { class: 'grid' },
        j.meta_data ? field('Name', textInput(j.meta_data.char_name ?? '', guard(v => {
          if (!v.trim()) throw new Error('Name cannot be empty');
          j.meta_data.char_name = v; changed('Name updated');
        })), 'Display name. The file name stays the same.') : null,
        j.Hardcore || r.Hardcore ? field('Hardcore', h('input', {
          type: 'checkbox', checked: !!(j.Hardcore ?? r.Hardcore).IsHardcore,
          onchange: e => { (j.Hardcore ?? r.Hardcore).IsHardcore = e.target.checked; changed('Hardcore ' + (e.target.checked ? 'on' : 'off')); },
        })) : null,
        vital('Health', c.Health, 'CurrentValue'),
        vital('Stamina', c.Stamina, 'CurrentValue'),
        vital('Special charge', c.SpecialCharge, 'CurrentValue'),
        vital('Sustenance', c.Sustenance, 'SustenanceValue'),
        vital('Hydration', c.Hydration, 'HydrationValue'),
        vital('Endurance', c.Endurance, 'EnduranceValue'),
      )),
    card('About this character', null, h('dl', { class: 'facts' },
      fact('Save count', num(j.SaveCount)),
      fact('Play time', c.Playtime_wall ? Math.round(num(c.Playtime_wall) / 3600) + ' h' : ''),
      fact('Worlds visited', j.meta_data?.worlds_playtime ? Object.keys(j.meta_data.worlds_playtime).length : ''),
      fact('Recipes unlocked', r.Progress?.RecipesUnlocked?.length),
      fact('Buildings unlocked', r.Progress?.BuildingsUnlocked?.length),
    )),
  );
}

function viewSkills() {
  const skills = charPath('Skills', 'Skills');
  if (!Array.isArray(skills)) return card('Skills', 'No skills found in this save.');
  const all = h('input', { type: 'number', min: '0', value: '', placeholder: 'XP', class: 'small' });
  return card('Skills', 'Skills are stored by internal ID with their total XP. Levels are worked out by the game from XP.',
    h('div', { class: 'table-wrap' }, h('table', { class: 'slots' },
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Skill ID'), h('th', {}, 'XP'))),
      h('tbody', {}, skills.map((s, i) => h('tr', {},
        h('td', {}, i + 1), h('td', { class: 'mono id' }, s.Id),
        h('td', {}, numberInput(num(s.Xp), guard(v => {
          if (v < 0 || !Number.isInteger(v)) throw new Error('XP must be a whole number, 0 or more');
          s.Xp = v; changed('XP updated');
        }), { min: '0', step: '1' }))))))),
    h('div', { class: 'inline-form' }, h('span', {}, 'Set every skill to'), all, h('span', {}, 'XP'),
      h('button', {
        onclick: guard(() => {
          const v = Math.floor(Number(all.value));
          if (!(v >= 0)) throw new Error('Enter an XP value');
          skills.forEach(s => { s.Xp = v; });
          changed('All skills set to ' + v.toLocaleString() + ' XP');
          render();
        }),
      }, 'Apply')));
}

const charInvUi = { which: 'Inventory' };

function viewCharInventory() {
  const r = state.char.root;
  const bags = ['Inventory', 'PersonalInventory', 'Loadout'].filter(k => r[k] && typeof r[k] === 'object');
  if (!bags.length) return card('Inventory', 'No inventory found in this save.');
  if (!bags.includes(charInvUi.which)) charInvUi.which = bags[0];
  const labels = { Inventory: 'Backpack', PersonalInventory: 'Personal storage', Loadout: 'Equipped' };
  const catalog = itemCatalog(bags.map(b => r[b]));
  return h('div', { class: 'stack' },
    h('div', { class: 'seg' }, bags.map(b => h('button', {
      'aria-pressed': String(charInvUi.which === b), onclick: () => { charInvUi.which = b; render(); },
    }, labels[b] ?? b, ' (' + slots(r[b]).length + ')'))),
    card(labels[charInvUi.which] ?? charInvUi.which, charInvUi.which === 'Loadout' ? 'Some equipped slots point at backpack slots, so move or remove equipped items with care.' : null,
      inventoryEditor(r[charInvUi.which], { title: '', catalog, commit: msg => { changed(msg); render(); } })));
}

function viewRaw() {
  const text = stringifyJson(state.char.json);
  return card('Raw JSON', 'The full character file. Saving re-checks the JSON before applying it.',
    jsonEditor(text, out => {
      const json = parseJson(out);
      state.char = { json, root: json.GameProgress ?? json };
      changed('Raw JSON applied');
    }));
}

// ---------------------------------------------------------------------------
// Boot

function init() {
  const input = $('#file');
  const drop = $('#drop');
  const open = guard(async file => {
    if (!file) return;
    if (file.size > 64 * 1024 * 1024) throw new Error('That file is larger than any Dragonwilds save we know of.');
    try { await loadFile(file); } catch (e) { console.error(e); toast(e.message || 'Could not read that file', 'error'); }
  });
  input.addEventListener('change', () => open(input.files[0]));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); open(e.dataTransfer.files[0]); });
  $('#download').addEventListener('click', guard(download));
  $('#reset').addEventListener('click', reset);
  window.addEventListener('beforeunload', e => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
  for (const b of document.querySelectorAll('[data-copy]')) {
    b.addEventListener('click', () => {
      navigator.clipboard?.writeText(b.dataset.copy).then(() => toast('Path copied', 'ok'), () => {});
    });
  }
}

init();
