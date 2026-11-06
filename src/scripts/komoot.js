// Reads the club's public Komoot collections (one per month). Komoot has no official
// public API; this is the JSON its own website loads, so it can change without notice.
// The website then still links every card to its collection, just without a preview.
// No DOM here: the serverless function and the browser both use it.

const API = 'https://api.komoot.de/v007/collections/';
const MONTHS = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
// Rolf names tours "7. März: Seftigen Sportivo".
const DATED = /^\s*(\d{1,2})\.\s*(\p{L}+)\s*[:–—-]\s*(.+)$/u;

export function collectionId(url) {
  try {
    const m = new URL(url).pathname.match(/\/collection\/(\d+)/);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

function tourOf(item) {
  const map = item.map_image?.src || '';
  return {
    name: String(item.name ?? '').trim(),
    km: Math.round((item.distance || 0) / 1000),
    hm: Math.round(item.elevation_up || 0),
    url: `https://www.komoot.com/tour/${item.id}`,
    map: map.replace('{width}', '640').replace('{height}', '400').replace('{crop}', 'true'),
  };
}

// "Seftigen Sportivo" and "Seftigen Veloce" on the same day → place "Seftigen",
// groups "Sportivo" and "Veloce". Anything else keeps its full name per group.
function split(tours) {
  const group = ({ rest, ...tour }, name) => ({ ...tour, name });
  if (tours.length === 1) return { place: tours[0].rest, groups: [group(tours[0], '')] };
  const last = tours.map((t) => t.rest.split(/\s+/).pop());
  if (new Set(last).size < tours.length || tours.some((t) => t.rest === t.rest.split(/\s+/).pop())) {
    return { place: tours[0].rest, groups: tours.map((t) => group(t, t.rest)) };
  }
  return { place: tours[0].rest.slice(0, -last[0].length).trim(), groups: tours.map((t, i) => group(t, last[i])) };
}

// Komoot items → rides sorted by date; tours without a date in the name come last, one ride each.
export function ridesFrom(items) {
  const dated = new Map();
  const undated = [];
  for (const item of items) {
    if (!/^tour_/.test(item.type) || item.status !== 'public') continue;
    const tour = tourOf(item);
    const m = tour.name.match(DATED);
    const month = m ? MONTHS.indexOf(m[2].toLowerCase()) + 1 : 0;
    const day = m ? Number(m[1]) : 0;
    if (!month || day < 1 || day > 31) {
      undated.push({ day: 0, month: 0, place: tour.name, groups: [{ ...tour, name: '' }] });
      continue;
    }
    const key = month * 100 + day;
    if (!dated.has(key)) dated.set(key, { day, month, tours: [] });
    dated.get(key).tours.push({ ...tour, rest: m[3].trim() });
  }
  const rides = [...dated.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, r]) => ({ day: r.day, month: r.month, ...split(r.tours) }));
  return [...rides, ...undated];
}

export async function loadCollection(id, fetchImpl = (url) => fetch(url)) {
  const items = [];
  for (let page = 0; page < 5; page += 1) {
    const r = await fetchImpl(`${API}${id}/compilation/?limit=100&page=${page}`);
    if (!r.ok) throw new Error(`Komoot ${r.status} for collection ${id}`);
    const data = await r.json();
    items.push(...(data._embedded?.items ?? []));
    if (page + 1 >= (data.page?.totalPages ?? 0)) break;
  }
  return ridesFrom(items);
}

// The next ride from today on; dates carry no year, so a past one counts for next year.
export function nextRide(collections, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let best = null;
  for (const rides of Object.values(collections)) {
    for (const ride of rides ?? []) {
      if (!ride.month) continue;
      const date = new Date(start.getFullYear(), ride.month - 1, ride.day);
      if (date < start) date.setFullYear(date.getFullYear() + 1);
      if (!best || date < best.date) best = { date, ride };
    }
  }
  return best?.ride ?? null;
}
