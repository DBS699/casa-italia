// What the chat page marks on the website next to it. No DOM here, so it can be tested.

const SECTION_LIMIT = 6;
const AREA_LABEL = { tours: 'Touren', komoot: 'Komoot-Ordner', members: 'Komitee', sponsors: 'Sponsoren', gallery: 'Galerie', site: 'Startseite' };
const SITE_LABEL = { heroMotto: 'Motto', brochure: 'Tourenprogramm (PDF)' };

function proposedMark(change) {
  if (change.collection === 'texts') return [{ collection: 'texts', key: change.key, tone: 'update', note: 'Text wird geändert' }];
  if (change.collection === 'site') {
    return change.fields.map((f) => ({ collection: 'site', key: f.name, tone: 'update', note: `${f.label}: wird geändert` }));
  }
  if (change.kind === 'add') return [{ collection: change.collection, key: '', tone: 'add', note: `Kommt neu dazu: ${change.title}` }];
  if (change.kind === 'delete') return [{ collection: change.collection, key: change.key, tone: 'delete', note: 'Wird gelöscht' }];
  if (change.kind === 'move') return [{ collection: change.collection, key: change.key, tone: 'update', note: 'Wird verschoben' }];
  return [{ collection: change.collection, key: change.key, tone: 'update', note: 'Wird geändert' }];
}

function publishedMark(change) {
  if (change.collection === 'site') {
    return change.fields.map((f) => ({ collection: 'site', key: f.name, tone: 'update', note: `${f.label}: jetzt online` }));
  }
  if (change.kind === 'delete') return [{ collection: change.collection, key: '', tone: 'delete', note: `Entfernt: ${change.title}` }];
  return [{ collection: change.collection, key: change.afterKey, tone: 'update', note: 'Jetzt online' }];
}

// A whole programme would plaster the page with markers: many changes in one
// area become a single marker around that area.
export function marksForChanges(changes, { published = false } = {}) {
  const marks = [];
  const groups = new Map();
  changes.forEach((c) => groups.set(c.collection, [...(groups.get(c.collection) || []), c]));
  for (const [collection, group] of groups) {
    // Texts are all over the page, there is no one area to put a marker around.
    if (group.length > SECTION_LIMIT && collection !== 'texts') {
      marks.push({ collection, key: '', tone: 'update', note: `${group.length} Änderungen${published ? ' jetzt online' : ' in diesem Bereich'}` });
    } else {
      group.forEach((c) => marks.push(...(published ? publishedMark(c) : proposedMark(c))));
    }
  }
  return marks;
}

// `key` is empty when a whole area was clicked; `shown` is the text as it appears on the page.
export function pickLabel(collection, key, shown = '') {
  if (!key) return `Bereich ${AREA_LABEL[collection]}`;
  if (collection === 'texts') {
    const text = shown.replace(/\s+/g, ' ').trim();
    return `Text «${text.length > 40 ? `${text.slice(0, 40)} …` : text}»`;
  }
  if (collection === 'tours') {
    const [date, title] = key.split('|');
    return `Tour «${title}» am ${date}`;
  }
  if (collection === 'komoot') return `Komoot-Ordner «${key}»`;
  if (collection === 'members') return `Komitee: ${key}`;
  if (collection === 'sponsors') return `Sponsor: ${key}`;
  if (collection === 'gallery') return `Galeriebild ${key.split('/').pop()}`;
  return SITE_LABEL[key] || 'Startseite';
}

// The note in front of a message that tells the model what "dieser" refers to.
export function pickContext(pick) {
  const key = pick.key ? `, Schlüssel: ${pick.key}` : '';
  return `[Ausgewählt auf der Website: ${pick.label}; collection: ${pick.collection}${key}]`;
}
