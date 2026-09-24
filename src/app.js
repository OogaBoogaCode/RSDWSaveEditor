// UI for the Dragonwilds save editor. Everything runs in the browser; files are
// read into memory, edited, and handed back as a download. Nothing is uploaded or stored.
import { parseSave, writeSave } from './spud.js';
import { WorldSave, typeName, isEditableType, shortClass } from './model.js';
import { parse as parseJson, stringify as stringifyJson, num, keysOf } from './uejson.js';
import { slots, putItem, removeItem, cloneItem, itemCatalog, newItemGuid } from './inventory.js';
import { ITEMS, SKILLS } from './catalog.js';
import { IniDoc, decodeIni, encodeIni, parseStruct, stringifyStruct, structGet, structSet } from './ini.js';
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
    try { return fn(...args); } catch (e) {
      // Plain Errors are validation messages for the user; anything else is a bug worth logging.
      if (e?.constructor !== Error) console.error(e);
      toast(e.message || String(e), 'error');
    }
  };
}

const fmtBytes = n => (n > 1048576 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1024).toFixed(1) + ' KB');
const fmtNum = v => (typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(6) : String(v));

// ---------------------------------------------------------------------------
// Loading

async function loadFile(file) {
  loadBytes(new Uint8Array(await file.arrayBuffer()), file.name);
  toast('Loaded ' + file.name, 'ok');
}

// isNew: a file created from a template, not yet downloaded.
function loadBytes(buf, name, { isNew = false } = {}) {
  state.fileName = name;
  state.original = buf;
  state.dirty = 0;
  state.isNew = isNew;
  blobCache = null;
  state.world = state.char = state.server = state.building = null;
  // Selections belong to the previous file.
  Object.assign(bagUi, { view: 'Inventory', page: 0, sel: null });
  storageUi.open = dataUi.open = advUi.open = null;
  if (buf.length >= 4 && String.fromCharCode(...buf.subarray(0, 4)) === 'SAVE') {
    state.world = new WorldSave(parseSave(buf));
    state.kind = 'world';
    state.tab = 'world';
  } else if (loadServer(buf)) {
    state.kind = 'server';
    state.tab = 'server';
  } else if (loadBuilding(buf)) {
    state.kind = 'building';
    state.tab = 'building';
  } else {
    let text = new TextDecoder('utf-8').decode(buf);
    state.bom = text.charCodeAt(0) === 0xfeff;
    if (state.bom) text = text.slice(1);
    if (!text.trimStart().startsWith('{')) {
      throw new Error('This is not a Dragonwilds world (.sav), character (.json), DedicatedServer.ini or BuildingSettings.ini file.');
    }
    const json = parseJson(text);
    if (!json.meta_data && !json.GameProgress && !json.Skills) throw new Error('This JSON file does not look like a Dragonwilds character save.');
    state.char = { json, root: json.GameProgress ?? json, loadedName: json.meta_data?.char_name ?? null };
    state.kind = 'character';
    state.tab = 'character';
  }
  $('#landing').hidden = true;
  $('#editor').hidden = false;
  render();
}

function buildOutput() {
  if (state.kind === 'world') return writeSave(state.world.root);
  if (state.kind === 'server') return encodeIni(state.server.doc.toString(), state.server.encoding).bytes;
  if (state.kind === 'building') return encodeIni(state.building.doc.toString(), state.building.encoding).bytes;
  const text = (state.bom ? '﻿' : '') + stringifyJson(state.char.json);
  return new TextEncoder().encode(text);
}

// Characters are stored as "<char_name>.json", so the download follows the current name.
function outputFileName() {
  const name = state.kind === 'character' ? state.char.json.meta_data?.char_name : null;
  return name ? name + '.json' : state.fileName;
}

// Characters that can't appear in a Windows file name.
const BAD_FILE_CHARS = /[<>:"/\\|?*\x00-\x1f]/;

function download() {
  const bytes = buildOutput();
  const name = outputFileName();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  state.isNew = false;
  state.dirty = 0;
  updateBar();
  toast('Downloaded ' + name + ' (' + fmtBytes(bytes.length) + ')', 'ok');
}

function reset() {
  if ((state.dirty || state.isNew) && !confirm('Discard your unsaved edits?')) return;
  Object.assign(state, { kind: null, world: null, char: null, server: null, building: null, original: null, dirty: 0, isNew: false });
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
const SERVER_TABS = [
  ['server', 'Server'],
  ['players', 'Players'],
  ['rawini', 'Raw file'],
];
const BUILDING_TABS = [
  ['building', 'Totem limit'],
  ['rawini', 'Raw file'],
];
const CHAR_TABS = [
  ['character', 'Character'],
  ['skills', 'Skills'],
  ['inventory', 'Inventory'],
  ['raw', 'Raw JSON'],
];

function updateBar() {
  const out = outputFileName();
  $('#file-name').textContent = state.fileName;
  $('#file-meta').textContent = ({ world: 'World save', character: 'Character save', server: 'Server settings', building: 'Building settings' }[state.kind]) + ' · ' + fmtBytes(state.original.length) +
    (out !== state.fileName ? ' · downloads as ' + out : '');
  $('#dirty').textContent = state.isNew ? 'New file, not downloaded yet' : state.dirty ? state.dirty + ' change' + (state.dirty === 1 ? '' : 's') + ' not yet downloaded' : 'No changes yet';
  $('#dirty').classList.toggle('has', !!state.dirty || state.isNew);
}

function render() {
  updateBar();
  const tabs = { world: WORLD_TABS, character: CHAR_TABS, server: SERVER_TABS, building: BUILDING_TABS }[state.kind];
  const nav = $('#tabs');
  nav.replaceChildren(...tabs.map(([id, label]) =>
    h('button', { role: 'tab', 'aria-selected': String(state.tab === id), class: 'tab', onclick: () => { state.tab = id; render(); } }, label)));
  const panel = $('#panel');
  panel.replaceChildren();
  const views = {
    world: viewWorld, difficulty: viewDifficulty, storage: viewStorage, data: viewData, advanced: viewAdvanced,
    character: viewCharacter, skills: viewSkills, inventory: viewCharInventory, raw: viewRaw,
    server: viewServer, players: viewPlayers, rawini: viewRawIni, building: viewBuilding,
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
  const known = DIFFICULTY_TAGS.map(k => ({ ...k, group: k.group === 'AI' ? 'Environment' : k.group }));
  // Settings in the file that this game version no longer defines are kept.
  for (const tag of current.keys()) {
    if (!known.some(k => k.tag === tag)) known.push({ tag, label: prettyTag(tag), group: 'Other', kind: 'scale', def: 1, min: 0, max: 100, step: 0.1, presets: {} });
  }
  const mode = w.headerValue('SurvivalDifficulty');
  const draft = new Map(current);
  const controls = new Map(); // tag -> { toggle, input }

  const clampCheck = (k, v) => {
    if (k.kind === 'bool') return v ? 1 : 0;
    if (!Number.isFinite(v)) throw new Error(k.label + ' needs a number');
    if (k.kind === 'int' && !Number.isInteger(v)) throw new Error(k.label + ' must be a whole number');
    if (v < k.min || v > k.max) throw new Error(k.label + ' must be between ' + k.min + ' and ' + k.max);
    return v;
  };

  const valueControl = k => {
    const on = draft.has(k.tag);
    const val = on ? draft.get(k.tag) : k.def;
    const input = k.kind === 'bool'
      ? h('input', { type: 'checkbox', checked: val >= 0.5, disabled: !on, 'aria-label': k.label })
      : h('input', { type: 'number', min: k.min, max: k.max, step: k.step, value: fmtNum(val), disabled: !on, 'aria-label': k.label });
    input.addEventListener('change', () => draft.set(k.tag, k.kind === 'bool' ? (input.checked ? 1 : 0) : Number(input.value)));
    const toggle = h('input', {
      type: 'checkbox', checked: on, 'aria-label': 'Override ' + k.label,
      onchange: e => {
        if (e.target.checked) draft.set(k.tag, k.kind === 'bool' ? (input.checked ? 1 : 0) : Number(input.value));
        else draft.delete(k.tag);
        input.disabled = !e.target.checked;
        e.target.closest('.diff-row, .ai-cell')?.classList.toggle('on', e.target.checked);
      },
    });
    controls.set(k.tag, { toggle, input });
    return { toggle, input, on };
  };

  const range = k => (k.kind === 'bool' ? 'On/off' : k.min + ' to ' + k.max + (k.kind === 'int' ? '' : ' (default ' + k.def + ')'));
  const row = k => {
    const { toggle, input, on } = valueControl(k);
    return h('div', { class: 'diff-row' + (on ? ' on' : ''), title: k.tag },
      toggle,
      h('span', { class: 'diff-name' }, k.label, h('small', {}, (k.desc ? k.desc + ' · ' : '') + range(k))),
      input);
  };

  const groupOrder = [...new Set(known.map(k => k.group))].filter(g => !g.startsWith('AI / '));
  const plain = groupOrder.map(g => h('fieldset', { class: 'diff-group' }, h('legend', {}, g), known.filter(k => k.group === g).map(row)));

  // Enemy settings: one row per creature type, one column per stat.
  const aiGroups = [...new Set(known.filter(k => k.group.startsWith('AI / ')).map(k => k.group))];
  const stats = ['Health', 'Damage', 'Resistances'];
  const aiTable = aiGroups.length ? h('fieldset', { class: 'diff-group wide' }, h('legend', {}, 'Enemies'),
    h('p', { class: 'hint' }, 'Scales from 0.5 to 3. Tick a value to override it.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'ai-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Enemy'), stats.map(s => h('th', {}, s)))),
      h('tbody', {}, aiGroups.map(g => h('tr', {},
        h('th', { scope: 'row' }, g.replace('AI / ', '')),
        stats.map(s => {
          const k = known.find(x => x.group === g && x.tag.endsWith('.' + s));
          if (!k) return h('td', {}, '—');
          const { toggle, input, on } = valueControl(k);
          return h('td', { class: 'ai-cell' + (on ? ' on' : ''), title: k.tag }, h('label', { class: 'inline' }, toggle, input));
        }))))))) : null;

  // Fill the draft from one of the game's presets: only settings that differ from Normal are ticked.
  const applyPreset = name => {
    draft.clear();
    for (const k of known) {
      const v = k.presets?.[name];
      if (v != null && v !== k.def) draft.set(k.tag, v);
    }
    for (const k of known) {
      const c = controls.get(k.tag);
      if (!c) continue;
      const on = draft.has(k.tag);
      const val = on ? draft.get(k.tag) : k.def;
      c.toggle.checked = on;
      c.input.disabled = !on;
      if (k.kind === 'bool') c.input.checked = val >= 0.5; else c.input.value = fmtNum(val);
      c.toggle.closest('.diff-row, .ai-cell')?.classList.toggle('on', on);
    }
    toast('Filled from the ' + name + ' preset. Adjust anything, then apply.', 'info');
  };

  const switchMode = h('input', { type: 'checkbox', checked: mode !== 3 });
  return h('div', { class: 'stack' },
    card('Custom difficulty', 'Tick a setting to override it; unticked settings use the game default. Ranges and presets come from the game\'s own data.',
      mode !== 3 ? h('p', { class: 'note' }, 'This world is in ' + (DIFFICULTY_MODES[mode] ?? 'another') + ' mode, so the game ignores these values. ',
        h('label', { class: 'inline' }, switchMode, ' Switch the world to Custom when applying')) : null,
      h('div', { class: 'inline-form preset-bar' }, h('span', {}, 'Start from a preset:'),
        ['Normal', 'Hard', 'Creative'].map(n => h('button', { type: 'button', onclick: () => applyPreset(n) }, n))),
      h('div', { class: 'diff-groups' }, plain),
      aiTable,
      h('div', { class: 'actions' },
        h('button', {
          class: 'primary',
          onclick: guard(() => {
            const list = known.filter(k => draft.has(k.tag)).map(k => ({ tag: k.tag, value: clampCheck(k, draft.get(k.tag)) }));
            w.setDifficulty(list);
            if (mode !== 3 && switchMode.checked && list.length) {
              w.setHeaderValue('SurvivalDifficulty', 3);
              w.setSetting('SurvivalDifficulty', 3);
            }
            changed('Difficulty applied (' + list.length + ' setting' + (list.length === 1 ? '' : 's') + ')');
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
    const ids = json ? slots(json).map(s => s.item.ItemData) : [];
    return { ...b, json, count: ids.length, names: ids.map(itemSearchText).join(' ') };
  });
  const catalog = itemCatalog(invs.filter(i => i.json).map(i => i.json));

  const list = h('div', { class: 'inv-list' });
  const detail = h('div', { class: 'inv-detail' });

  const draw = () => {
    const q = storageUi.filter.toLowerCase();
    const shown = invs.filter(i => (!storageUi.hideEmpty || i.count) &&
      (!q || (blobLabel(i) + ' ' + areaLabel(i.obj.container) + ' ' + i.component + ' ' + i.names + ' ' + i.text).toLowerCase().includes(q)));
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
        commit: msg => { w.setProperty(open.obj, open.path, stringifyJson(open.json)); open.text = stringifyJson(open.json); open.count = slots(open.json).length; open.names = slots(open.json).map(s => itemSearchText(s.item.ItemData)).join(' '); changed(msg); draw(); },
      })
      : h('div', { class: 'empty' }, h('p', {}, 'Pick a chest, crate or station on the left to edit what is inside.')));
  };

  const search = h('input', { type: 'search', placeholder: 'Search containers or items', value: storageUi.filter, oninput: e => { storageUi.filter = e.target.value; draw(); } });
  const hide = h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: storageUi.hideEmpty, onchange: e => { storageUi.hideEmpty = e.target.checked; draw(); } }), ' Hide empty');
  draw();
  return h('div', { class: 'stack' },
    card('Storage', 'Chests, crates and other containers placed in this world. Search by container or by an item inside it.',
      h('div', { class: 'toolbar' }, search, hide),
      h('div', { class: 'split' }, list, detail)));
}

// Generic inventory editor used for world containers and character bags.
function inventoryEditor(inv, { title, subtitle, catalog, commit }) {
  if (!inv) return h('p', { class: 'error' }, 'This inventory could not be read.');
  const rows = slots(inv);
  const fieldsSeen = new Set();
  rows.forEach(r => keysOf(r.item).forEach(k => { if (k !== 'GUID' && k !== 'ItemData' && k !== 'Count') fieldsSeen.add(k); }));
  const numFields = [...fieldsSeen].filter(f => rows.some(r => typeof num(r.item[f]) === 'number'));
  const anyStack = rows.some(r => isStackable(r.item.ItemData) || 'Count' in r.item);

  // The game omits Count for a single item, so 1 is written by removing the field.
  const countCell = (item, slot) => {
    if (!isStackable(item.ItemData) && !('Count' in item)) return h('td', {}, h('span', { class: 'muted' }, '—'));
    return h('td', {}, numberInput('Count' in item ? num(item.Count) : 1, guard(v => {
      const n = Math.floor(v);
      if (n < 1) throw new Error('Count must be 1 or more');
      if (n === 1) delete item.Count; else item.Count = n;
      commit('Count set to ' + n + ' in slot ' + slot);
    }), { class: 'small', min: '1', step: '1' }));
  };

  const table = h('table', { class: 'slots' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Slot'), h('th', {}, 'Item'), anyStack ? h('th', {}, 'Count') : null, ...numFields.map(f => h('th', {}, f)), h('th', {}, ''))),
    h('tbody', {}, rows.length ? rows.map(({ slot, item }) => h('tr', {},
      h('td', { class: 'mono' }, slot),
      itemCell(item.ItemData),
      anyStack ? countCell(item, slot) : null,
      ...numFields.map(f => h('td', {}, typeof num(item[f]) === 'number'
        ? numberInput(num(item[f]), guard(v => { item[f] = v; commit(f + ' updated in slot ' + slot); }), { class: 'small', min: '0' })
        : h('span', { class: 'muted' }, '—'))),
      h('td', {}, h('div', { class: 'row-actions' },
        h('button', { title: 'Duplicate into the first empty slot', onclick: guard(() => {
          const s = knownEmptySlots(inv)[0];
          if (s == null) throw new Error('No empty slot known for this container');
          putItem(inv, s, cloneItem(item)); commit('Duplicated into slot ' + (s + 1));
        }) }, 'Duplicate'),
        h('button', { class: 'danger', onclick: guard(() => { removeItem(inv, slot); commit('Removed slot ' + slot); }) }, 'Remove'))),
    )) : h('tr', {}, h('td', { colspan: 4 + numFields.length, class: 'muted' }, 'Empty'))));

  const bulk = rows.some(r => 'Count' in r.item) ? h('div', { class: 'inline-form' },
    h('span', {}, 'Set every stack count to'),
    (() => {
      const inp = h('input', { type: 'number', min: '2', value: '100', class: 'small' });
      return [inp, h('button', {
        onclick: guard(() => {
          const v = Math.floor(Number(inp.value));
          if (!(v >= 2)) throw new Error('Enter a count of 2 or more');
          let n = 0;
          for (const r of rows) if ('Count' in r.item) { r.item.Count = v; n++; }
          commit(n + ' stacks set to ' + v);
        }),
      }, 'Apply')];
    })()) : null;

  return h('div', { class: 'inv-editor' },
    title ? h('h3', {}, title) : null, subtitle ? h('p', { class: 'muted' }, subtitle) : null,
    h('div', { class: 'table-wrap' }, table),
    bulk,
    addItemForm(inv, catalog, commit, {
      choices: knownEmptySlots(inv).map(s => ({ slot: s, label: 'Slot ' + (s + 1) })),
      none: 'No empty slots are known for this container. Its size in game is not confirmed, so only slots the save already records can be filled.',
    }),
  );
}

// Container sizes are not stored in the save. Slots up to MaxSlotIndex (or the highest used
// slot) are known to exist; anything beyond that might not, so it is never offered.
function knownEmptySlots(inv) {
  const top = Math.max(num(inv.MaxSlotIndex) ?? -1, ...slots(inv).map(s => s.slot));
  const out = [];
  for (let i = 0; i <= top; i++) if (!(String(i) in inv)) out.push(i);
  return out;
}

const EQUIPMENT = new Set(['Weapon/Tool', 'Armour', 'Shield', 'Jewellery']);
const FLAG_LABELS = { r: 'retired', g: 'unofficial name', p: 'placeholder name' };

function itemInfo(id) {
  const r = ITEMS[id];
  return r ? { id, name: r[0], cat: r[1], flags: r[2] || '', hint: r[3] || '' } : null;
}

function isStackable(id) {
  const i = itemInfo(id);
  return !!i && !EQUIPMENT.has(i.cat);
}

function itemCell(id) {
  const i = itemInfo(id);
  if (!i) return h('td', { class: 'item' }, h('div', { class: 'item-name' }, 'Unknown item'), h('div', { class: 'item-sub mono' }, id ?? '—'));
  return h('td', { class: 'item', title: id },
    h('div', { class: 'item-name' }, i.name, [...i.flags].map(f => h('span', { class: 'tag' }, FLAG_LABELS[f]))),
    h('div', { class: 'item-sub' }, i.cat + (i.hint ? ' · ' + i.hint : '')));
}

function itemSearchText(id) {
  const i = itemInfo(id);
  return i ? (i.name + ' ' + i.cat + ' ' + i.hint).toLowerCase() : String(id).toLowerCase();
}

// Add any item from the game catalog. Items already in the file are copied so they keep
// the game's own fields; others are built from scratch (Count for stacks, optional Durability).
// target: { slot, label } to fill one slot, or { choices: [{ slot, label }] } of empty slots
// that exist in game. Items can never be added anywhere else.
function addItemForm(inv, templates, commit, target) {
  const choices = target.choices ?? [{ slot: target.slot, label: target.label }];
  if (!choices.length) return h('p', { class: 'hint' }, target.none ?? 'No empty slots to add an item to.');
  let chosen = null;
  const search = h('input', { type: 'search', placeholder: 'Search items, e.g. rune pickaxe', 'aria-label': 'Search items' });
  const retired = h('input', { type: 'checkbox' });
  const results = h('div', { class: 'item-results', role: 'listbox' });
  const picked = h('div', { class: 'picked' });
  const qty = h('input', { type: 'number', min: '1', value: '1', class: 'small', 'aria-label': 'Quantity' });
  const dura = h('input', { type: 'number', min: '1', class: 'small', placeholder: 'game default', 'aria-label': 'Durability' });
  const slotIn = h('select', { 'aria-label': 'Slot' }, choices.map(c => h('option', { value: c.slot }, c.label)));
  const qtyField = h('label', { class: 'inline' }, 'Quantity ', qty);
  const duraField = h('label', { class: 'inline' }, 'Durability ', dura);
  const addBtn = h('button', { class: 'primary', disabled: true }, 'Add');

  const all = Object.keys(ITEMS);
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { fill(results); return; }
    const words = q.split(/\s+/);
    const hits = all.filter(id => {
      const i = itemInfo(id);
      if (i.flags.includes('r') && !retired.checked) return false;
      const t = itemSearchText(id);
      return words.every(w => t.includes(w)) || id.toLowerCase() === q;
    }).sort((x, y) => (templates?.has(y) ? 1 : 0) - (templates?.has(x) ? 1 : 0) || itemInfo(x).name.localeCompare(itemInfo(y).name));
    fill(results, hits.slice(0, 40).map(id => {
      const i = itemInfo(id);
      return h('button', {
        type: 'button', role: 'option', class: 'item-result' + (chosen === id ? ' active' : ''),
        onclick: () => { chosen = id; update(); draw(); },
      }, h('strong', {}, i.name), h('span', {}, i.cat + (i.hint ? ' · ' + i.hint : '') + (templates?.has(id) ? ' · in this file' : '')));
    }), hits.length > 40 ? h('p', { class: 'muted' }, hits.length - 40 + ' more; keep typing to narrow down.') : null,
    hits.length ? null : h('p', { class: 'muted' }, 'No matching items.'));
  };
  const update = () => {
    const i = chosen && itemInfo(chosen);
    addBtn.disabled = !i;
    qtyField.hidden = !i || !isStackable(chosen);
    duraField.hidden = !i || !EQUIPMENT.has(i.cat) || !!templates?.has(chosen);
    fill(picked, i ? ['Selected: ', h('strong', {}, i.name), ' ', h('span', { class: 'muted' }, '(' + i.cat + ')')] : null);
  };
  search.addEventListener('input', draw);
  retired.addEventListener('change', draw);
  addBtn.addEventListener('click', guard(() => {
    const s = Number(slotIn.value);
    if (!choices.some(c => c.slot === s)) throw new Error('That slot does not exist in game');
    if (String(s) in inv) throw new Error('That slot is already in use');
    let item;
    if (templates?.has(chosen)) item = cloneItem(templates.get(chosen));
    else {
      item = { GUID: newItemGuid(), ItemData: chosen };
      if (EQUIPMENT.has(itemInfo(chosen).cat) && dura.value !== '') {
        const d = Math.floor(Number(dura.value));
        if (!(d >= 1)) throw new Error('Durability must be 1 or more');
        item.Durability = d;
      }
    }
    if (isStackable(chosen)) {
      const n = Math.floor(Number(qty.value));
      if (!(n >= 1)) throw new Error('Quantity must be 1 or more');
      if (n === 1) delete item.Count; else item.Count = n;
    }
    putItem(inv, s, item);
    commit('Added ' + itemInfo(chosen).name + ' to ' + choices.find(c => c.slot === s).label);
  }));
  update();
  return h('div', { class: 'add-item' },
    h('h4', {}, target.choices ? 'Add an item' : 'Add an item to ' + target.label),
    h('div', { class: 'toolbar' }, search, h('label', { class: 'inline' }, retired, ' Include retired items')),
    results, picked,
    h('div', { class: 'inline-form' }, qtyField, duraField, h('label', { class: 'inline', hidden: !target.choices }, 'Slot ', slotIn), addBtn),
    h('p', { class: 'hint' }, 'Items already in this file are copied with their stats. Other equipment is created at the durability you enter, or the game default if left blank. Each new item gets a fresh unique ID.'),
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
  const oldName = state.char.loadedName;
  const renamed = oldName && j.meta_data?.char_name !== oldName;
  return h('div', { class: 'stack' },
    card('Character', null,
      renamed ? h('p', { class: 'note' },
        'Renamed: this character now downloads as ', h('strong', {}, outputFileName()),
        '. After copying it into SaveCharacters, delete ', h('strong', {}, oldName + '.json'),
        ' and ', h('strong', {}, oldName + '.json.backup'),
        ' from that folder. Both files are the same character, so leaving the old one may show it twice in game.') : null,
      h('div', { class: 'grid' },
        j.meta_data ? field('Name', textInput(j.meta_data.char_name ?? '', guard(v => {
          const name = v.trim();
          if (!name) throw new Error('Name cannot be empty');
          if (BAD_FILE_CHARS.test(name) || /\.$/.test(name)) throw new Error('Names cannot contain < > : " / \\ | ? * or end with a dot');
          if (name === j.meta_data.char_name) return;
          j.meta_data.char_name = name;
          changed('Name updated. Downloads as ' + outputFileName());
          render();
        })), 'The downloaded file is named after the character, as the game expects.') : null,
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
  return card('Skills', 'Total XP per skill. The game works out levels from XP.',
    h('div', { class: 'table-wrap' }, h('table', { class: 'slots' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Skill'), h('th', {}, 'XP'))),
      h('tbody', {}, skills.map((s, i) => h('tr', {},
        h('td', { class: 'item', title: s.Id }, h('div', { class: 'item-name' }, SKILLS[s.Id] ?? 'Unknown skill'), SKILLS[s.Id] ? null : h('div', { class: 'item-sub mono' }, s.Id)),
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

// ---------------------------------------------------------------------------
// Character inventory, laid out like the game.
// Backpack: slots 0-7 are the hotbar (shared by every page), then four pages of 8x3.
// Loadout keeps armour directly; hand/ammo slots point at backpack slots.
// Only slots that exist in game can receive items.

const HOTBAR_SIZE = 8;
const PAGE_SIZE = 24;
const BAG_PAGES = [
  { name: 'Items', start: 8 },
  { name: 'Runes', start: 32 },
  { name: 'Ammo', start: 56 },
  { name: 'Quest items', start: 80 },
];
// ELoadoutSlot values from the game executable.
const LOADOUT = [
  { key: '0', label: 'Head' },
  { key: '1', label: 'Body' },
  { key: '2', label: 'Legs' },
  { key: '3', label: 'Cape' },
  { key: '4', label: 'Trinket' },
  { key: '7', label: 'Main hand', ref: true },
  { key: '8', label: 'Off hand', ref: true },
  { key: '5', label: 'Arrows', ref: true },
  { key: '9', label: 'Crossbow bolts', ref: true },
  { key: '6', label: 'Magic ammo (runes)', ref: true },
  { key: '10', label: 'Fishing bait', ref: true },
];

const bagUi = { view: 'Inventory', page: 0, sel: null };

const isRef = v => v && typeof v === 'object' && 'PlayerInventoryItemIndex' in v;

// Every slot that exists in game for a bag, in display order, with its label.
function validSlots(r, bag) {
  if (bag === 'Inventory') {
    const out = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) out.push({ slot: i, label: 'Hotbar ' + (i + 1), page: -1 });
    BAG_PAGES.forEach((p, pi) => {
      for (let i = 0; i < PAGE_SIZE; i++) out.push({ slot: p.start + i, label: p.name + ' ' + (i + 1), page: pi });
    });
    return out;
  }
  if (bag === 'Loadout') return LOADOUT.filter(l => !l.ref).map(l => ({ slot: Number(l.key), label: l.label }));
  // Personal storage: its in-game size is not known yet, so only slots the save has
  // already recorded (up to MaxSlotIndex or the highest used slot) are offered.
  const inv = r[bag];
  const top = Math.max(num(inv.MaxSlotIndex) ?? -1, ...slots(inv).map(s => s.slot));
  return Array.from({ length: top + 1 }, (_, i) => ({ slot: i, label: 'Storage ' + (i + 1) }));
}

const slotLabel = (r, bag, slot) => validSlots(r, bag).find(v => v.slot === slot)?.label ?? 'Slot ' + slot + ' (outside the game\'s slots)';
const isValidSlot = (r, bag, slot) => validSlots(r, bag).some(v => v.slot === slot);

// Loadout entries pointing into the backpack: [{ key, label, slot }]
function loadoutRefs(r) {
  const lo = r.Loadout;
  if (!lo) return [];
  return keysOf(lo).filter(k => /^\d+$/.test(k) && isRef(lo[k])).map(k => ({
    key: k,
    label: LOADOUT.find(l => l.key === k)?.label ?? 'Loadout ' + k,
    slot: num(lo[k].PlayerInventoryItemIndex),
  }));
}

// Move or swap two slots of a bag. In the backpack, equipped links follow their items.
function moveSlot(r, bag, from, to) {
  if (from === to) return;
  if (!isValidSlot(r, bag, to)) throw new Error('That slot does not exist in game');
  const inv = r[bag];
  const a = inv[String(from)];
  const b = inv[String(to)];
  if (!a) throw new Error('That slot is empty');
  if (b && !isValidSlot(r, bag, from)) throw new Error('Move this item to an empty slot; its current slot does not exist in game');
  if (b) putItem(inv, from, b); else removeItem(inv, from);
  putItem(inv, to, a);
  if (bag !== 'Inventory') return;
  for (const ref of loadoutRefs(r)) {
    const entry = r.Loadout[ref.key];
    if (ref.slot === from) entry.PlayerInventoryItemIndex = to;
    else if (b && ref.slot === to) entry.PlayerInventoryItemIndex = from;
  }
}

function removeBagSlot(r, bag, slot) {
  const inv = r[bag];
  const refs = bag === 'Inventory' ? loadoutRefs(r).filter(x => x.slot === slot) : [];
  if (refs.length && !confirm('This item is equipped (' + refs.map(x => x.label).join(', ') + '). Remove it and unequip?')) return false;
  removeItem(inv, slot);
  for (const x of refs) removeItem(r.Loadout, Number(x.key));
  return true;
}

// Backpack page a slot number belongs to (-1 hotbar), including slots past a page's end.
function pageOfSlot(slot) {
  if (slot < HOTBAR_SIZE) return -1;
  return BAG_PAGES.findIndex(p => slot >= p.start && slot < p.start + PAGE_SIZE);
}

// First empty real slot for a copy. Backpack copies stay on their own page
// (hotbar copies may also use the Items page); other bags use any empty slot.
function freeValidSlot(r, bag, slot) {
  const empty = validSlots(r, bag).filter(v => !(String(v.slot) in r[bag]));
  if (bag !== 'Inventory') return empty[0] ?? null;
  const page = pageOfSlot(slot);
  const allowed = page === -1 ? [-1, 0] : [page];
  for (const pg of allowed) {
    const hit = empty.find(v => v.page === pg);
    if (hit) return hit;
  }
  return null;
}

function viewCharInventory() {
  const r = state.char.root;
  const views = [
    ['Inventory', 'Backpack'],
    ['Loadout', 'Equipped'],
    ['PersonalInventory', 'Personal storage'],
  ].filter(([k]) => r[k] && typeof r[k] === 'object');
  if (!views.length) return card('Inventory', 'No inventory found in this save.');
  if (!views.some(([k]) => k === bagUi.view)) bagUi.view = views[0][0];
  const templates = itemCatalog(['Inventory', 'PersonalInventory', 'Loadout'].filter(k => r[k]).map(k => r[k]));
  const commit = msg => { changed(msg); render(); };

  let body;
  if (bagUi.view === 'Inventory') body = backpackView(r, templates, commit);
  else if (bagUi.view === 'Loadout') body = loadoutView(r, templates, commit);
  else body = storageGridView(r, templates, commit);

  return h('div', { class: 'stack' },
    h('div', { class: 'seg' }, views.map(([k, label]) => h('button', {
      'aria-pressed': String(bagUi.view === k),
      onclick: () => { bagUi.view = k; bagUi.sel = null; render(); },
    }, label, ' (' + slots(r[k]).length + ')'))),
    body);
}

function slotButton(r, bag, slot, { label, dropTarget = true } = {}) {
  const inv = r[bag];
  const item = inv[String(slot)];
  const info = item && itemInfo(item.ItemData);
  const eq = bag === 'Inventory' && item ? loadoutRefs(r).filter(x => x.slot === slot) : [];
  const selected = bagUi.sel && bagUi.sel.bag === bag && bagUi.sel.slot === slot;
  const count = item && 'Count' in item ? num(item.Count) : null;
  const dur = item && typeof num(item.Durability) === 'number' ? num(item.Durability) : null;
  const where = slotLabel(r, bag, slot);
  const title = item ? (info ? info.name : 'Unknown item') + ' · ' + where : where + ' · empty';
  const el = h('button', {
    type: 'button',
    class: 'slot' + (item ? ' filled' : '') + (selected ? ' selected' : '') + (eq.length ? ' equipped' : '') + (dropTarget ? '' : ' stray'),
    title: title + (eq.length ? ' · equipped: ' + eq.map(x => x.label).join(', ') : ''),
    'aria-label': title,
    'data-slot': slot,
    'aria-pressed': String(!!selected),
    draggable: item && bag !== 'Loadout' ? 'true' : null,
    onclick: () => {
      bagUi.sel = { bag, slot };
      render();
      // On narrow screens the editor sits below the grid, so bring it into view.
      if (window.matchMedia('(max-width: 900px)').matches) $('.slot-panel')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
  },
  label != null ? h('span', { class: 'slot-num' }, label) : null,
  item ? h('span', { class: 'slot-name' }, info ? info.name : 'Unknown') : null,
  count != null ? h('span', { class: 'slot-count' }, count.toLocaleString()) : null,
  dur != null ? h('span', { class: 'slot-dur' }, dur.toLocaleString()) : null,
  eq.length ? h('span', { class: 'slot-eq', 'aria-hidden': 'true' }, 'E') : null);

  el.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ bag, slot }));
    e.dataTransfer.effectAllowed = 'move';
  });
  if (!dropTarget || bag === 'Loadout') return el;
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drop'); });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', guard(e => {
    e.preventDefault();
    el.classList.remove('drop');
    const src = JSON.parse(e.dataTransfer.getData('text/plain') || 'null');
    if (!src || src.bag !== bag || src.slot === slot) return;
    const swapping = String(slot) in inv;
    moveSlot(r, bag, src.slot, slot);
    bagUi.sel = { bag, slot };
    changed((swapping ? 'Swapped with ' : 'Moved to ') + slotLabel(r, bag, slot));
    render();
  }));
  return el;
}

function backpackView(r, templates, commit) {
  const inv = r.Inventory;
  const page = BAG_PAGES[bagUi.page];
  const hotbar = h('div', { class: 'slot-grid hotbar' },
    Array.from({ length: HOTBAR_SIZE }, (_, i) => slotButton(r, 'Inventory', i, { label: i + 1 })));
  const tabs = h('div', { class: 'bag-tabs', role: 'tablist' }, BAG_PAGES.map((p, i) => {
    const used = slots(inv).filter(s => s.slot >= p.start && s.slot < p.start + PAGE_SIZE).length;
    return h('button', {
      role: 'tab', 'aria-selected': String(bagUi.page === i),
      onclick: () => { bagUi.page = i; bagUi.sel = null; render(); },
    }, p.name, h('span', { class: 'muted' }, ' ' + used + '/' + PAGE_SIZE));
  }));
  const grid = h('div', { class: 'slot-grid page' },
    Array.from({ length: PAGE_SIZE }, (_, i) => slotButton(r, 'Inventory', page.start + i)));
  const stray = slots(inv).filter(s => !isValidSlot(r, 'Inventory', s.slot));
  return h('div', { class: 'bag-layout' },
    card('Backpack', 'Drag an item onto another slot to move or swap it. Click a slot to edit it, or to add an item to an empty slot.',
      h('p', { class: 'bag-label' }, 'Hotbar'), hotbar,
      tabs, grid,
      stray.length ? h('div', { class: 'stray-box' },
        h('p', { class: 'note' }, stray.length + ' item' + (stray.length === 1 ? ' is' : 's are') + ' stored in slots that don\'t exist in game, so the game may not show ' + (stray.length === 1 ? 'it' : 'them') + '. Move ' + (stray.length === 1 ? 'it' : 'them') + ' into an empty slot or remove ' + (stray.length === 1 ? 'it' : 'them') + '.'),
        h('div', { class: 'slot-grid page' }, stray.map(s => slotButton(r, 'Inventory', s.slot, { dropTarget: false })))) : null),
    slotPanel(r, templates, commit));
}

function storageGridView(r, templates, commit) {
  const inv = r.PersonalInventory;
  const valid = validSlots(r, 'PersonalInventory');
  return h('div', { class: 'bag-layout' },
    card('Personal storage', 'Its size in game is not confirmed yet, so only slots this save already uses are shown.',
      valid.length
        ? h('div', { class: 'slot-grid page' }, valid.map(v => slotButton(r, 'PersonalInventory', v.slot)))
        : h('p', { class: 'muted' }, 'This storage has never been used, so no slots are known yet.')),
    slotPanel(r, templates, commit));
}

function loadoutView(r, templates, commit) {
  const lo = r.Loadout;
  const inv = r.Inventory ?? {};
  const known = new Set(LOADOUT.map(l => l.key));
  const extra = keysOf(lo).filter(k => /^\d+$/.test(k) && !known.has(k));
  const bagOptions = slots(inv).filter(s => isValidSlot(r, 'Inventory', s.slot))
    .map(s => [s.slot, (itemInfo(s.item.ItemData)?.name ?? 'Unknown') + ' (' + slotLabel(r, 'Inventory', s.slot) + ')']);

  const armour = LOADOUT.filter(l => !l.ref).map(l =>
    h('div', { class: 'equip-slot' }, h('span', { class: 'bag-label' }, l.label), slotButton(r, 'Loadout', Number(l.key))));
  const refs = LOADOUT.filter(l => l.ref).map(l => {
    const cur = isRef(lo[l.key]) ? num(lo[l.key].PlayerInventoryItemIndex) : null;
    const sel = h('select', {
      'aria-label': l.label,
      onchange: guard(e => {
        const v = e.target.value;
        if (v === '') removeItem(lo, Number(l.key));
        else putItem(lo, Number(l.key), { PlayerInventoryItemIndex: Number(v) });
        commit(l.label + (v === '' ? ' cleared' : ' set to ' + slotLabel(r, 'Inventory', Number(v))));
      }),
    }, h('option', { value: '' }, 'Nothing'),
    cur != null && !bagOptions.some(([s]) => s === cur) ? h('option', { value: cur, selected: true }, 'Slot ' + cur + ' (broken link)') : null,
    bagOptions.map(([s, label]) => h('option', { value: s, selected: s === cur }, label)));
    return field(l.label, sel);
  });

  return h('div', { class: 'bag-layout' },
    h('div', { class: 'stack' },
      card('Worn', 'Armour and trinket are stored here directly.', h('div', { class: 'equip-row' }, armour)),
      card('Hands and ammo', 'These point at items in the backpack. Moving items in the backpack keeps these links correct.', h('div', { class: 'grid' }, refs)),
      extra.length ? card('Other loadout slots', null, h('ul', {}, extra.map(k => h('li', { class: 'mono' }, k + ': ' + JSON.stringify(lo[k]))))) : null),
    bagUi.sel?.bag === 'Loadout' ? slotPanel(r, templates, commit) : h('div', { class: 'card empty' }, 'Click an armour slot to edit it.'));
}

// Editor for the selected slot: fields, move, duplicate, remove, or add when empty.
function slotPanel(r, templates, commit) {
  const sel = bagUi.sel;
  if (!sel || !r[sel.bag]) return h('div', { class: 'card empty slot-panel' }, 'Select a slot to edit it.');
  const inv = r[sel.bag];
  const item = inv[String(sel.slot)];
  const where = slotLabel(r, sel.bag, sel.slot);
  const valid = isValidSlot(r, sel.bag, sel.slot);
  if (!item) {
    if (!valid) return h('div', { class: 'card empty slot-panel' }, 'Select a slot to edit it.');
    return h('div', { class: 'card slot-panel' }, h('h3', {}, where), h('p', { class: 'muted' }, 'Empty.'),
      addItemForm(inv, templates, msg => { bagUi.sel = { ...sel }; commit(msg); }, { slot: sel.slot, label: where }));
  }
  const info = itemInfo(item.ItemData);
  const eq = sel.bag === 'Inventory' ? loadoutRefs(r).filter(x => x.slot === sel.slot) : [];
  const numeric = keysOf(item).filter(k => k !== 'Count' && typeof num(item[k]) === 'number');
  const stack = isStackable(item.ItemData) || 'Count' in item;

  // Move targets: every real slot except this one; occupied ones swap (only allowed from a real slot).
  const home = sel.bag === 'Inventory' ? pageOfSlot(sel.slot) : null;
  const targets = validSlots(r, sel.bag).filter(v => v.slot !== sel.slot && (valid || !(String(v.slot) in inv)))
    .sort((x, y) => (valid ? 0 : (y.page === home) - (x.page === home)));
  const moveSel = h('select', { 'aria-label': 'Move to' }, targets.map(v => {
    const other = inv[String(v.slot)];
    return h('option', { value: v.slot }, v.label + (other ? ' (swap with ' + (itemInfo(other.ItemData)?.name ?? 'item') + ')' : ''));
  }));
  return h('div', { class: 'card slot-panel' },
    h('h3', {}, info ? info.name : 'Unknown item'),
    h('p', { class: 'muted' }, where + (info ? ' · ' + info.cat : '') + (info?.hint ? ' · ' + info.hint : '')),
    info?.flags ? h('p', {}, [...info.flags].map(f => h('span', { class: 'tag' }, FLAG_LABELS[f]))) : null,
    valid ? null : h('p', { class: 'note' }, 'This slot does not exist in game. Move the item to a real slot or remove it.'),
    eq.length ? h('p', { class: 'note' }, 'Equipped as ' + eq.map(x => x.label).join(', ') + '.') : null,
    h('div', { class: 'grid' },
      stack ? field('Count', numberInput('Count' in item ? num(item.Count) : 1, guard(v => {
        const n = Math.floor(v);
        if (n < 1) throw new Error('Count must be 1 or more');
        if (n === 1) delete item.Count; else item.Count = n;
        commit('Count set to ' + n);
      }), { min: '1', step: '1' })) : null,
      numeric.map(k => field(k, numberInput(num(item[k]), guard(v => { item[k] = v; commit(k + ' updated'); }), { min: '0' })))),
    sel.bag !== 'Loadout' && targets.length ? h('div', { class: 'move-form' },
      field('Move to', moveSel),
      h('button', {
        onclick: guard(() => {
          const to = Number(moveSel.value);
          moveSlot(r, sel.bag, sel.slot, to);
          bagUi.sel = { bag: sel.bag, slot: to };
          const vp = validSlots(r, sel.bag).find(v => v.slot === to)?.page;
          if (sel.bag === 'Inventory' && vp >= 0) bagUi.page = vp;
          commit('Moved to ' + slotLabel(r, sel.bag, to));
        }),
      }, 'Move')) : null,
    h('div', { class: 'actions' },
      sel.bag !== 'Loadout' ? h('button', {
        onclick: guard(() => {
          const free = freeValidSlot(r, sel.bag, sel.slot);
          if (!free) {
            const pg = sel.bag === 'Inventory' ? pageOfSlot(sel.slot) : null;
            throw new Error(pg == null ? 'No empty slot left' : (pg === -1 ? 'The hotbar and Items page are' : 'The ' + BAG_PAGES[pg].name + ' page is') + ' full');
          }
          putItem(inv, free.slot, cloneItem(item));
          bagUi.sel = { bag: sel.bag, slot: free.slot };
          commit('Duplicated into ' + free.label);
        }),
      }, 'Duplicate') : null,
      h('button', {
        class: 'danger',
        onclick: guard(() => { if (removeBagSlot(r, sel.bag, sel.slot)) commit('Removed ' + (info ? info.name : 'item')); }),
      }, 'Remove')),
    h('p', { class: 'hint mono wrap' }, item.ItemData));
}

function viewRaw() {
  const text = stringifyJson(state.char.json);
  return card('Raw JSON', 'The full character file. Saving re-checks the JSON before applying it.',
    jsonEditor(text, out => {
      const json = parseJson(out);
      state.char = { json, root: json.GameProgress ?? json, loadedName: state.char.loadedName };
      changed('Raw JSON applied');
    }));
}

// ---------------------------------------------------------------------------
// Dedicated server config (DedicatedServer.ini)

const SERVER = '/Script/Dominion.DedicatedServerSettings';
const SERVER_KNOWN = ['KnownPlayerList', 'PlatformPolicy', 'MaxPlayers', 'OwnerId', 'WorldPassword', 'ServerName', 'DefaultWorldName', 'ServerGuid', 'bAllowSendingCrashDumps'];
const PLAYER_ID = /^[0-9a-fA-F]{32}$/;
// EPlayerPrivilege bit values from the game executable (Owner = 128 is governed by OwnerId).
const PRIVILEGES = [[1, 'Admin'], [2, 'Build'], [4, 'Open chests'], [8, 'Chat']];

function loadServer(buf) {
  const { text, encoding } = decodeIni(buf);
  if (!text.includes('[' + SERVER + ']')) return false;
  state.server = { doc: new IniDoc(text), encoding };
  readPlayers();
  return true;
}

// Player entries as parsed structs; entries we cannot parse are kept verbatim.
function readPlayers() {
  state.server.players = state.server.doc.entries(SERVER, 'KnownPlayerList').map(e => {
    try { return { fields: parseStruct(e.value) }; } catch { return { raw: e.value }; }
  });
}

function writePlayers() {
  state.server.doc.setList(SERVER, 'KnownPlayerList', state.server.players.map(p => (p.raw ?? stringifyStruct(p.fields))));
}

const playerName = p => (p.fields ? structGet(p.fields, ['UserName']) ?? '' : '');
const playerId = p => (p.fields ? structGet(p.fields, ['UserId']) ?? '' : '');

// Unreal writes booleans as True/False; keep whatever casing the file already uses.
function boolText(current, on) {
  const lower = current === 'true' || current === 'false';
  return lower ? String(on) : on ? 'True' : 'False';
}

function viewServer() {
  const doc = state.server.doc;
  const get = k => doc.get(SERVER, k);
  const set = (k, v, msg) => { doc.set(SERVER, k, v); changed(msg); };
  const players = state.server.players.filter(p => p.fields);

  const pw = h('input', { type: 'password', value: get('WorldPassword') ?? '', autocomplete: 'off', onchange: guard(e => set('WorldPassword', e.target.value, e.target.value ? 'Password updated' : 'Password removed')) });
  const showPw = h('label', { class: 'inline' }, h('input', { type: 'checkbox', onchange: e => { pw.type = e.target.checked ? 'text' : 'password'; } }), ' Show');

  // Crossplay is on when PlatformPolicy=Crossplay and off when the line is absent.
  const policy = get('PlatformPolicy');
  const policies = [['Crossplay', 'On (all platforms)'], ['', 'Off']];
  if (policy && policy !== 'Crossplay') policies.push([policy, policy]);

  // Recommended memory: 2 GB for the server plus 1 GB per player.
  const ramTotal = h('span', { class: 'hint ram' });
  const ramHint = h('span', { class: 'hint-block' }, ramTotal, h('span', { class: 'hint' }, '2 GB + 1 GB per player'));
  const showRam = n => { ramTotal.textContent = 'Recommended RAM: ' + (Number.isInteger(n) && n > 0 ? (2 + n) + ' GB' : '2 GB + 1 GB per player'); };
  const maxPlayers = Number(get('MaxPlayers') ?? 6);
  showRam(maxPlayers);
  const maxInput = numberInput(maxPlayers, guard(v => {
    if (!Number.isInteger(v) || v < 1) throw new Error('Max players must be a whole number, 1 or more');
    set('MaxPlayers', v, 'Max players set to ' + v);
    if (v > 6) toast('Dragonwilds is built for up to 6 players; higher values may not be honoured.', 'info');
  }), { min: '1', step: '1' });
  maxInput.addEventListener('input', () => showRam(Number(maxInput.value)));

  const owner = get('OwnerId');
  const ownerSel = !players.length && !owner ? h('p', { class: 'muted' }, 'Add a player on the Players tab; the first one becomes the owner.') : h('select', {
    onchange: guard(e => set('OwnerId', e.target.value, 'Owner set to ' + e.target.selectedOptions[0].textContent)),
  },
  owner && !players.some(p => playerId(p) === owner) ? h('option', { value: owner, selected: true }, owner + ' (not in player list)') : null,
  players.map(p => h('option', { value: playerId(p), selected: playerId(p) === owner }, playerName(p) || playerId(p))));

  const extra = doc.keys(SERVER).filter(k => !SERVER_KNOWN.includes(k));
  const crash = get('bAllowSendingCrashDumps');

  return h('div', { class: 'stack' },
    card('Server', 'Settings from DedicatedServer.ini. Restart the server after replacing the file.',
      h('div', { class: 'grid' },
        field('Server name', textInput(get('ServerName') ?? '', guard(v => {
          if (!v.trim()) throw new Error('Server name cannot be empty');
          set('ServerName', v.trim(), 'Server name updated');
        }))),
        field('World to load', textInput(get('DefaultWorldName') ?? '', guard(v => {
          const name = v.trim().replace(/\.sav$/i, '');
          if (!name) throw new Error('World name cannot be empty');
          if (BAD_FILE_CHARS.test(name)) throw new Error('World names cannot contain < > : " / \\ | ? *');
          set('DefaultWorldName', name, 'World set to ' + name);
          render();
        })), 'The world save file name without .sav, e.g. ' + (get('DefaultWorldName') || 'MyWorld') + ' for ' + (get('DefaultWorldName') || 'MyWorld') + '.sav'),
        field('World password', h('div', { class: 'inline-form tight' }, pw, showPw), 'Leave empty for no password.'),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Max players'), maxInput, ramHint),
        field('Crossplay', h('select', {
          'aria-label': 'Crossplay',
          onchange: guard(e => {
            const v = e.target.value;
            if (v === '') { doc.remove(SERVER, 'PlatformPolicy'); changed('Crossplay off'); }
            else set('PlatformPolicy', v, v === 'Crossplay' ? 'Crossplay on' : 'Platforms set to ' + v);
          }),
        }, policies.map(([v, label]) => h('option', { value: v, selected: v === (policy ?? '') }, label))),
        'Off removes the PlatformPolicy line from the file.'),
        field('Owner', ownerSel, 'Must be a player from the Players tab.'),
        field('Send crash reports', h('input', {
          type: 'checkbox', checked: /^true$/i.test(crash ?? 'True'),
          onchange: e => set('bAllowSendingCrashDumps', boolText(crash, e.target.checked), 'Crash reports ' + (e.target.checked ? 'on' : 'off')),
        })),
        field('Server ID', get('ServerGuid') ? h('input', { type: 'text', value: get('ServerGuid'), readonly: true, class: 'mono' }) : h('p', { class: 'muted' }, 'Created by the server on first start.'), get('ServerGuid') ? 'Read-only. Changing it could make the server look like a different one.' : null),
      )),
    extra.length ? card('Other settings', 'Keys this editor does not know about. They are kept as written; edit with care.',
      h('div', { class: 'grid' }, extra.map(k => {
        const n = doc.entries(SERVER, k).length;
        return n > 1
          ? field(k, h('p', { class: 'muted' }, n + ' entries'), 'A list; edit it on the Raw file tab.')
          : field(k, textInput(get(k) ?? '', guard(v => set(k, v, k + ' updated'))));
      }))) : null,
  );
}

function viewPlayers() {
  const doc = state.server.doc;
  const players = state.server.players;
  const owner = doc.get(SERVER, 'OwnerId');
  const commit = msg => { writePlayers(); changed(msg); render(); };

  const rows = players.map((p, i) => {
    if (!p.fields) return h('tr', {}, h('td', { colspan: 5, class: 'mono wrap muted' }, 'Unreadable entry, kept as is: ' + p.raw));
    const id = playerId(p);
    const mask = structGet(p.fields, ['Privileges', 'PrivilegeMask']);
    const banned = /^true$/i.test(structGet(p.fields, ['bIsBanned']) ?? 'False');
    return h('tr', {},
      h('td', {}, textInput(playerName(p), guard(v => {
        if (!v.trim()) throw new Error('Name cannot be empty');
        structSet(p.fields, ['UserName'], v.trim(), { quoted: true });
        commit('Name updated');
      }), { 'aria-label': 'Name' }), id === owner ? h('span', { class: 'tag' }, 'owner') : null),
      h('td', { class: 'mono id' }, id),
      h('td', {}, h('div', { class: 'privs' }, PRIVILEGES.map(([bit, label]) => h('label', { class: 'inline' },
        h('input', {
          type: 'checkbox', checked: (Number(mask ?? 0) & bit) !== 0, 'aria-label': label,
          onchange: guard(e => {
            const cur = Number(structGet(p.fields, ['Privileges', 'PrivilegeMask']) ?? 0);
            const next = e.target.checked ? cur | bit : cur & ~bit;
            structSet(p.fields, ['Privileges', 'PrivilegeMask'], next);
            commit(label + (e.target.checked ? ' allowed for ' : ' removed for ') + (playerName(p) || 'player'));
          }),
        }), ' ' + label)))),
      h('td', {}, h('input', {
        type: 'checkbox', checked: banned, 'aria-label': 'Banned',
        onchange: guard(e => {
          if (e.target.checked && id === owner) { e.target.checked = false; throw new Error('The owner cannot be banned'); }
          structSet(p.fields, ['bIsBanned'], boolText(structGet(p.fields, ['bIsBanned']), e.target.checked));
          commit((playerName(p) || 'Player') + (e.target.checked ? ' banned' : ' unbanned'));
        }),
      })),
      h('td', {}, h('button', {
        class: 'danger',
        onclick: guard(() => {
          if (id === owner) throw new Error('Choose a different owner on the Server tab before removing this player');
          if (!confirm('Remove ' + (playerName(p) || id) + ' from the known players?')) return;
          players.splice(i, 1);
          commit('Player removed');
        }),
      }, 'Remove')));
  });

  const nameIn = h('input', { type: 'text', placeholder: 'Player name', 'aria-label': 'New player name' });
  const idIn = h('input', { type: 'text', placeholder: '32-character user ID', class: 'mono', 'aria-label': 'New player ID' });
  const template = players.find(p => p.fields);
  const add = h('div', { class: 'add-player' }, nameIn, idIn, h('button', {
    onclick: guard(() => {
      const name = nameIn.value.trim();
      const id = idIn.value.trim().toLowerCase();
      if (!name) throw new Error('Enter a player name');
      if (!PLAYER_ID.test(id)) throw new Error('User IDs are 32 characters of 0-9 and a-f');
      if (players.some(p => playerId(p).toLowerCase() === id)) throw new Error('That player is already listed');
      const mask = template ? structGet(template.fields, ['Privileges', 'PrivilegeMask']) : '14';
      players.push({ fields: [
        { key: 'UserId', value: id },
        { key: 'UserName', value: name, quoted: true },
        { key: 'Privileges', struct: [{ key: 'PrivilegeMask', value: String(mask ?? 14) }] },
        { key: 'bIsBanned', value: 'False' },
      ] });
      if (!doc.get(SERVER, 'OwnerId')) {
        doc.set(SERVER, 'OwnerId', id);
        commit(name + ' added and set as owner');
      } else commit(name + ' added');
    }),
  }, 'Add player'));

  return card('Players', 'Everyone the server knows about. Ban or unban players, rename them, or add someone by their user ID.',
    h('div', { class: 'table-wrap' }, h('table', { class: 'slots' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'User ID'), h('th', {}, 'Privileges'), h('th', {}, 'Banned'), h('th', {}, ''))),
      h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: 5, class: 'muted' }, 'No players yet.'))))),
    h('h4', { class: 'sub-head' }, 'Add a player'), add,
    h('p', { class: 'hint' }, 'A normal player has Build, Open chests and Chat. Admin gives server admin rights. The owner is set on the Server tab.'));
}

// ---------------------------------------------------------------------------
// Building settings override (BuildingSettings.ini) - protection totem limit.
// Keys and map syntax match the game's own DefaultBuildingSettings.ini.

const BUILDING = '/Script/Dominion.BuildingSettings';
const TOTEM_TAG = 'BaseBuilding.PieceType.Prop.ProtectionTotem';
const TOTEM_MAP_ENTRY = /(\(\(TagName="BaseBuilding\.PieceType\.Prop\.ProtectionTotem"\),\s*)(\d+)(\))/;

function loadBuilding(buf) {
  const { text, encoding } = decodeIni(buf);
  if (!text.includes('[' + BUILDING + ']')) return false;
  state.building = { doc: new IniDoc(text), encoding };
  return true;
}

function viewBuilding() {
  const doc = state.building.doc;
  const get = k => doc.get(BUILDING, k);
  const max = Number(get('MaximumBuildingProtectionTotems') ?? 8);
  const limited = !/^false$/i.test(get('bHasMaximumBuildingProtectionTotemCount') ?? 'True');

  // The game has two limits for totems; keep them equal so neither caps below the other.
  const setLimit = n => {
    doc.set(BUILDING, 'MaximumBuildingProtectionTotems', n);
    const map = get('PieceTagToMaxCountMap');
    if (map && TOTEM_MAP_ENTRY.test(map)) doc.set(BUILDING, 'PieceTagToMaxCountMap', map.replace(TOTEM_MAP_ENTRY, '$1' + n + '$3'));
    else doc.set(BUILDING, 'PieceTagToMaxCountMap', '(((TagName="' + TOTEM_TAG + '"), ' + n + '))');
  };

  return h('div', { class: 'stack' },
    card('Protection totems', 'Totems stop other players building near them. This file overrides the game\'s default limit.',
      h('p', { class: 'note' }, 'Experimental: not yet confirmed that the server reads this file. Save it as BuildingSettings.ini in the same folder as DedicatedServer.ini, restart the server, and check the limit in game.'),
      h('div', { class: 'grid' },
        field('Limit totems', h('input', {
          type: 'checkbox', checked: limited,
          onchange: e => { doc.set(BUILDING, 'bHasMaximumBuildingProtectionTotemCount', e.target.checked ? 'True' : 'False'); changed('Totem limit ' + (e.target.checked ? 'on' : 'off')); },
        }), 'Untick to remove the limit.'),
        field('Maximum totems', numberInput(max, guard(v => {
          if (!Number.isInteger(v) || v < 1) throw new Error('The limit must be a whole number, 1 or more');
          setLimit(v);
          changed('Totem limit set to ' + v);
        }), { min: '1', step: '1' }), 'The game ships with 8. Sets both of the game\'s totem limits.'),
      )),
  );
}

// Raw text editor for either ini file type.
function viewRawIni() {
  const holder = state.kind === 'building' ? state.building : state.server;
  const section = state.kind === 'building' ? BUILDING : SERVER;
  const ta = h('textarea', { class: 'code', spellcheck: 'false', rows: 22 });
  ta.value = holder.doc.toString().replace(/\r\n/g, '\n');
  const status = h('span', { class: 'hint' });
  return card('Raw file', 'The whole file as text.',
    h('div', { class: 'json-editor' }, ta, h('div', { class: 'actions' },
      h('button', {
        class: 'primary',
        onclick: guard(() => {
          const text = ta.value.replace(/\r?\n/g, holder.doc.eol);
          if (!text.includes('[' + section + ']')) throw new Error('The [' + section + '] section is missing');
          holder.doc = new IniDoc(text);
          if (state.kind === 'server') readPlayers();
          changed('Raw file applied');
          status.textContent = 'Applied.';
        }),
      }, 'Apply'), status)));
}

// ---------------------------------------------------------------------------
// Templates: start a new file without uploading one.

const TEMPLATES = {
  server: {
    name: 'DedicatedServer.ini',
    // OwnerId and ServerGuid are left out: the owner must be a real player (added on the
    // Players tab) and the server creates its own ID on first start.
    text: [
      ';METADATA=(Diff=true, UseCommands=true)',
      '[SectionsToSave]',
      'bCanSaveAllSections=true',
      '',
      '[/Script/Dominion.DedicatedServerSettings]',
      'PlatformPolicy=Crossplay',
      'MaxPlayers=6',
      'WorldPassword=',
      'ServerName=My Dragonwilds Server',
      'DefaultWorldName=MyWorld',
      'bAllowSendingCrashDumps=True',
      '',
    ].join('\r\n'),
    tab: 'server',
  },
  building: {
    name: 'BuildingSettings.ini',
    text: [
      '[' + BUILDING + ']',
      'bHasMaximumBuildingProtectionTotemCount=True',
      'MaximumBuildingProtectionTotems=8',
      'PieceTagToMaxCountMap=(((TagName="' + TOTEM_TAG + '"), 8))',
      '',
    ].join('\r\n'),
    tab: 'building',
  },
};

function openTemplate(key) {
  const t = TEMPLATES[key];
  loadBytes(new TextEncoder().encode(t.text), t.name, { isNew: true });
  toast('New ' + t.name + ' created. Edit it, then download.', 'ok');
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
  for (const b of document.querySelectorAll('[data-template]')) b.addEventListener('click', guard(() => openTemplate(b.dataset.template)));
  $('#reset').addEventListener('click', reset);
  window.addEventListener('beforeunload', e => { if (state.dirty || state.isNew) { e.preventDefault(); e.returnValue = ''; } });
  for (const b of document.querySelectorAll('[data-copy]')) {
    b.addEventListener('click', () => {
      navigator.clipboard?.writeText(b.dataset.copy).then(() => toast('Path copied', 'ok'), () => {});
    });
  }
}

init();
