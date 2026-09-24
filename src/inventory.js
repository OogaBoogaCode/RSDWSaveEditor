// Shared inventory helpers. Inventories are JSON objects keyed by slot number,
// plus "Version" and "MaxSlotIndex" (a high-water mark the game keeps).
import { keysOf, setOrder, num, Num } from './uejson.js';

export function slots(inv) {
  return keysOf(inv)
    .filter(k => /^\d+$/.test(k))
    .map(k => ({ slot: Number(k), item: inv[k] }))
    .sort((a, b) => a.slot - b.slot);
}

export function newItemGuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Keep slot keys in numeric order between the leading metadata and MaxSlotIndex.
function reorder(inv) {
  const keys = keysOf(inv);
  const head = keys.filter(k => !/^\d+$/.test(k) && k !== 'MaxSlotIndex');
  const nums = keys.filter(k => /^\d+$/.test(k)).sort((a, b) => a - b);
  const tail = keys.includes('MaxSlotIndex') ? ['MaxSlotIndex'] : [];
  setOrder(inv, [...head, ...nums, ...tail]);
}

export function firstFreeSlot(inv) {
  const used = new Set(slots(inv).map(s => s.slot));
  let i = 0;
  while (used.has(i)) i++;
  return i;
}

export function putItem(inv, slot, item) {
  inv[String(slot)] = item;
  if ('MaxSlotIndex' in inv && num(inv.MaxSlotIndex) < slot) inv.MaxSlotIndex = slot;
  reorder(inv);
}

export function removeItem(inv, slot) {
  delete inv[String(slot)];
  reorder(inv);
}

export function cloneItem(item) {
  const copy = {};
  setOrder(copy, keysOf(item));
  for (const k of keysOf(item)) {
    const v = item[k];
    copy[k] = v instanceof Num ? v : v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
  }
  copy.GUID = newItemGuid();
  return copy;
}

// Collect distinct item types seen in a set of inventories, with a template instance.
export function itemCatalog(inventories) {
  const seen = new Map();
  for (const inv of inventories) {
    for (const { item } of slots(inv)) {
      if (item && typeof item === 'object' && item.ItemData && !seen.has(item.ItemData)) seen.set(item.ItemData, item);
    }
  }
  return seen;
}
