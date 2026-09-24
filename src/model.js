// Semantic layer over the SPUD chunk tree: resolves class definitions and property names,
// decodes values (including Dragonwilds' nested component blocks), and writes edits back
// with every affected offset and length fixed up.
import { T, readFString, encodeFString } from './spud.js';

export const TYPE_NAMES = {
  0: 'uint8', 1: 'uint16', 2: 'uint32', 3: 'uint64', 4: 'int8', 5: 'int16', 6: 'int32', 7: 'int64',
  8: 'float', 9: 'double', 20: 'vector', 21: 'rotator', 22: 'transform', 23: 'guid',
  29: 'struct', 30: 'string', 31: 'name', 32: 'text', 40: 'component', 64: 'record',
};
// Dragonwilds extension: a nested UObject (usually an actor component) stored inline as
// ClassID + its own offsets/data block.
export const COMPONENT = 40;

const FIXED = { 0: 1, 1: 2, 2: 4, 3: 8, 4: 1, 5: 2, 6: 4, 7: 8, 8: 4, 9: 8, 20: 24, 21: 24, 22: 80, 23: 16 };
const MAX_DEPTH = 8;

export function typeName(t) {
  const base = TYPE_NAMES[t & ~T.ArrayOf] ?? 'type' + (t & ~T.ArrayOf);
  return t & T.ArrayOf ? base + '[]' : base;
}

export function isEditableType(t) {
  const base = t & ~T.ArrayOf;
  return base <= 9 || base === T.String || base === T.Name || base === T.Guid ||
    base === T.Vector || base === T.Rotator;
}

const dvOf = u8 => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
const child = (node, magic) => node?.children?.find(c => c.magic === magic);

export function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const u32 = v => { const b = new Uint8Array(4); dvOf(b).setUint32(0, v, true); return b; };
const i32 = v => { const b = new Uint8Array(4); dvOf(b).setInt32(0, v, true); return b; };
const f32 = v => { const b = new Uint8Array(4); dvOf(b).setFloat32(0, v, true); return b; };

export function shortClass(path) {
  const m = /([^./]+?)(_C)?$/.exec(path);
  return m ? m[1] : path;
}

// --- metadata --------------------------------------------------------------

function readStringArray(u8) {
  const dv = dvOf(u8);
  const n = dv.getInt32(0, true);
  const out = [];
  let p = 4;
  for (let i = 0; i < n; i++) {
    const s = readFString(dv, u8, p);
    out.push(s.value);
    p += s.size;
  }
  return out;
}

function parseClassDef(u8) {
  const dv = dvOf(u8);
  const name = readFString(dv, u8, 0);
  let p = name.size;
  const n = dv.getUint16(p, true);
  p += 2;
  const props = [];
  for (let i = 0; i < n; i++) {
    props.push({ id: dv.getUint32(p, true), prefix: dv.getUint32(p + 4, true), type: dv.getUint16(p + 8, true) });
    p += 10;
  }
  return { name: name.value, props };
}

function parseMeta(meta) {
  const classNames = child(meta, 'CNIX')?.data ? readStringArray(child(meta, 'CNIX').data) : [];
  const propNames = child(meta, 'PNIX')?.data ? readStringArray(child(meta, 'PNIX').data) : [];
  const defs = new Map();
  for (const c of child(meta, 'CLST')?.children ?? []) {
    const cdef = c.magic === 'CDEF' ? c : child(c, 'CDEF');
    if (cdef?.data) {
      const d = parseClassDef(cdef.data);
      defs.set(d.name, d);
    }
  }
  return { classNames, propNames, defs };
}

// --- property blocks --------------------------------------------------------
// A block is TArray<uint32> offsets + TArray<uint8> data (the PROP payload, and the tail of a component).

export function parseBlock(u8) {
  const dv = dvOf(u8);
  const n = dv.getInt32(0, true);
  const offsets = [];
  for (let i = 0; i < n; i++) offsets.push(dv.getUint32(4 + i * 4, true));
  const dataLen = dv.getInt32(4 + n * 4, true);
  const start = 8 + n * 4;
  return { offsets, data: u8.subarray(start, start + dataLen) };
}

export function buildBlock(offsets, data) {
  const out = new Uint8Array(8 + offsets.length * 4 + data.length);
  const dv = dvOf(out);
  dv.setInt32(0, offsets.length, true);
  offsets.forEach((o, i) => dv.setUint32(4 + i * 4, o, true));
  dv.setInt32(4 + offsets.length * 4, data.length, true);
  out.set(data, 8 + offsets.length * 4);
  return out;
}

function blockSize(u8, p) {
  const dv = dvOf(u8);
  const n = dv.getInt32(p, true);
  return 8 + n * 4 + dv.getInt32(p + 4 + n * 4, true);
}

function guidString(u8, p) {
  const dv = dvOf(u8);
  let s = '';
  for (let i = 0; i < 4; i++) s += dv.getUint32(p + i * 4, true).toString(16).padStart(8, '0').toUpperCase();
  return s;
}

function readScalar(dv, p, t) {
  switch (t) {
    case 0: return dv.getUint8(p);
    case 1: return dv.getUint16(p, true);
    case 2: return dv.getUint32(p, true);
    case 3: return dv.getBigUint64(p, true);
    case 4: return dv.getInt8(p);
    case 5: return dv.getInt16(p, true);
    case 6: return dv.getInt32(p, true);
    case 7: return dv.getBigInt64(p, true);
    case 8: return dv.getFloat32(p, true);
    case 9: return dv.getFloat64(p, true);
  }
}

function decodeSingle(u8, dv, p, t) {
  if (t <= 9) return { value: readScalar(dv, p, t), size: FIXED[t] };
  if (t === T.Vector || t === T.Rotator) {
    return { value: [0, 1, 2].map(i => dv.getFloat64(p + i * 8, true)), size: 24 };
  }
  if (t === T.Guid) return { value: guidString(u8, p), size: 16 };
  if (t === T.String || t === T.Name) {
    const s = readFString(dv, u8, p);
    return { value: s.value, size: s.size };
  }
  return null;
}

export function encodeSingle(t, v) {
  if (t <= 9) {
    const out = new Uint8Array(FIXED[t]);
    const dv = dvOf(out);
    const n = t === 3 || t === 7 ? BigInt(v) : Number(v);
    switch (t) {
      case 0: dv.setUint8(0, n); break;
      case 1: dv.setUint16(0, n, true); break;
      case 2: dv.setUint32(0, n, true); break;
      case 3: dv.setBigUint64(0, n, true); break;
      case 4: dv.setInt8(0, n); break;
      case 5: dv.setInt16(0, n, true); break;
      case 6: dv.setInt32(0, n, true); break;
      case 7: dv.setBigInt64(0, n, true); break;
      case 8: dv.setFloat32(0, n, true); break;
      case 9: dv.setFloat64(0, n, true); break;
    }
    return out;
  }
  if (t === T.Vector || t === T.Rotator) {
    const out = new Uint8Array(24);
    v.forEach((x, i) => dvOf(out).setFloat64(i * 8, Number(x), true));
    return out;
  }
  if (t === T.String || t === T.Name) return encodeFString(String(v));
  if (t === T.Guid) {
    const hex = String(v).replace(/[^0-9a-fA-F]/g, '');
    if (hex.length !== 32) throw new Error('GUID must be 32 hex digits');
    const out = new Uint8Array(16);
    for (let i = 0; i < 4; i++) dvOf(out).setUint32(i * 4, parseInt(hex.slice(i * 8, i * 8 + 8), 16), true);
    return out;
  }
  throw new Error('Editing ' + typeName(t) + ' values is not supported');
}

function encodeValue(t, v) {
  if (t & T.ArrayOf) {
    const base = t & ~T.ArrayOf;
    const count = new Uint8Array(2);
    dvOf(count).setUint16(0, v.length, true);
    return concat([count, ...v.map(x => encodeSingle(base, x))]);
  }
  return encodeSingle(t, v);
}

// Decode every property of a block against its class definition.
function decodeBlock(meta, def, block, depth) {
  const { offsets, data } = parseBlock(block);
  const dv = dvOf(data);
  const valid = offsets.length === def.props.length && offsets.every(o => o <= data.length);
  const sorted = [...new Set(offsets)].sort((a, b) => a - b);
  const nextAfter = off => sorted.find(o => o > off) ?? data.length;

  const props = def.props.map((pd, index) => {
    const name = meta.propNames[pd.id] ?? '#' + pd.id;
    const prefix = pd.prefix === 0xffffffff ? '' : meta.propNames[pd.prefix] ?? '';
    const prop = { index, name, prefix, path: prefix ? prefix + '/' + name : name, type: pd.type, kind: 'opaque' };
    if (!valid || index >= offsets.length) { prop.kind = 'unknown'; return prop; }
    const off = offsets[index];
    prop.offset = off;
    try {
      if (pd.type === COMPONENT) {
        const classId = dv.getUint32(off, true);
        prop.size = 4 + blockSize(data, off + 4);
        prop.kind = 'component';
        prop.classId = classId;
        prop.className = meta.classNames[classId] ?? '?';
        const cdef = meta.defs.get(prop.className);
        const inner = data.subarray(off + 4, off + prop.size);
        if (cdef && depth < MAX_DEPTH) {
          const nested = decodeBlock(meta, cdef, inner, depth + 1);
          prop.children = nested.props;
          prop.valid = nested.valid;
        } else {
          prop.children = [];
          prop.valid = false;
        }
      } else if (pd.type & T.ArrayOf) {
        const base = pd.type & ~T.ArrayOf;
        const count = dv.getUint16(off, true);
        const items = [];
        let p = off + 2;
        for (let i = 0; i < count; i++) {
          const v = decodeSingle(data, dv, p, base);
          if (!v) throw new Error('opaque');
          items.push(v.value);
          p += v.size;
        }
        Object.assign(prop, { kind: 'array', value: items, size: p - off });
      } else {
        const v = decodeSingle(data, dv, off, pd.type);
        if (!v) throw new Error('opaque');
        Object.assign(prop, { kind: 'value', value: v.value, size: v.size });
        if ((pd.type === T.String) && /^\{\r?\n/.test(v.value)) prop.json = true;
      }
    } catch {
      prop.kind = 'opaque';
      prop.size = nextAfter(off) - off;
    }
    return prop;
  });
  return { props, valid };
}

// Replace the bytes of the property addressed by `path` (indexes, descending through components).
function patchBlock(meta, def, block, path, encode) {
  const { offsets, data } = parseBlock(block);
  const decoded = decodeBlock(meta, def, block, 0);
  if (!decoded.valid) throw new Error('This object has an unrecognised layout and is read-only.');
  const prop = decoded.props[path[0]];
  const off = offsets[path[0]];
  let bytes;
  if (path.length > 1) {
    if (prop.kind !== 'component') throw new Error('Bad property path');
    const cdef = meta.defs.get(prop.className);
    const inner = data.subarray(off + 4, off + prop.size);
    bytes = concat([u32(prop.classId), patchBlock(meta, cdef, inner, path.slice(1), encode)]);
  } else {
    bytes = encode(prop);
  }
  const delta = bytes.length - prop.size;
  const next = concat([data.subarray(0, off), bytes, data.subarray(off + prop.size)]);
  const fixed = offsets.map((o, i) => (i !== path[0] && o > off ? o + delta : o));
  return buildBlock(fixed, next);
}

// --- custom difficulty record ----------------------------------------------
// TArray<FDifficultySetting> serialised as tagged properties:
// u32 0, u32 count, then per entry: "TagName" "NameProperty" u32 0 u32 size u8 0 FString(tag) "None" f32 value

function encodeDifficultyRecord(entries) {
  const parts = [u32(0), u32(entries.length)];
  for (const { tag, value } of entries) {
    const tagStr = encodeFString(tag);
    parts.push(encodeFString('TagName'), encodeFString('NameProperty'), u32(0), u32(tagStr.length), new Uint8Array(1),
      tagStr, encodeFString('None'), f32(value));
  }
  return concat(parts);
}

// ---------------------------------------------------------------------------

export class WorldSave {
  constructor(root) {
    this.root = root;
    this.containers = [];
    this.#readGlobal();
    this.#readLevels();
  }

  // ---- objects ----
  #objectsFrom(listNode, meta, container) {
    const out = [];
    for (const o of listNode?.children ?? []) {
      if (o.magic !== 'NOBJ' && o.magic !== 'SPWN') continue;
      const dv = dvOf(o.header);
      const classId = dv.getUint32(0, true);
      const name = o.magic === 'NOBJ' ? readFString(dv, o.header, 4).value : '{' + guidString(o.header, 4) + '}';
      const className = meta.classNames[classId] ?? '?';
      out.push({
        key: container + '|' + name,
        spawned: o.magic === 'SPWN',
        name,
        className,
        shortClass: shortClass(className),
        node: o,
        propNode: child(o, 'PROP'),
        meta,
        container,
      });
    }
    return out;
  }

  #readGlobal() {
    const glob = child(this.root, 'GLOB');
    const meta = parseMeta(child(glob, 'META'));
    this.containers.push({ name: 'Global', meta, objects: this.#objectsFrom(child(glob, 'GOBS'), meta, 'Global') });
  }

  #readLevels() {
    for (const l of child(this.root, 'LVLS')?.children ?? []) {
      if (l.magic !== 'LEVL' || !l.children) continue;
      const name = readFString(dvOf(l.header), l.header, 0).value;
      const metaNode = child(l, 'META');
      if (!metaNode) continue;
      const meta = parseMeta(metaNode);
      this.containers.push({
        name,
        meta,
        objects: [...this.#objectsFrom(child(l, 'LATS'), meta, name), ...this.#objectsFrom(child(l, 'SATS'), meta, name)],
      });
    }
  }

  allObjects() {
    return this.containers.flatMap(c => c.objects);
  }

  findObject(predicate) {
    return this.allObjects().find(predicate);
  }

  // Decoded property tree; { props, valid }.
  properties(obj) {
    const def = obj.meta.defs.get(obj.className);
    if (!obj.propNode?.data || !def) return { props: [], valid: false };
    return decodeBlock(obj.meta, def, obj.propNode.data, 0);
  }

  // Resolve a property by path of indexes.
  propAt(obj, path) {
    let list = this.properties(obj).props;
    let prop;
    for (const i of path) {
      prop = list[i];
      list = prop?.children ?? [];
    }
    return prop;
  }

  setProperty(obj, path, value) {
    const def = obj.meta.defs.get(obj.className);
    obj.propNode.data = patchBlock(obj.meta, def, obj.propNode.data, path, prop => {
      if (prop.kind !== 'value' && prop.kind !== 'array') throw new Error('Property is not editable');
      return encodeValue(prop.type, value);
    });
  }

  setRawProperty(obj, path, bytes) {
    const def = obj.meta.defs.get(obj.className);
    obj.propNode.data = patchBlock(obj.meta, def, obj.propNode.data, path, () => bytes);
  }

  // Find a top-level property path by its full name.
  pathOf(obj, fullPath) {
    const i = this.properties(obj).props.findIndex(p => p.path === fullPath);
    return i < 0 ? null : [i];
  }

  // ---- JSON blobs embedded in string properties (inventories, stations, weather) ----
  jsonBlobs() {
    const out = [];
    const visit = (obj, props, path, owner) => {
      props.forEach((p, i) => {
        const here = [...path, i];
        if (p.kind === 'component' && p.children) visit(obj, p.children, here, p);
        else if (p.json) {
          out.push({ obj, path: here, name: p.name, component: owner ? shortClass(owner.className) : '', text: p.value });
        }
      });
    };
    for (const obj of this.allObjects()) {
      const { props, valid } = this.properties(obj);
      if (valid) visit(obj, props, [], null);
    }
    return out;
  }

  // ---- world settings ----
  // ISO timestamp from the save info chunk: SystemVersion, engine versions, FText title, then this.
  get headerTimestamp() {
    const hdr = child(this.root, 'INFO')?.header;
    if (!hdr) return '';
    const dv = dvOf(hdr);
    let p = 10;
    const history = dv.getInt8(p + 4);
    if (history !== -1) return '';
    p += 9 + (dv.getUint32(p + 5, true) ? readFString(dv, hdr, p + 9).size : 0);
    const iso = readFString(dv, hdr, p).value;
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString();
  }

  get persistence() {
    return this.findObject(o => o.className === '/Script/Dominion.PersistenceSubsystem');
  }

  get customInfo() {
    const cinf = child(child(this.root, 'INFO'), 'CINF');
    if (!cinf) return null;
    const u8 = cinf.data;
    const dv = dvOf(u8);
    let p = 0;
    const names = [];
    const nNames = dv.getInt32(p, true);
    p += 4;
    for (let i = 0; i < nNames; i++) {
      const s = readFString(dv, u8, p);
      names.push(s.value);
      p += s.size;
    }
    const offsets = [];
    const nOff = dv.getInt32(p, true);
    p += 4;
    for (let i = 0; i < nOff; i++, p += 4) offsets.push(dv.getUint32(p, true));
    const dataLen = dv.getInt32(p, true);
    const data = u8.slice(p + 4, p + 4 + dataLen);
    const entries = names.map((name, i) => {
      const offset = offsets[i];
      const size = (offsets[i + 1] ?? data.length) - offset;
      return { name, bytes: data.slice(offset, offset + size) };
    });
    return { node: cinf, entries };
  }

  #writeCustomInfo(entries) {
    const info = this.customInfo;
    const offsets = [];
    let o = 0;
    for (const e of entries) { offsets.push(o); o += e.bytes.length; }
    info.node.data = concat([
      i32(entries.length), ...entries.map(e => encodeFString(e.name)),
      i32(offsets.length), ...offsets.map(u32),
      i32(o), ...entries.map(e => e.bytes),
    ]);
  }

  // Typed view of the header values that matter. Types are fixed by the game.
  static CINF_TYPES = {
    WorldName: 'string', FriendlyFire: 'uint8', SurvivalDifficulty: 'int32', HardcoreState: 'int32',
    SessionPrivacy: 'int32', SessionPasswd: 'string', CrossplayEnabled: 'int32',
    WorldOwnerId: 'string', WorldNameOwner: 'string', LastSavedBy: 'string', VERSION: 'int32',
    Meta_SaveFileRevision: 'int32', WorldMapName: 'string',
  };

  headerValue(name) {
    const e = this.customInfo?.entries.find(x => x.name === name);
    if (!e) return undefined;
    const dv = dvOf(e.bytes);
    const type = WorldSave.CINF_TYPES[name] ?? (name.startsWith('Difficulty.') ? 'float' : null);
    if (type === 'string') {
      if (e.bytes.length === 4 && dv.getInt32(0, true) === 0) return '';
      return readFString(dv, e.bytes, 0).value;
    }
    if (type === 'uint8') return dv.getUint8(0);
    if (type === 'int32') return dv.getInt32(0, true);
    if (type === 'float') return dv.getFloat32(0, true);
    return undefined;
  }

  setHeaderValue(name, value) {
    const info = this.customInfo;
    const type = WorldSave.CINF_TYPES[name] ?? (name.startsWith('Difficulty.') ? 'float' : null);
    let bytes;
    if (type === 'string') bytes = encodeFString(String(value));
    else if (type === 'uint8') bytes = Uint8Array.of(Number(value) & 0xff);
    else if (type === 'int32') bytes = i32(Number(value));
    else if (type === 'float') bytes = f32(Number(value));
    else throw new Error('Unknown header field ' + name);
    const entries = info.entries;
    const idx = entries.findIndex(e => e.name === name);
    if (idx >= 0) entries[idx].bytes = bytes;
    else {
      // New difficulty entries sit together right after HardcoreState, as the game writes them.
      let at = entries.findIndex(e => e.name === 'TimeOfSave');
      if (at < 0) at = entries.length;
      entries.splice(at, 0, { name, bytes });
    }
    this.#writeCustomInfo(entries);
  }

  removeHeaderValue(name) {
    const entries = this.customInfo.entries.filter(e => e.name !== name);
    this.#writeCustomInfo(entries);
  }

  // Current custom difficulty settings from the header (the copy the game reads).
  difficulty() {
    return (this.customInfo?.entries ?? [])
      .filter(e => e.name.startsWith('Difficulty.'))
      .map(e => ({ tag: e.name, value: dvOf(e.bytes).getFloat32(0, true) }));
  }

  // Write the full difficulty set to both the header and WorldSaveSettings.
  setDifficulty(list) {
    const info = this.customInfo;
    const keep = info.entries.filter(e => !e.name.startsWith('Difficulty.'));
    let at = keep.findIndex(e => e.name === 'TimeOfSave');
    if (at < 0) at = keep.length;
    keep.splice(at, 0, ...list.map(d => ({ name: d.tag, bytes: f32(d.value) })));
    this.#writeCustomInfo(keep);
    const ps = this.persistence;
    const path = ps && this.pathOf(ps, 'WorldSaveSettings/CustomDifficultySettings');
    if (path) this.setRawProperty(ps, path, encodeDifficultyRecord(list));
  }

  // Set a WorldSaveSettings property if present.
  setSetting(name, value) {
    const ps = this.persistence;
    const path = ps && this.pathOf(ps, 'WorldSaveSettings/' + name);
    if (path) this.setProperty(ps, path, value);
  }

  getSetting(name) {
    const ps = this.persistence;
    const path = ps && this.pathOf(ps, 'WorldSaveSettings/' + name);
    return path ? this.propAt(ps, path)?.value : undefined;
  }
}
