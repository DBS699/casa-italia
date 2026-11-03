// Content rules for the chat admin: the same areas and fields as the CMS
// (public/admin/config.yml), what counts as valid, and how operations change them.
// No network here — the model only ever proposes operations, and everything it
// proposes passes through this file.

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DEFAULT_TOUR_IMAGES = [1, 2, 3, 4, 5, 6].map((n) => `/assets/tours/tour-${n}.jpg`);

export const COLLECTIONS = {
  tours: {
    area: 'Touren',
    file: 'src/data/tours.json',
    listKey: 'tours',
    match: ['date', 'title'],
    sorted: true,
    fields: {
      date: { label: 'Datum', max: 30, kind: 'date', required: true },
      title: { label: 'Titel', max: 120, required: true },
      img: { label: 'Bild', max: 300, kind: 'image' },
      description: { label: 'Beschreibung', max: 1000 },
      meet: { label: 'Treffpunkt', max: 200 },
      g1name: { label: 'Gruppe 1 – Name', max: 80 },
      g1route: { label: 'Gruppe 1 – Route', max: 400 },
      distance: { label: 'Gruppe 1 – Distanz', max: 40 },
      elevation: { label: 'Gruppe 1 – Höhenmeter', max: 40 },
      url: { label: 'Gruppe 1 – Komoot-Link', max: 500, kind: 'komoot' },
      garmin: { label: 'Gruppe 1 – Garmin-Link', max: 500, kind: 'garmin' },
      g2name: { label: 'Gruppe 2 – Name', max: 80 },
      g2route: { label: 'Gruppe 2 – Route', max: 400 },
      g2distance: { label: 'Gruppe 2 – Distanz', max: 40 },
      g2elevation: { label: 'Gruppe 2 – Höhenmeter', max: 40 },
      g2url: { label: 'Gruppe 2 – Komoot-Link', max: 500, kind: 'komoot' },
      g2garmin: { label: 'Gruppe 2 – Garmin-Link', max: 500, kind: 'garmin' },
    },
  },
  members: {
    area: 'Komitee',
    file: 'src/data/members.json',
    listKey: 'members',
    match: ['name'],
    fields: {
      name: { label: 'Name', max: 120, required: true },
      role: { label: 'Funktion', max: 120, required: true },
      photo: { label: 'Foto', max: 300, kind: 'image' },
    },
  },
  sponsors: {
    area: 'Sponsoren',
    file: 'src/data/sponsors.json',
    listKey: 'sponsors',
    match: ['name'],
    fields: {
      name: { label: 'Name', max: 120, required: true },
      url: { label: 'Webseite', max: 500, kind: 'web', required: true },
      logo: { label: 'Logo', max: 300, kind: 'image', required: true },
    },
  },
  gallery: {
    area: 'Galerie',
    file: 'src/data/gallery.json',
    listKey: 'images',
    match: ['image'],
    fields: {
      image: { label: 'Bild', max: 300, kind: 'image', required: true },
      caption: { label: 'Beschreibung', max: 300 },
    },
  },
  site: {
    area: 'Startseite',
    file: 'src/data/site.json',
    fields: {
      heroMotto: { label: 'Motto', max: 120, required: true },
      heroVideo: { label: 'Hintergrund-Video oder -Bild', max: 500, kind: 'hero', required: true },
      heroPoster: { label: 'Video-Vorschaubild', max: 300, kind: 'image', required: true },
      brochure: { label: 'Broschüre / Tourenprogramm (PDF)', max: 500, kind: 'pdf' },
    },
  },
};
export const COLLECTION_NAMES = Object.keys(COLLECTIONS);

const BLOB_URL = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[^\s?#]+$/i;
export const isBlobUrl = (value) => BLOB_URL.test(String(value ?? ''));
const MEDIA = {
  image: { attach: ['image'], ext: /\.(jpe?g|png|webp)$/i, blob: false },
  hero: { attach: ['image', 'video'], ext: /\.(jpe?g|png|webp|mp4|mov|m4v|webm)$/i, blob: true },
  pdf: { attach: ['pdf'], ext: /\.pdf$/i, blob: true },
};

export class ContentError extends Error {}

// "14. März" → { month: 2, day: 14 }; null when it isn't a real calendar date.
function parseDate(value) {
  const m = String(value).trim().match(/^(\d{1,2})\.?\s+(\p{L}+)$/u);
  if (!m) return null;
  const month = MONTHS.findIndex((name) => name.toLowerCase() === m[2].toLowerCase());
  const day = Number(m[1]);
  if (month < 0 || day < 1 || day > MONTH_DAYS[month]) return null;
  return { month, day };
}

function checkLink(value, label, test) {
  let u;
  try { u = new URL(value); } catch (e) { throw new ContentError(`${label}: «${value}» ist kein gültiger Link.`); }
  if (!test(u)) throw new ContentError(`${label}: «${value}» ist kein passender Link.`);
  return value;
}

function normalizeMedia(spec, value, attachments) {
  const media = MEDIA[spec.kind];
  if (value.startsWith('@')) {
    const attachment = attachments[value.slice(1)];
    if (!attachment) throw new ContentError(`${spec.label}: Die Datei ${value} ist nicht angehängt.`);
    if (!media.attach.includes(attachment.kind)) throw new ContentError(`${spec.label}: Diese Datei passt hier nicht.`);
    return attachment.path;
  }
  const isSitePath = value.startsWith('/assets/') && !value.includes('..');
  const isBlob = media.blob && isBlobUrl(value);
  if ((!isSitePath && !isBlob) || !media.ext.test(value)) throw new ContentError(`${spec.label}: «${value}» ist keine passende Datei der Website.`);
  return value;
}

function normalizeField(spec, raw, attachments) {
  const value = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (value.length > spec.max) throw new ContentError(`${spec.label} ist zu lang (höchstens ${spec.max} Zeichen).`);
  if (!value) return '';
  switch (spec.kind) {
    case 'date': {
      const d = parseDate(value);
      if (!d) throw new ContentError(`«${value}» ist kein gültiges Datum. Erwartet wird z. B. «14. März».`);
      return `${d.day}. ${MONTHS[d.month]}`;
    }
    case 'komoot':
      return checkLink(value, spec.label, (u) => u.protocol === 'https:' && /^(www\.)?komoot\.(com|de)$/i.test(u.hostname) && /^(\/[a-z]{2}-[a-z]{2})?\/(smart)?tour\/\w+\/?$/i.test(u.pathname));
    case 'garmin':
      return checkLink(value, spec.label, (u) => u.protocol === 'https:' && /(^|\.)garmin\.com$/i.test(u.hostname) && u.pathname.length > 1);
    case 'web':
      return checkLink(value, spec.label, (u) => /^https?:$/.test(u.protocol) && u.hostname.includes('.'));
    case 'image':
    case 'hero':
    case 'pdf':
      return normalizeMedia(spec, value, attachments);
    default:
      return value;
  }
}

function normalizeFields(collection, fields, attachments) {
  const clean = {};
  for (const [name, raw] of Object.entries(fields || {})) {
    const spec = collection.fields[name];
    if (spec && raw !== null && raw !== undefined) clean[name] = normalizeField(spec, raw, attachments);
  }
  return clean;
}

function checkRequired(collection, item) {
  for (const [name, spec] of Object.entries(collection.fields)) {
    if (spec.required && !item[name]) throw new ContentError(`${collection.area}: «${spec.label}» darf nicht leer sein.`);
  }
}

const itemTitle = (collection, item) => collection.match.map((name) => item[name]).reverse().join(' · ');
// Same format as data-chat-key on the website, so the chat page can point at the entry.
const itemKey = (collection, item) => collection.match.map((name) => item[name]).join('|');

function findItem(items, collection, op) {
  const wanted = op.match || {};
  const index = items.findIndex((item) => collection.match.every((name) => String(item[name] ?? '').trim() === String(wanted[name] ?? '').trim()));
  if (index < 0) {
    const label = collection.match.map((name) => wanted[name]).filter(Boolean).join(', ');
    throw new ContentError(`${collection.area}: «${label}» wurde nicht gefunden.`);
  }
  return index;
}

function describe(collection, before, after) {
  const out = [];
  for (const [name, spec] of Object.entries(collection.fields)) {
    const from = before[name] ?? '';
    const to = after[name] ?? '';
    if (from !== to) out.push({ name, label: spec.label, before: from, after: to });
  }
  return out;
}

function sortKey(tour) {
  const d = parseDate(tour.date);
  return d ? d.month * 100 + d.day : Infinity;
}

// Tours are shown in file order, so a new or re-dated tour goes where its date belongs.
function placeByDate(items, tour) {
  const index = items.findIndex((t) => sortKey(t) > sortKey(tour));
  if (index < 0) items.push(tour); else items.splice(index, 0, tour);
}

function placeAt(items, item, position) {
  const index = Number.isInteger(position) ? Math.min(Math.max(position - 1, 0), items.length) : items.length;
  items.splice(index, 0, item);
}

function newItem(name, collection, fields, count) {
  const item = {};
  for (const field of Object.keys(collection.fields)) item[field] = fields[field] ?? '';
  if (name === 'tours') {
    if (!item.img) item.img = DEFAULT_TOUR_IMAGES[count % DEFAULT_TOUR_IMAGES.length];
    if (!item.g1name) item.g1name = 'Gruppo Grappa';
    const hasGroup2 = item.g2route || item.g2distance || item.g2elevation || item.g2url || item.g2garmin;
    if (!item.g2name && hasGroup2) item.g2name = 'Gemeinsame Ausfahrt';
  }
  checkRequired(collection, item);
  return item;
}

function applyToList(state, name, op, attachments) {
  const collection = COLLECTIONS[name];
  const items = state[name];
  const change = (kind, item, fields = [], before = item) => ({
    area: collection.area, collection: name, kind, title: itemTitle(collection, item), key: itemKey(collection, before), afterKey: itemKey(collection, item), fields,
  });

  if (op.op === 'add') {
    const item = newItem(name, collection, normalizeFields(collection, op.fields, attachments), items.length);
    if (collection.sorted) placeByDate(items, item); else placeAt(items, item, op.position);
    return change('add', item, describe(collection, {}, item));
  }
  const index = findItem(items, collection, op);
  const before = items[index];
  if (op.op === 'delete') {
    items.splice(index, 1);
    return change('delete', before);
  }
  if (op.op === 'move') {
    if (collection.sorted) throw new ContentError('Touren werden automatisch nach Datum sortiert.');
    if (!Number.isInteger(op.position)) throw new ContentError('Es fehlt die neue Position.');
    items.splice(index, 1);
    placeAt(items, before, op.position);
    return change('move', before, [{ label: 'Position', before: String(index + 1), after: String(items.indexOf(before) + 1) }]);
  }
  if (op.op === 'update') {
    const fields = normalizeFields(collection, op.fields, attachments);
    const after = { ...before, ...fields };
    checkRequired(collection, after);
    const details = describe(collection, before, after);
    if (details.length === 0) return null;
    items.splice(index, 1);
    if (collection.sorted && fields.date && fields.date !== before.date) placeByDate(items, after); else items.splice(index, 0, after);
    return change('update', after, details, before);
  }
  throw new ContentError(`Unbekannte Änderung: ${op.op}`);
}

function applyToSite(state, op, attachments) {
  const collection = COLLECTIONS.site;
  if (op.op !== 'update') throw new ContentError('Die Startseite lässt sich nur ändern, nicht hinzufügen oder löschen.');
  const after = { ...state.site, ...normalizeFields(collection, op.fields, attachments) };
  checkRequired(collection, after);
  const details = describe(collection, state.site, after);
  if (details.length === 0) return null;
  state.site = after;
  return { area: collection.area, collection: 'site', kind: 'update', title: 'Startseite & Programm', key: '', afterKey: '', fields: details };
}

// Applies operations to a copy of the content and returns the new content plus a
// summary of what changed. `attachments` maps a file id to { kind, path }. Throws
// ContentError on anything invalid; the caller's content is never modified.
export function applyOperations(current, operations, { attachments = {} } = {}) {
  if (!Array.isArray(operations) || operations.length === 0) throw new ContentError('Keine Änderung angegeben.');
  if (operations.length > 80) throw new ContentError('Zu viele Änderungen auf einmal.');
  const state = {};
  for (const name of COLLECTION_NAMES) {
    state[name] = name === 'site' ? { ...current.site } : current[name].map((item) => ({ ...item }));
  }
  const changes = [];
  for (const op of operations) {
    if (!COLLECTION_NAMES.includes(op.collection)) throw new ContentError(`Unbekannter Bereich: ${op.collection}`);
    const change = op.collection === 'site' ? applyToSite(state, op, attachments) : applyToList(state, op.collection, op, attachments);
    if (change) changes.push(change);
  }
  if (changes.length === 0) throw new ContentError('Das ist schon so eingetragen, es gibt nichts zu ändern.');
  return { state, changes };
}

// What restoring an earlier version would change (used for undo).
export function diffContent(current, target) {
  const changes = [];
  for (const name of COLLECTION_NAMES) {
    const collection = COLLECTIONS[name];
    if (name === 'site') {
      const fields = describe(collection, current.site, target.site);
      if (fields.length) changes.push({ area: collection.area, collection: name, kind: 'update', title: 'Startseite & Programm', key: '', afterKey: '', fields });
      continue;
    }
    const key = (item) => collection.match.map((field) => String(item[field] ?? '').trim()).join('|');
    const entry = (kind, item, fields) => ({ area: collection.area, collection: name, kind, title: itemTitle(collection, item), key: itemKey(collection, item), afterKey: itemKey(collection, item), fields });
    const targetKeys = new Set(target[name].map(key));
    const currentByKey = new Map(current[name].map((item) => [key(item), item]));
    const before = changes.length;
    for (const item of current[name]) {
      if (!targetKeys.has(key(item))) changes.push(entry('delete', item, []));
    }
    for (const item of target[name]) {
      const old = currentByKey.get(key(item));
      if (!old) {
        changes.push(entry('add', item, describe(collection, {}, item)));
      } else {
        const fields = describe(collection, old, item);
        if (fields.length) changes.push(entry('update', item, fields));
      }
    }
    if (changes.length === before && JSON.stringify(current[name].map(key)) !== JSON.stringify(target[name].map(key))) {
      changes.push({ area: collection.area, collection: name, kind: 'move', title: 'Reihenfolge', key: '', afterKey: '', fields: [] });
    }
  }
  return changes;
}

export function summarize(changes) {
  const verb = { add: 'hinzugefügt', update: 'geändert', delete: 'gelöscht', move: 'verschoben' };
  const parts = changes.map((c) => `«${c.title}» ${verb[c.kind]}`);
  const text = parts.length > 3 ? `${parts.slice(0, 3).join(', ')} und ${parts.length - 3} weitere` : parts.join(', ');
  return text.replace(/\s+/g, ' ').slice(0, 200);
}
