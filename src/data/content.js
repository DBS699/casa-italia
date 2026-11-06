// ─────────────────────────────────────────────────────────────────────────────
// Content model. Structured, club-editable content lives in JSON files in this
// folder (members/sponsors/komoot/gallery/site.json) — these are the collections
// the Sveltia CMS edits, and this module simply reads & adapts them for the
// components. Translatable UI prose is in texts.json (edited by the chat, not the CMS).
// ─────────────────────────────────────────────────────────────────────────────

import membersData from './members.json';
import sponsorsData from './sponsors.json';
import galleryData from './gallery.json';
import siteData from './site.json';
import komootData from './komoot.json';
import textsData from './texts.json';

export const LANGS = [
  { code: 'de', label: 'DE' },
  { code: 'fr', label: 'FR' },
  { code: 'it', label: 'IT' },
  { code: 'en', label: 'EN' },
];

export const DEFAULT_LANG = 'de';

// Club identity / real data (HANDOFF "Real").
export const CLUB = {
  email: 'veloclub-casa@proton.me',
  address: { line1: 'Bühlstrasse 57', line2: '3012 Bern', country: 'Schweiz' },
  adminUrl: '/admin',
  // Footer social icons render only for the channels you fill in here.
  social: {
    instagram: '',
    facebook: '',
    strava: '',
  },
  // Free Web3Forms access key → the join form sends directly to the club inbox.
  // Empty = the form falls back to opening a pre-filled e-mail. Get a key at web3forms.com.
  joinFormKey: '',
};

// Committee — name, role, photo (from members.json; CMS-editable).
export const MEMBERS = membersData.members.map((m, i) => ({
  name: m.name, role: m.role, src: m.photo, slot: 'vcmember' + (i + 1),
}));

// Sponsors — the club's real sponsors, name/url/logo (from sponsors.json; CMS-editable).
export const SPONSORS = sponsorsData.sponsors.map((s, i) => ({
  name: s.name, url: s.url, src: s.logo, slot: 'vcsp' + (i + 1),
}));

// Komoot collections, one card per month in the season (from komoot.json; CMS-editable).
// The tours themselves live on Komoot and are loaded in the browser (scripts/komoot.js).
export const KOMOOT = komootData.collections;

// Gallery images (from gallery.json; CMS-editable).
export const GALLERY = galleryData.images.map((g, i) => ({ image: g.image, caption: g.caption || '', id: 'vcgal' + (i + 1) }));

// Site singletons — hero media (from site.json; CMS-editable).
export const SITE = siteData;

// News cards → destination links (language-independent). No old-site links:
// rankings & brochure currently route to the club e-mail until new targets exist.
export const NEWS_LINKS = {
  '01': 'mailto:veloclub-casa@proton.me?subject=Mitgliedschaft',
  '02': 'mailto:veloclub-casa@proton.me?subject=Rangliste',
  '03': 'mailto:veloclub-casa@proton.me?subject=Brosch%C3%BCre',
};

// All translatable text, per language (from texts.json; the website chat edits it).
export const I18N = textsData;
