// Browser side of the Komoot tours: loads the collections once for the whole page
// (season cards and next ride share it) and builds the bits of markup both need.
import { collectionId, loadCollection } from './komoot.js';

let loading = null;

async function loadAll(ids) {
  try {
    const r = await fetch(`/api/komoot?ids=${ids.join(',')}`);
    if (r.ok && r.headers.get('content-type')?.includes('json')) return (await r.json()).collections;
  } catch (e) {
    // fall through
  }
  // Without the function (local dev): straight from Komoot, which allows it.
  return Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await loadCollection(id).catch(() => null)])));
}

// { [collection url]: rides | null } for every collection card on the page.
export function komootCollections() {
  if (!loading) {
    const urls = [...new Set([...document.querySelectorAll('[data-komoot]')].map((el) => el.getAttribute('data-komoot')))];
    const ids = urls.map(collectionId).filter(Boolean);
    loading = (ids.length ? loadAll(ids) : Promise.resolve({})).then((byId) =>
      Object.fromEntries(urls.map((url) => [url, byId[collectionId(url)] ?? null])));
  }
  return loading;
}

// Texts in the language shown right now; the spans keep data-i18n so the switch still works.
const strings = () => JSON.parse(document.getElementById('komoot-i18n')?.textContent || '{}');
export function text(key) {
  const all = strings();
  const dict = all[document.documentElement.lang] || all.de || {};
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict) ?? '';
}

export function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

export function translated(tag, className, key) {
  const node = el(tag, className, text(key));
  node.setAttribute('data-i18n', key);
  return node;
}

// The month in a badge or date, translated when the site has the name (März … Oktober).
export function monthLabel(month) {
  const index = month - 3;
  if (index >= 0 && index < 8) return translated('span', 'm', `months.${index}`);
  const de = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return el('span', 'm', de[month - 1]);
}

export const facts = (group) => [group.km && `${group.km} km`, group.hm && `${group.hm} hm`].filter(Boolean).join(' · ');
