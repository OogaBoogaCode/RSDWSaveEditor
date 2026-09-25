// JSON parse/stringify matching Unreal's FJsonSerializer "pretty" output:
// tab indentation, CRLF line endings, objects open on their own line after a key,
// arrays open inline. Numbers keep their original text so untouched values round-trip exactly.

const RAW = Symbol('rawNumber');
// Original key order. JS objects hoist integer-like keys (inventory slots), so we track it ourselves.
export const ORDER = Symbol('keyOrder');

export function keysOf(obj) {
  const own = Object.keys(obj);
  const order = obj[ORDER];
  if (!order) return own;
  const present = new Set(own);
  const out = order.filter(k => present.has(k));
  const seen = new Set(out);
  for (const k of own) if (!seen.has(k)) out.push(k);
  return out;
}

export function setOrder(obj, keys) {
  Object.defineProperty(obj, ORDER, { value: keys, enumerable: false, configurable: true, writable: true });
}

// Wrap numbers so the original lexeme is preserved (e.g. 888.43836560100317).
export class Num {
  constructor(text) { this[RAW] = text; }
  valueOf() { return Number(this[RAW]); }
  toString() { return this[RAW]; }
  toJSON() { return Number(this[RAW]); }
}

export function num(v) {
  if (v instanceof Num) return Number(v[RAW]);
  return v;
}

export function parse(text) {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\r\n'.includes(text[i])) i++; };
  const value = () => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const obj = {};
      const order = [];
      setOrder(obj, order);
      ws();
      if (text[i] === '}') { i++; return obj; }
      for (;;) {
        ws();
        const k = string();
        ws();
        if (text[i++] !== ':') throw new SyntaxError('Expected : at ' + i);
        obj[k] = value();
        order.push(k);
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return obj; }
        throw new SyntaxError('Expected , or } at ' + i);
      }
    }
    if (c === '[') {
      i++;
      const arr = [];
      ws();
      if (text[i] === ']') { i++; return arr; }
      for (;;) {
        arr.push(value());
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return arr; }
        throw new SyntaxError('Expected , or ] at ' + i);
      }
    }
    if (c === '"') return string();
    if (text.startsWith('true', i)) { i += 4; return true; }
    if (text.startsWith('false', i)) { i += 5; return false; }
    if (text.startsWith('null', i)) { i += 4; return null; }
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 64));
    if (!m) throw new SyntaxError('Unexpected token at ' + i);
    i += m[0].length;
    return new Num(m[0]);
  };
  const string = () => {
    if (text[i] !== '"') throw new SyntaxError('Expected string at ' + i);
    let j = i + 1;
    while (text[j] !== '"') { if (text[j] === '\\') j++; j++; }
    const s = JSON.parse(text.slice(i, j + 1));
    i = j + 1;
    return s;
  };
  const v = value();
  return v;
}

function str(s) {
  // Unreal escapes the same set JSON.stringify does for our purposes.
  return JSON.stringify(s);
}

function numText(v) {
  if (v instanceof Num) return v[RAW];
  if (typeof v === 'bigint') return v.toString();
  if (!Number.isFinite(v)) return '0';
  return String(v);
}

// Line ending of an existing text: older game versions write CRLF, newer ones LF.
export function eolOf(text) {
  return /\r\n/.test(text) ? '\r\n' : /\n/.test(text) ? '\n' : '\r\n';
}

export function stringify(value, indent = 0, nl = '\r\n') {
  const tabs = n => '\t'.repeat(n);
  const scalar = v => (v === null ? 'null' : typeof v === 'boolean' ? String(v) : typeof v === 'string' ? str(v) : numText(v));
  const isContainer = v => v !== null && typeof v === 'object' && !(v instanceof Num);

  const write = (v, depth) => {
    if (!isContainer(v)) return scalar(v);
    if (Array.isArray(v)) {
      if (v.length === 0) return '[]';
      // Unreal condenses arrays of numbers/bools onto one line
      if (v.every(x => typeof x === 'number' || typeof x === 'boolean' || x instanceof Num)) {
        return '[ ' + v.map(scalar).join(', ') + ' ]';
      }
      const items = v.map(x => tabs(depth + 1) + write(x, depth + 1));
      return '[' + nl + items.join(',' + nl) + nl + tabs(depth) + ']';
    }
    const keys = keysOf(v);
    if (keys.length === 0) return '{' + nl + tabs(depth) + '}';
    const parts = keys.map(k => {
      const x = v[k];
      if (isContainer(x) && !Array.isArray(x)) {
        return tabs(depth + 1) + str(k) + ':' + nl + tabs(depth + 1) + write(x, depth + 1);
      }
      return tabs(depth + 1) + str(k) + ': ' + write(x, depth + 1);
    });
    return '{' + nl + parts.join(',' + nl) + nl + tabs(depth) + '}';
  };
  return write(value, indent);
}
