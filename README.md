# Velo-Club Casa d'Italia — Website (Astro)

A maintainable rebuild of the hi-fi handoff design (`../Website redesign request/`) in
**[Astro](https://astro.build)** — static output, zero client framework, deploys to Vercel
with no extra config. This replaces the proprietary `*.dc.html` / `support.js` runtime with
plain Astro components while keeping every design token, section and interaction pixel-faithful.

## Run

```bash
npm install
npm run dev      # → http://localhost:5189
npm run build    # static site to ./dist
npm run preview  # preview the production build
```

## Structure

```
site/
├── astro.config.mjs
├── vercel.json                 # cleanUrls, no build framework needed
├── public/
│   └── assets/                 # emblem.png, laurel(.cut).png, examples/*  (drop hero.mp4 here)
└── src/
    ├── data/content.js         # ⭐ single source of truth — i18n (DE/FR/IT/EN),
    │                           #    committee, sponsors, Komoot folders, news. Edit here.
    ├── styles/global.css       # all design tokens (colours, type, spacing) + section styles
    ├── layouts/Base.astro      # <head>, fonts, live language + mobile-menu script
    ├── components/             # Header · Hero · About · Committee · Season · News ·
    │                           #    Gallery · Sponsors · Footer
    └── pages/index.astro       # assembles the sections in handoff order
```

## How it works

- **Content** lives entirely in `src/data/content.js`. Each translatable element carries a
  `data-i18n="path"`; an inline script in `Base.astro` swaps text live on language change
  (DE/FR/IT/EN) and persists the choice in `localStorage` (`vcci-lang`) — no reload, matching
  the original `T`-object behaviour.
- **Design tokens** are CSS custom properties in `global.css`, lifted verbatim from the handoff
  (ink `#1b1a16`, paper `#f6f2e9`, green `#1f7a43`, red `#c0202a`, fonts Libre Caslon Display /
  Saira Condensed / Archivo, 1120px container, 820px mobile breakpoint).
- **Animations**: hero slide-up (`heroIn`) and scroll-reveal via CSS `animation-timeline: view()`
  (`revUp`); `prefers-reduced-motion` disables all motion.

## Content the club should still replace

- **Hero video**: add `public/assets/hero.mp4` and uncomment the `<source>` in `Hero.astro`.
- **Photos**: committee (`member1–9.png`), gallery (`gallery1–4.png`), sponsor logos
  (`sponsor1–6.png`) under `public/assets/examples/` are generated placeholders.
- **Sponsor URLs**: currently `#` in `content.js`.
- **Stats / season year / texts**: all in `content.js`.

## Deploy (Vercel)

Push the repo → import in Vercel. Astro is auto-detected (Framework preset “Astro”, build
`astro build`, output `dist`). `vercel.json` keeps clean URLs.

## Content model

Club-editable content lives in JSON in `src/data/` — the single source of truth:

| File | Manages |
|---|---|
| `komoot.json` | The season: one card per Komoot collection of the club (label, note, url); month labels follow the language switch |
| `members.json` | Committee (name, role, photo) |
| `sponsors.json` | Sponsors (name, url, logo) |
| `gallery.json` | Gallery images |
| `site.json` | Hero motto + video + poster |

`content.js` reads these and the components render them. Translatable UI prose (hero intro,
section copy, nav, buttons) lives in `texts.json`, which the website chat edits in all four languages
(not the CMS).

## Touren (Komoot)

Die Touren pflegt der Verein im Komoot-Konto https://www.komoot.com/de-de/user/veloclubcasa, in einem
öffentlichen Ordner (Collection) pro Monat. Eine Tour heisst «7. März: Seftigen Sportivo»: Datum, Ort, Gruppe.
Touren am gleichen Tag werden zu einer Ausfahrt mit mehreren Gruppen zusammengefasst; Touren ohne Datum
im Namen (Biketouren) stehen einzeln. Welche Ordner auf der Website erscheinen, steht in `komoot.json`.

Die Website lädt die Ordner im Browser über `/api/komoot` (`api/komoot.js`, gecacht 10 Minuten an Vercels
Edge) und zeigt pro Ordner eine Karte mit der Karte der ersten Ausfahrt, im Fenster alle Ausfahrten, und
oben die nächste Ausfahrt (`src/scripts/komoot.js`, `komoot-page.js`). Komoot hat keine offizielle API;
das ist dieselbe JSON-Schnittstelle, die komoot.com selbst lädt. Ändert Komoot sie, bleibt jede Karte ein
Link auf ihren Ordner, und «Nächste Ausfahrt» verschwindet. Lokal (ohne Function) holt der Browser die
Daten direkt bei Komoot.

## Admin / CMS

- **`/admin`** — the real CMS (**Sveltia**, Decap-compatible). Edits commit to GitHub → Vercel
  rebuilds → live. Config: `public/admin/config.yml`. Auth: GitHub OAuth via the serverless
  functions in `api/` (`/api/auth`, `/api/callback`).

### Make the CMS go live (one-time setup)

1. **GitHub repo** — push this folder to a GitHub repo (e.g. `dbs699/casa-italia`):
   ```bash
   git remote add origin git@github.com:<owner>/<repo>.git
   git push -u origin main
   ```
   Then set `repo:` in `public/admin/config.yml` to `<owner>/<repo>` if different.
2. **Connect Vercel ↔ GitHub** — in the Vercel project: Settings → Git → connect the repo, so
   every push (incl. CMS commits) triggers a deploy.
3. **GitHub OAuth App** — github.com → Settings → Developer settings → OAuth Apps → New:
   - Homepage URL: `https://casa-italia.vercel.app`
   - Authorization callback URL: `https://casa-italia.vercel.app/api/callback`
   - Copy the **Client ID** and generate a **Client Secret**.
4. **Vercel env vars** — in the Vercel project Settings → Environment Variables, add:
   - `GITHUB_CLIENT_ID` = the Client ID
   - `GITHUB_CLIENT_SECRET` = the Client Secret
   Redeploy so the functions pick them up.

After that: open `/admin`, “Login with GitHub”, edit → save → it commits → the site rebuilds.

## Website-Chat (`/chat`)

Alles, was im CMS änderbar ist, lässt sich auch per Nachricht ändern, ohne GitHub-Konto: die Komoot-Ordner der Touren, Komitee, Sponsoren, Galerie und Startseite (Motto, Video, Vorschaubild, Broschüre). Dazu kommen die übrigen Texte der Website in `src/data/texts.json`: Ändert sich der deutsche Text, ergänzt Gemini die Übersetzungen, und alle vier Sprachen stehen im Vorschlag. Diese Texte gibt es nur im Chat, nicht im CMS. Adresse und Kontakt-Mail stehen weiterhin im Code (`CLUB` in `src/data/content.js`). Auf `/chat` mit dem Passwort anmelden, aufschreiben, was sich ändern soll, Dateien bei Bedarf mit dem Plus-Zeichen anhängen, den Vorschlag prüfen und veröffentlichen. Nach etwa einer Minute ist es online. Die Seite ist nirgends verlinkt und für Suchmaschinen gesperrt (`noindex`, nicht in der Sitemap).

Neben dem Chat läuft die echte Website (auf dem Handy als eigener Tab). Mit «Bereich anklicken» lässt sich dort ein Sponsor, ein Touren-Monat oder ein ganzer Bereich auswählen, und der Chat weiss dann, was mit «dieser» gemeint ist. Vorschläge werden auf der Website markiert (`src/scripts/chat-site.js`, `chat-marks.js`), und sobald die neue Version online ist, lädt die Vorschau neu und zeigt die Stelle. Die Einträge sind dafür in den Komponenten mit `data-chat-item` und `data-chat-key` versehen. Dateien lassen sich auch einfach ins Fenster ziehen.

Gemini macht nur Vorschläge. `api/_chat-content.js` prüft jeden Vorschlag, und ohne Klick auf «Veröffentlichen» wird nichts gespeichert. Ist ein Gemini-Modell überlastet, nimmt der Chat automatisch das nächste (`api/_chat-gemini.js`). «Rückgängig machen» stellt die letzte Chat-Änderung wieder her, aber nie eine aus dem CMS.

Dateien:

- **Bilder** werden im Browser verkleinert und landen im selben Commit in `public/assets/uploads/` (höchstens 8 pro Veröffentlichung). PNGs bleiben PNG, solange sie klein genug sind, damit Logos transparent bleiben.
- **Video und Broschüre-PDF** gehen direkt in den Vercel-Blob-Speicher (höchstens 100 MB), weil sie nicht durch das 4,5-MB-Limit einer Function passen.
- **Tourenprogramm als PDF:** Ein angehängtes PDF kann nur die Broschüre zum Herunterladen werden; sein Inhalt geht nicht an Gemini. Die Touren selbst stehen auf Komoot.

Umgebungsvariablen in Vercel (Production, danach neu deployen):

| Name | Inhalt |
| --- | --- |
| `CHAT_PASSWORD` | Passwort für den Chat, mindestens 12 Zeichen. Eine Änderung meldet alle ab. |
| `GEMINI_API_KEY` | API-Key aus [Google AI Studio](https://aistudio.google.com/apikey) |
| `CHAT_GITHUB_TOKEN` | Fine-grained GitHub-Token nur für `DBS699/casa-italia`, Berechtigung «Contents: Read and write». Der Token muss von DBS699 stammen, sonst deployt Vercel die Commits nicht. |
| `BLOB_READ_WRITE_TOKEN` | Setzt Vercel beim Verbinden des Blob-Speichers selbst. Ohne ihn gehen im Chat keine grossen Uploads. |
| `GEMINI_MODEL` | Optional: Modell, das vor den Standardmodellen in `api/_chat-gemini.js` versucht wird |
