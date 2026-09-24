// SPUD (Steve's Persistent Unreal Data) reader/writer for RuneScape: Dragonwilds world saves.
// Parses the chunk tree, keeps every byte it does not understand, and rebuilds chunk
// lengths on write so edited saves stay structurally valid.

// Chunks whose payload is raw data. Everything else is probed for nested chunks.
const LEAVES = new Set(['VERS', 'CNIX', 'PNIX', 'CDEF', 'PROP', 'CORA', 'CUST', 'CINF', 'SHOT', 'KILL']);

export const T = {
  UInt8: 0, UInt16: 1, UInt32: 2, UInt64: 3, Int8: 4, Int16: 5, Int32: 6, Int64: 7, Float: 8, Double: 9,
  Vector: 20, Rotator: 21, Transform: 22, Guid: 23, CustomStruct: 29, String: 30, Name: 31, Text: 32,
  OpaqueRecord: 64, ArrayOf: 0x1000,
};

const latin1 = new TextDecoder('latin1');
const utf16 = new TextDecoder('utf-16le');

export function magicAt(u8, pos) {
  return String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2], u8[pos + 3]);
}

export function readFString(dv, u8, pos) {
  const len = dv.getInt32(pos, true);
  if (len === 0) return { value: '', size: 4 };
  if (len > 0) {
    if (pos + 4 + len > u8.length) throw new Error('String out of range');
    return { value: latin1.decode(u8.subarray(pos + 4, pos + 4 + len - 1)), size: 4 + len };
  }
  const n = -len;
  if (pos + 4 + n * 2 > u8.length) throw new Error('String out of range');
  return { value: utf16.decode(u8.subarray(pos + 4, pos + 4 + (n - 1) * 2)), size: 4 + n * 2 };
}

export function encodeFString(str) {
  if (str === '') return new Uint8Array(4);
  if (/^[\x00-\x7f]*$/.test(str)) {
    const out = new Uint8Array(4 + str.length + 1);
    new DataView(out.buffer).setInt32(0, str.length + 1, true);
    for (let i = 0; i < str.length; i++) out[4 + i] = str.charCodeAt(i);
    return out;
  }
  const out = new Uint8Array(4 + (str.length + 1) * 2);
  const dv = new DataView(out.buffer);
  dv.setInt32(0, -(str.length + 1), true);
  for (let i = 0; i < str.length; i++) dv.setUint16(4 + i * 2, str.charCodeAt(i), true);
  return out;
}

function isChunkAt(u8, dv, pos, end) {
  if (pos + 8 > end) return false;
  if (!/^[A-Z]{4}$/.test(magicAt(u8, pos))) return false;
  return pos + 8 + dv.getUint32(pos + 4, true) <= end;
}

function chainsToEnd(u8, dv, p, end) {
  if (p >= end) return false;
  while (p < end) {
    if (!isChunkAt(u8, dv, p, end)) return false;
    p += 8 + dv.getUint32(p + 4, true);
  }
  return p === end;
}

// Minimum header bytes we can decode for chunk types with a known prefix.
function knownHeaderLength(magic, u8, dv, start) {
  switch (magic) {
    case 'GLOB': case 'LEVL':
      return readFString(dv, u8, start).size;
    case 'NOBJ':
      return 4 + readFString(dv, u8, start + 4).size; // ClassID + Name
    case 'SPWN':
      return 4 + 16; // ClassID + Guid
    case 'INFO': {
      // SystemVersion(u16) + engine versions (2x u32) + FText title + FString timestamp
      let p = start + 2 + 8;
      p += textSize(dv, u8, p);
      p += readFString(dv, u8, p).size;
      return p - start;
    }
  }
  return 0;
}

// FText: Flags(u32) + HistoryType(i8) + payload.
function textSize(dv, u8, p) {
  const history = dv.getInt8(p + 4);
  if (history === -1) {
    const hasInvariant = dv.getUint32(p + 5, true);
    return 9 + (hasInvariant ? readFString(dv, u8, p + 9).size : 0);
  }
  if (history === 0) {
    let q = p + 5;
    for (let i = 0; i < 3; i++) q += readFString(dv, u8, q).size;
    return q - p;
  }
  throw new Error('Unsupported FText history ' + history);
}

// Dragonwilds stores extra per-object data (engine versions, spawn transforms, class-def versions)
// ahead of nested chunks. Find the first offset from which chunks chain exactly to the end.
function findChildStart(magic, u8, dv, start, end) {
  let min = 0;
  try { min = knownHeaderLength(magic, u8, dv, start); } catch { return -1; }
  const maxPad = LEAVES.has(magic) ? -1 : 512;
  for (let pad = 0; pad <= maxPad && start + min + pad < end; pad++) {
    if (chainsToEnd(u8, dv, start + min + pad, end)) return min + pad;
  }
  return -1;
}

function parseChunk(u8, dv, pos) {
  const magic = magicAt(u8, pos);
  const length = dv.getUint32(pos + 4, true);
  const start = pos + 8;
  const end = start + length;
  const node = { magic, offset: pos };
  const h = LEAVES.has(magic) ? -1 : findChildStart(magic, u8, dv, start, end);
  if (h < 0) {
    node.data = u8.slice(start, end);
  } else {
    node.header = u8.slice(start, start + h);
    node.children = [];
    let p = start + h;
    while (p < end) {
      const child = parseChunk(u8, dv, p);
      node.children.push(child);
      p += 8 + dv.getUint32(p + 4, true);
    }
  }
  return node;
}

export function parseSave(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.length < 8 || magicAt(u8, 0) !== 'SAVE') {
    throw new Error('Not a Dragonwilds world save (missing SAVE header).');
  }
  const root = parseChunk(u8, dv, 0);
  const rootEnd = 8 + dv.getUint32(4, true);
  if (rootEnd < u8.length) root.tail = u8.slice(rootEnd);
  return root;
}

export function chunkSize(node) {
  if (node.data) return 8 + node.data.length;
  let n = 8 + node.header.length;
  for (const c of node.children) n += chunkSize(c);
  return n;
}

function writeChunk(node, out, dv, pos) {
  for (let i = 0; i < 4; i++) out[pos + i] = node.magic.charCodeAt(i);
  dv.setUint32(pos + 4, chunkSize(node) - 8, true);
  let p = pos + 8;
  if (node.data) {
    out.set(node.data, p);
    return p + node.data.length;
  }
  out.set(node.header, p);
  p += node.header.length;
  for (const c of node.children) p = writeChunk(c, out, dv, p);
  return p;
}

export function writeSave(root) {
  const out = new Uint8Array(chunkSize(root) + (root.tail ? root.tail.length : 0));
  const dv = new DataView(out.buffer);
  const p = writeChunk(root, out, dv, 0);
  if (root.tail) out.set(root.tail, p);
  return out;
}
