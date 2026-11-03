// Picks the pages of a club programme that hold the tours. Everything else stays in
// the browser: these programmes also contain the member list with home addresses,
// which must not leave for the AI service.

const TOUR_PAGE = /\b(KM|HM)\s*\d+|\b\d+\s*(km|hm)\b/i;
const POSTAL_ADDRESS = /(?<![\d.])[1-9]\d{3}\s+\p{Lu}/gu;
const MAX_ADDRESSES = 3;

// The PDF's letter spacing splits numbers up: "0 1 .0 3 .20 2 6" is 01.03.2026.
export function cleanPageText(text) {
  return String(text)
    .replace(/(?<=\d)\s*\.\s*(?=\d)/g, '.')
    .replace(/(?<=\d)[ \t]+(?=\d)/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// `pages` is the text per page; returns the page numbers used and their text.
export function pickTourPages(pages) {
  const cleaned = pages.map((text, i) => ({ number: i + 1, text: cleanPageText(text) }));
  const hasAddresses = ({ text }) => (text.match(POSTAL_ADDRESS) || []).length >= MAX_ADDRESSES;
  const tours = cleaned.filter((page) => TOUR_PAGE.test(page.text) && !hasAddresses(page));
  if (tours.length === 0) return { numbers: [], text: '' };
  const meeting = cleaned.filter((page) => /Treffpunkt/i.test(page.text) && page.text.length < 400 && !hasAddresses(page) && !tours.includes(page));
  const chosen = [...meeting, ...tours].sort((a, b) => a.number - b.number);
  return {
    numbers: chosen.map((page) => page.number),
    text: chosen.map((page) => page.text).join('\n\n'),
  };
}
