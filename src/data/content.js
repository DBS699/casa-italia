// ─────────────────────────────────────────────────────────────────────────────
// Content model. Structured, club-editable content lives in JSON files in this
// folder (members/sponsors/tours/gallery/site.json) — these are the collections
// the Sveltia CMS edits, and this module simply reads & adapts them for the
// components. Translatable UI prose stays in I18N below (developer-managed).
// ─────────────────────────────────────────────────────────────────────────────

import membersData from './members.json';
import sponsorsData from './sponsors.json';
import toursData from './tours.json';
import galleryData from './gallery.json';
import siteData from './site.json';

export const LANGS = [
  { code: 'de', label: 'DE' },
  { code: 'fr', label: 'FR' },
  { code: 'it', label: 'IT' },
  { code: 'en', label: 'EN' },
];

export const DEFAULT_LANG = 'de';

// Club identity / real data (HANDOFF "Real").
export const CLUB = {
  email: 'vorstand@veloclubcasaitalia.ch',
  address: { line1: 'Bühlstrasse 57', line2: '3012 Bern', country: 'Schweiz' },
  adminUrl: '/admin',
  // Footer social icons render only for the channels you fill in here.
  social: {
    instagram: '',
    facebook: '',
    strava: '',
  },
};

// Committee — name, role, photo (from members.json; CMS-editable).
export const MEMBERS = membersData.members.map((m, i) => ({
  name: m.name, role: m.role, src: m.photo, slot: 'vcmember' + (i + 1),
}));

// Sponsors — the club's real sponsors, name/url/logo (from sponsors.json; CMS-editable).
export const SPONSORS = sponsorsData.sponsors.map((s, i) => ({
  name: s.name, url: s.url, src: s.logo, slot: 'vcsp' + (i + 1),
}));

// Season tours — date, title, optional link, image (from tours.json; CMS-editable).
export const TOURS = toursData.tours;

// Gallery images (from gallery.json; CMS-editable).
export const GALLERY = galleryData.images.map((g, i) => ({ image: g.image, id: 'vcgal' + (i + 1) }));

// Site singletons — hero media (from site.json; CMS-editable).
export const SITE = siteData;

// News cards → destination links (language-independent). No old-site links:
// rankings & brochure currently route to the club e-mail until new targets exist.
export const NEWS_LINKS = {
  '01': 'mailto:vorstand@veloclubcasaitalia.ch?subject=Mitgliedschaft',
  '02': 'mailto:vorstand@veloclubcasaitalia.ch?subject=Rangliste',
  '03': 'mailto:vorstand@veloclubcasaitalia.ch?subject=Brosch%C3%BCre',
};

// All translatable text, per language. Lifted verbatim from the design's T object.
export const I18N = {
  de: {
    nav: { club: 'Verein', komitee: 'Komitee', touren: 'Touren', galerie: 'Galerie', sponsoren: 'Sponsoren', aktuelles: 'Aktuelles' },
    heroKicker: 'Velo-Club · seit 1985',
    heroSub: 'Leidenschaft auf zwei Rädern',
    heroIntro: "Gemeinsame Ausfahrten, Touren und Freundschaft – die ganze Saison hindurch.",
    ctaJoin: 'Mitglied werden', ctaSeason: 'Saison entdecken',
    aboutKicker: 'Über den Club', aboutTitle: 'Eine Familie auf dem Sattel.',
    aboutBody1: 'Wir sind ein italienischer Velo-Club mit Heimat in Bern. Was uns verbindet, ist einfach: die Freude am Fahren, gute Gesellschaft und ein Espresso am Ziel.',
    aboutBody2: 'Von gemütlichen Ausfahrten bis zu längeren Touren – bei uns findet jede und jeder den passenden Rhythmus.',
    stat: [{ n: '1985', l: 'Gegründet' }, { n: 'Bern', l: 'Heimat' }, { n: 'März–Okt', l: 'Saison' }],
    seasonKicker: 'Saison 2024', seasonTitle: 'Acht Monate im Sattel.',
    seasonBody: 'Von März bis Oktober sind wir unterwegs. Das detaillierte Tourenprogramm erhalten Mitglieder per E-Mail.',
    months: ['März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober'],
    newsKicker: 'Aktuelles', newsTitle: 'Mitmachen & informieren.',
    komiteeKicker: 'Komitee', komiteeTitle: 'Wer den Verein lenkt.', komiteeBody: 'Sieben ehrenamtliche Köpfe halten den Velo-Club am Laufen – von der Tourenplanung bis zur Festwirtschaft.',
    roles: ['Präsident', 'Vize-Präsident', 'Kassier', 'Sekretär', 'Tourenchef', 'Eventchef', 'Materialwart', 'Beisitzer', 'Revisor'],
    memberHint: 'Foto',
    galleryKicker: 'Galerie', galleryTitle: 'Momente aus dem Sattel.',
    galleryBody: 'Fotos und Videos unserer Ausfahrten und Anlässe.', galleryCta: 'Zur Galerie', galleryHint: 'Bild ablegen',
    sponsorsKicker: 'Partner', sponsorsTitle: 'Unsere Sponsoren.',
    sponsorsBody: 'Danke an alle, die den Club unterstützen. Möchten Sie Partner werden?', sponsorsCta: 'Sponsor werden', sponsorHint: 'Logo',
    footAddrLabel: 'Adresse', footMailLabel: 'E-Mail', footLinksLabel: 'Entdecken',
    footRights: "© 2024 Velo-Club Casa d'Italia Berna",
    cards: [
      { n: '01', title: 'Mitglied werden', body: 'Lust mitzufahren? Schreib uns – wir freuen uns auf dich.', cta: 'Anfrage senden' },
      { n: '02', title: 'Rangliste 2023', body: 'Resultate und Platzierungen der vergangenen Saison.', cta: 'Rangliste ansehen' },
      { n: '03', title: 'Broschüre 2025', body: 'Unsere Vereinsbroschüre – jetzt online durchblättern.', cta: 'Broschüre öffnen' },
    ],
  },
  fr: {
    nav: { club: 'Club', komitee: 'Comité', touren: 'Sorties', galerie: 'Galerie', sponsoren: 'Sponsors', aktuelles: 'Actualités' },
    heroKicker: 'Vélo-Club · depuis 1985',
    heroSub: 'La passion sur deux roues',
    heroIntro: "Sorties, tours et amitié – tout au long de la saison.",
    ctaJoin: 'Devenir membre', ctaSeason: 'Voir la saison',
    aboutKicker: 'Le club', aboutTitle: 'Une famille en selle.',
    aboutBody1: "Nous sommes un vélo-club italien établi à Berne. Ce qui nous unit est simple : le plaisir de rouler, la bonne compagnie et un espresso à l'arrivée.",
    aboutBody2: 'Des sorties tranquilles aux tours plus longs, chacun trouve son rythme chez nous.',
    stat: [{ n: '1985', l: 'Fondé' }, { n: 'Berne', l: 'Origine' }, { n: 'Mars–Oct', l: 'Saison' }],
    seasonKicker: 'Saison 2024', seasonTitle: 'Huit mois en selle.',
    seasonBody: "De mars à octobre, nous roulons. Le programme détaillé des sorties est envoyé aux membres par e-mail.",
    months: ['Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre'],
    newsKicker: 'Actualités', newsTitle: "Participer & s'informer.",
    komiteeKicker: 'Comité', komiteeTitle: 'Celles et ceux qui mènent le club.', komiteeBody: 'Sept bénévoles font tourner le vélo-club – de la planification des sorties à la buvette.',
    roles: ['Président', 'Vice-président', 'Caissier', 'Secrétaire', 'Chef des sorties', 'Chef événements', 'Resp. matériel', 'Assesseur', 'Vérificateur'],
    memberHint: 'Photo',
    galleryKicker: 'Galerie', galleryTitle: 'Des instants en selle.',
    galleryBody: 'Photos et vidéos de nos sorties et événements.', galleryCta: 'Voir la galerie', galleryHint: 'Déposer une image',
    sponsorsKicker: 'Partenaires', sponsorsTitle: 'Nos sponsors.',
    sponsorsBody: 'Merci à tous ceux qui soutiennent le club. Envie de devenir partenaire ?', sponsorsCta: 'Devenir sponsor', sponsorHint: 'Logo',
    footAddrLabel: 'Adresse', footMailLabel: 'E-mail', footLinksLabel: 'Découvrir',
    footRights: "© 2024 Vélo-Club Casa d'Italia Berna",
    cards: [
      { n: '01', title: 'Devenir membre', body: "Envie de rouler avec nous ? Écris-nous, on t'attend.", cta: 'Envoyer une demande' },
      { n: '02', title: 'Classement 2023', body: 'Résultats et classements de la saison écoulée.', cta: 'Voir le classement' },
      { n: '03', title: 'Brochure 2025', body: 'La brochure du club, à feuilleter en ligne.', cta: 'Ouvrir la brochure' },
    ],
  },
  it: {
    nav: { club: 'Club', komitee: 'Comitato', touren: 'Uscite', galerie: 'Galleria', sponsoren: 'Sponsor', aktuelles: 'Novità' },
    heroKicker: 'Velo-Club · dal 1985',
    heroSub: 'La passione su due ruote',
    heroIntro: "Uscite, gite e amicizia – per tutta la stagione.",
    ctaJoin: 'Diventa socio', ctaSeason: 'Scopri la stagione',
    aboutKicker: 'Il club', aboutTitle: 'Una famiglia in sella.',
    aboutBody1: "Siamo un velo-club italiano con casa a Berna. Ciò che ci unisce è semplice: il piacere di pedalare, la buona compagnia e un espresso all'arrivo.",
    aboutBody2: 'Dalle uscite tranquille alle gite più lunghe, da noi ognuno trova il proprio ritmo.',
    stat: [{ n: '1985', l: 'Fondato' }, { n: 'Berna', l: 'Casa' }, { n: 'Mar–Ott', l: 'Stagione' }],
    seasonKicker: 'Stagione 2024', seasonTitle: 'Otto mesi in sella.',
    seasonBody: 'Da marzo a ottobre siamo in strada. Il programma dettagliato delle uscite viene inviato ai soci via e-mail.',
    months: ['Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre'],
    newsKicker: 'Novità', newsTitle: 'Partecipa e informati.',
    komiteeKicker: 'Comitato', komiteeTitle: 'Chi guida il club.', komiteeBody: 'Sette volontari mandano avanti il velo-club – dalla pianificazione delle uscite alla festa.',
    roles: ['Presidente', 'Vicepresidente', 'Cassiere', 'Segretario', 'Capo gite', 'Capo eventi', 'Resp. materiale', 'Consigliere', 'Revisore'],
    memberHint: 'Foto',
    galleryKicker: 'Galleria', galleryTitle: 'Momenti in sella.',
    galleryBody: 'Foto e video delle nostre uscite ed eventi.', galleryCta: 'Vai alla galleria', galleryHint: "Trascina un'immagine",
    sponsorsKicker: 'Partner', sponsorsTitle: 'I nostri sponsor.',
    sponsorsBody: 'Grazie a tutti coloro che sostengono il club. Vuoi diventare partner?', sponsorsCta: 'Diventa sponsor', sponsorHint: 'Logo',
    footAddrLabel: 'Indirizzo', footMailLabel: 'E-mail', footLinksLabel: 'Esplora',
    footRights: "© 2024 Velo-Club Casa d'Italia Berna",
    cards: [
      { n: '01', title: 'Diventa socio', body: 'Voglia di pedalare con noi? Scrivici, ti aspettiamo.', cta: 'Invia richiesta' },
      { n: '02', title: 'Classifica 2023', body: 'Risultati e piazzamenti della stagione scorsa.', cta: 'Vedi la classifica' },
      { n: '03', title: 'Brochure 2025', body: 'La brochure del club, sfogliala online.', cta: 'Apri la brochure' },
    ],
  },
  en: {
    nav: { club: 'Club', komitee: 'Committee', touren: 'Tours', galerie: 'Gallery', sponsoren: 'Sponsors', aktuelles: 'Latest' },
    heroKicker: 'Velo-Club · since 1985',
    heroSub: 'Passion on two wheels',
    heroIntro: "Group rides, tours and friendship – all season long.",
    ctaJoin: 'Become a member', ctaSeason: 'See the season',
    aboutKicker: 'The club', aboutTitle: 'A family in the saddle.',
    aboutBody1: "We're an Italian velo-club at home in Bern. What unites us is simple: the joy of riding, good company and an espresso at the finish.",
    aboutBody2: 'From easy rides to longer tours, everyone finds their rhythm with us.',
    stat: [{ n: '1985', l: 'Founded' }, { n: 'Bern', l: 'Home' }, { n: 'Mar–Oct', l: 'Season' }],
    seasonKicker: 'Season 2024', seasonTitle: 'Eight months in the saddle.',
    seasonBody: "From March to October we're on the road. Members receive the detailed tour programme by e-mail.",
    months: ['March', 'April', 'May', 'June', 'July', 'August', 'September', 'October'],
    newsKicker: 'Latest', newsTitle: 'Join in & stay informed.',
    komiteeKicker: 'Committee', komiteeTitle: 'The people who run the club.', komiteeBody: 'Seven volunteers keep the velo-club rolling – from planning tours to running the festivities.',
    roles: ['President', 'Vice-President', 'Treasurer', 'Secretary', 'Tour Captain', 'Events Lead', 'Equipment Manager', 'Committee Member', 'Auditor'],
    memberHint: 'Photo',
    galleryKicker: 'Gallery', galleryTitle: 'Moments in the saddle.',
    galleryBody: 'Photos and videos from our rides and events.', galleryCta: 'View gallery', galleryHint: 'Drop an image',
    sponsorsKicker: 'Partners', sponsorsTitle: 'Our sponsors.',
    sponsorsBody: 'Thanks to everyone who supports the club. Would you like to become a partner?', sponsorsCta: 'Become a sponsor', sponsorHint: 'Logo',
    footAddrLabel: 'Address', footMailLabel: 'E-mail', footLinksLabel: 'Explore',
    footRights: "© 2024 Velo-Club Casa d'Italia Berna",
    cards: [
      { n: '01', title: 'Become a member', body: "Want to ride with us? Drop us a line – we'd love to have you.", cta: 'Send a request' },
      { n: '02', title: 'Rankings 2023', body: 'Results and standings from last season.', cta: 'View rankings' },
      { n: '03', title: 'Brochure 2025', body: 'Our club brochure – browse it online.', cta: 'Open brochure' },
    ],
  },
};
