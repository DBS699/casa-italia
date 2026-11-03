// Tour rules for the chat admin: which fields exist, what counts as valid, and
// how a list of operations changes tours.json. No network here — the model only
// ever proposes operations, and everything it proposes passes through this file.

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Editable fields, in the order they are written to tours.json. Legacy `gpx` /
// `g2gpx` values are left untouched: the chat can neither set nor clear them.
export const FIELDS = {
  date: { label: 'Datum', max: 30 },
  title: { label: 'Titel', max: 120 },
  img: { label: 'Bild', max: 200 },
  description: { label: 'Beschreibung', max: 1000 },
  meet: { label: 'Treffpunkt', max: 200 },
  g1name: { label: 'Gruppe 1 – Name', max: 80 },
  g1route: { label: 'Gruppe 1 – Route', max: 300 },
  distance: { label: 'Gruppe 1 – Distanz', max: 40 },
  elevation: { label: 'Gruppe 1 – Höhenmeter', max: 40 },
  url: { label: 'Gruppe 1 – Komoot-Link', max: 500 },
  garmin: { label: 'Gruppe 1 – Garmin-Link', max: 500 },
  g2name: { label: 'Gruppe 2 – Name', max: 80 },
  g2route: { label: 'Gruppe 2 – Route', max: 300 },
  g2distance: { label: 'Gruppe 2 – Distanz', max: 40 },
  g2elevation: { label: 'Gruppe 2 – Höhenmeter', max: 40 },
  g2url: { label: 'Gruppe 2 – Komoot-Link', max: 500 },
  g2garmin: { label: 'Gruppe 2 – Garmin-Link', max: 500 },
};
const FIELD_NAMES = Object.keys(FIELDS);
const DEFAULT_IMAGES = [1, 2, 3, 4, 5, 6].map((n) => `/assets/tours/tour-${n}.jpg`);

export class TourError extends Error {}

export const ATTACHMENT = '(neues Foto)';

// "14. März" → { month: 2, day: 14 }; null when it isn't a real calendar date.
function parseDate(value) {
  const m = String(value).trim().match(/^(\d{1,2})\.?\s+(\p{L}+)$/u);
  if (!m) return null;
  const month = MONTHS.findIndex((name) => name.toLowerCase() === m[2].toLowerCase());
  const day = Number(m[1]);
  if (month < 0 || day < 1 || day > MONTH_DAYS[month]) return null;
  return { month, day };
}

function normalizeDate(value) {
  const d = parseDate(value);
  if (!d) throw new TourError(`«${value}» ist kein gültiges Datum. Erwartet wird z. B. «14. März».`);
  return `${d.day}. ${MONTHS[d.month]}`;
}

function checkUrl(value, label, hostPattern, pathPattern) {
  let u;
  try { u = new URL(value); } catch (e) { throw new TourError(`${label}: «${value}» ist kein gültiger Link.`); }
  if (u.protocol !== 'https:' || !hostPattern.test(u.hostname) || !pathPattern.test(u.pathname)) {
    throw new TourError(`${label}: «${value}» ist kein passender Link.`);
  }
  return value;
}

function normalizeField(name, raw) {
  const spec = FIELDS[name];
  const value = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (value.length > spec.max) throw new TourError(`${spec.label} ist zu lang (höchstens ${spec.max} Zeichen).`);
  if (name === 'date') return normalizeDate(value);
  if (name === 'title' && !value) throw new TourError('Eine Tour braucht einen Titel.');
  if (!value) return '';
  if (name === 'url' || name === 'g2url') {
    return checkUrl(value, spec.label, /^(www\.)?komoot\.(com|de)$/i, /^(\/[a-z]{2}-[a-z]{2})?\/(smart)?tour\/\w+\/?$/i);
  }
  if (name === 'garmin' || name === 'g2garmin') {
    return checkUrl(value, spec.label, /(^|\.)garmin\.com$/i, /^\/./);
  }
  if (name === 'img' && (value.includes('..') || !/^\/assets\/[\w./ -]+\.(jpe?g|png|webp)$/i.test(value))) {
    throw new TourError(`${spec.label}: «${value}» ist kein Bild der Website.`);
  }
  return value;
}

function normalizeFields(fields) {
  const clean = {};
  for (const [name, raw] of Object.entries(fields || {})) {
    if (FIELD_NAMES.includes(name) && raw !== null && raw !== undefined) clean[name] = normalizeField(name, raw);
  }
  return clean;
}

function findTour(tours, op) {
  const date = String(op.date ?? '').trim();
  const title = String(op.title ?? '').trim();
  const index = tours.findIndex((t) => String(t.date).trim() === date && String(t.title).trim() === title);
  if (index < 0) throw new TourError(`Die Tour «${title}» am ${date} wurde nicht gefunden.`);
  return index;
}

function sortKey(tour) {
  const d = parseDate(tour.date);
  return d ? d.month * 100 + d.day : Infinity;
}

// Tours are shown in file order, so a new or re-dated tour goes where its date belongs.
function placeByDate(tours, tour) {
  const index = tours.findIndex((t) => sortKey(t) > sortKey(tour));
  if (index < 0) tours.push(tour); else tours.splice(index, 0, tour);
}

function newTour(fields, count) {
  if (!fields.date || !fields.title) throw new TourError('Eine neue Tour braucht mindestens Datum und Titel.');
  const tour = {};
  for (const name of FIELD_NAMES) tour[name] = fields[name] ?? '';
  if (!tour.img) tour.img = DEFAULT_IMAGES[count % DEFAULT_IMAGES.length];
  if (!tour.g1name) tour.g1name = 'Gruppo Grappa';
  const hasGroup2 = tour.g2route || tour.g2distance || tour.g2elevation || tour.g2url || tour.g2garmin;
  if (!tour.g2name && hasGroup2) tour.g2name = 'Gemeinsame Ausfahrt';
  return tour;
}

// Applies operations to a copy of the list and returns the new list plus a
// summary of what changed. Throws TourError on anything invalid; the caller's
// list is never modified.
export function applyOperations(current, operations, { attachmentPath = ATTACHMENT, hasAttachment = false } = {}) {
  if (!Array.isArray(operations) || operations.length === 0) throw new TourError('Keine Änderung angegeben.');
  if (operations.length > 30) throw new TourError('Zu viele Änderungen auf einmal.');
  const tours = current.map((t) => ({ ...t }));
  const changes = [];

  for (const op of operations) {
    const fields = normalizeFields(op.fields);
    if (op.useAttachment) {
      if (!hasAttachment) throw new TourError('Es ist kein Foto angehängt.');
      fields.img = attachmentPath;
    }
    if (op.op === 'add') {
      const tour = newTour(fields, tours.length);
      placeByDate(tours, tour);
      changes.push({ kind: 'add', date: tour.date, title: tour.title, fields: describe({}, tour) });
    } else if (op.op === 'update') {
      const index = findTour(tours, op);
      const before = tours[index];
      if (Object.keys(fields).length === 0) throw new TourError(`Für «${before.title}» ist keine Änderung angegeben.`);
      const after = { ...before, ...fields };
      if (!after.title) throw new TourError('Eine Tour braucht einen Titel.');
      const details = describe(before, after);
      if (details.length === 0) continue;
      tours.splice(index, 1);
      if (fields.date && fields.date !== before.date) placeByDate(tours, after); else tours.splice(index, 0, after);
      changes.push({ kind: 'update', date: after.date, title: after.title, fields: details });
    } else if (op.op === 'delete') {
      const index = findTour(tours, op);
      const [removed] = tours.splice(index, 1);
      changes.push({ kind: 'delete', date: removed.date, title: removed.title, fields: [] });
    } else {
      throw new TourError(`Unbekannte Änderung: ${op.op}`);
    }
  }
  if (changes.length === 0) throw new TourError('Das ist schon so eingetragen, es gibt nichts zu ändern.');
  return { tours, changes };
}

function describe(before, after) {
  const out = [];
  for (const name of FIELD_NAMES) {
    const from = before[name] ?? '';
    const to = after[name] ?? '';
    if (from !== to) out.push({ label: FIELDS[name].label, before: from, after: to });
  }
  return out;
}

// What restoring an earlier version of the list would change (used for undo).
export function diffTours(current, target) {
  const key = (t) => `${String(t.date).trim()}|${String(t.title).trim()}`;
  const targetKeys = new Set(target.map(key));
  const currentByKey = new Map(current.map((t) => [key(t), t]));
  const changes = [];
  for (const t of current) {
    if (!targetKeys.has(key(t))) changes.push({ kind: 'delete', date: t.date, title: t.title, fields: [] });
  }
  for (const t of target) {
    const before = currentByKey.get(key(t));
    if (!before) {
      changes.push({ kind: 'add', date: t.date, title: t.title, fields: describe({}, t) });
    } else {
      const fields = describe(before, t);
      if (fields.length) changes.push({ kind: 'update', date: t.date, title: t.title, fields });
    }
  }
  return changes;
}

export function summarize(changes) {
  const verb = { add: 'hinzugefügt', update: 'geändert', delete: 'gelöscht' };
  const parts = changes.map((c) => `«${c.title}» (${c.date}) ${verb[c.kind]}`);
  const text = parts.length > 3 ? `${parts.slice(0, 3).join(', ')} und ${parts.length - 3} weitere` : parts.join(', ');
  return text.replace(/\s+/g, ' ').slice(0, 200);
}
