// Unreal-style .ini handling for DedicatedServer.ini. Lines are kept verbatim unless edited,
// so comments, metadata, unknown keys and ordering survive a round trip.

// --- encoding -------------------------------------------------------------

// Unreal writes UTF-16LE (with BOM) when a config holds non-ASCII text, otherwise plain bytes.
export function decodeIni(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf16' };
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf8bom' };
  const text = new TextDecoder('utf-8').decode(bytes);
  // A BOM-less file that is pure ASCII could be either; remember that so new non-ASCII text
  // switches it to UTF-16 (as Unreal would), while an existing UTF-8 file stays UTF-8.
  return { text, encoding: /[^\x00-\x7f]/.test(text) ? 'utf8' : 'ascii' };
}

export function encodeIni(text, encoding) {
  const enc = encoding === 'ascii' ? (/[^\x00-\x7f]/.test(text) ? 'utf16' : 'utf8') : encoding;
  if (enc === 'utf16') {
    const out = new Uint8Array(2 + text.length * 2);
    out[0] = 0xff; out[1] = 0xfe;
    const dv = new DataView(out.buffer);
    for (let i = 0; i < text.length; i++) dv.setUint16(2 + i * 2, text.charCodeAt(i), true);
    return { bytes: out, encoding: enc };
  }
  const body = new TextEncoder().encode(text);
  if (enc === 'utf8bom') {
    const out = new Uint8Array(3 + body.length);
    out.set([0xef, 0xbb, 0xbf]);
    out.set(body, 3);
    return { bytes: out, encoding: enc };
  }
  return { bytes: body, encoding: enc };
}

// --- document -------------------------------------------------------------

export class IniDoc {
  constructor(text) {
    this.eol = text.includes('\r\n') ? '\r\n' : '\n';
    this.finalNewline = /\r?\n$/.test(text);
    const body = this.finalNewline ? text.replace(/\r?\n$/, '') : text;
    let section = null;
    this.lines = body.split(/\r?\n/).map(raw => {
      const sec = /^\s*\[(.+)\]\s*$/.exec(raw);
      if (sec) { section = sec[1]; return { type: 'section', raw, section }; }
      const kv = /^([+\-.!]?)([^=;#\s][^=]*?)\s*=(.*)$/.exec(raw);
      if (kv && section && !/^\s*[;#]/.test(raw)) return { type: 'kv', raw, section, op: kv[1], key: kv[2], value: kv[3] };
      return { type: 'other', raw, section };
    });
  }

  toString() {
    return this.lines.map(l => (l.type === 'kv' && l.dirty ? l.op + l.key + '=' + l.value : l.raw)).join(this.eol) + (this.finalNewline ? this.eol : '');
  }

  entries(section, key) {
    return this.lines.filter(l => l.type === 'kv' && l.section === section && l.key === key);
  }

  get(section, key) {
    const e = this.entries(section, key);
    return e.length ? e[e.length - 1].value : undefined;
  }

  // Set a single-valued key; appended to the end of its section when missing.
  set(section, key, value) {
    const e = this.entries(section, key);
    if (e.length) {
      const l = e[e.length - 1];
      l.value = String(value);
      l.dirty = true;
      return;
    }
    this.#insertAtSectionEnd(section, { type: 'kv', section, op: '', key, value: String(value), dirty: true });
  }

  // Replace every line of a repeated key (e.g. KnownPlayerList) with the given values,
  // keeping them where the first one was.
  setList(section, key, values) {
    const idxs = this.lines.map((l, i) => (l.type === 'kv' && l.section === section && l.key === key ? i : -1)).filter(i => i >= 0);
    const fresh = values.map(v => ({ type: 'kv', section, op: '', key, value: v, dirty: true }));
    if (!idxs.length) {
      fresh.forEach(f => this.#insertAtSectionEnd(section, f));
      return;
    }
    const at = idxs[0];
    for (const i of idxs.reverse()) this.lines.splice(i, 1);
    this.lines.splice(at, 0, ...fresh);
  }

  sections() {
    return [...new Set(this.lines.filter(l => l.type === 'section').map(l => l.section))];
  }

  keys(section) {
    return [...new Set(this.lines.filter(l => l.type === 'kv' && l.section === section).map(l => l.key))];
  }

  #insertAtSectionEnd(section, line) {
    let start = this.lines.findIndex(l => l.type === 'section' && l.section === section);
    if (start < 0) {
      if (this.lines.length && this.lines[this.lines.length - 1].raw.trim() !== '') this.lines.push({ type: 'other', raw: '', section: null });
      this.lines.push({ type: 'section', raw: '[' + section + ']', section });
      start = this.lines.length - 1;
    }
    let end = start + 1;
    while (end < this.lines.length && this.lines[end].type !== 'section') end++;
    // Before trailing blank lines of the section.
    while (end - 1 > start && this.lines[end - 1].type === 'other' && this.lines[end - 1].raw.trim() === '') end--;
    this.lines.splice(end, 0, line);
  }
}

// --- struct text: (Key=Value,Key="Quoted",Nested=(A=1)) --------------------

export function parseStruct(text) {
  let i = 0;
  const s = text.trim();
  const parseValue = () => {
    if (s[i] === '"') {
      let j = i + 1, out = '';
      while (j < s.length && s[j] !== '"') {
        if (s[j] === '\\' && j + 1 < s.length) { out += s[j + 1]; j += 2; } else out += s[j++];
      }
      i = j + 1;
      return { quoted: true, value: out };
    }
    if (s[i] === '(') return { struct: parseObj() };
    let j = i;
    while (j < s.length && s[j] !== ',' && s[j] !== ')') j++;
    const v = s.slice(i, j);
    i = j;
    return { value: v };
  };
  const parseObj = () => {
    if (s[i] !== '(') throw new Error('Expected (');
    i++;
    const fields = [];
    while (i < s.length && s[i] !== ')') {
      const eq = s.indexOf('=', i);
      if (eq < 0) throw new Error('Expected =');
      const key = s.slice(i, eq).trim();
      i = eq + 1;
      fields.push({ key, ...parseValue() });
      if (s[i] === ',') i++;
    }
    if (s[i] !== ')') throw new Error('Unclosed (');
    i++;
    return fields;
  };
  const fields = parseObj();
  if (i !== s.length) throw new Error('Unexpected text after struct');
  return fields;
}

export function stringifyStruct(fields) {
  return '(' + fields.map(f => f.key + '=' + (f.struct ? stringifyStruct(f.struct)
    : f.quoted ? '"' + String(f.value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : f.value)).join(',') + ')';
}

export function structGet(fields, path) {
  let cur = fields;
  let f;
  for (const k of path) {
    f = cur?.find(x => x.key === k);
    if (!f) return undefined;
    cur = f.struct;
  }
  return f.struct ?? f.value;
}

export function structSet(fields, path, value, { quoted = false } = {}) {
  let cur = fields;
  for (let n = 0; n < path.length; n++) {
    let f = cur.find(x => x.key === path[n]);
    const last = n === path.length - 1;
    if (!f) { f = last ? { key: path[n] } : { key: path[n], struct: [] }; cur.push(f); }
    if (last) { f.value = String(value); if (quoted) f.quoted = true; delete f.struct; }
    else { if (!f.struct) f.struct = []; cur = f.struct; }
  }
}
