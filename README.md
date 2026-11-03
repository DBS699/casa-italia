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
    │                           #    committee, sponsors, tours, news. Edit here.
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
| `tours.json` | Season tour cards (date, title, link, image) |
| `members.json` | Committee (name, role, photo) |
| `sponsors.json` | Sponsors (name, url, logo) |
| `gallery.json` | Gallery images |
| `site.json` | Hero motto + video + poster |

`content.js` reads these and the components render them. Translatable UI prose (hero intro,
section copy, nav, news cards) stays in the `I18N` object in `content.js` (developer-managed).

## Admin / CMS

- **`/admin`** — the real CMS (**Sveltia**, Decap-compatible). Edits commit to GitHub → Vercel
  rebuilds → live. Config: `public/admin/config.yml`. Auth: GitHub OAuth via the serverless
  functions in `api/` (`/api/auth`, `/api/callback`).
- **`/admin-demo`** — the earlier localStorage-only prototype (no server, demo password). Kept
  as a fallback / offline preview.

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

## Touren-Chat (`/chat`)

Touren lassen sich auch per Nachricht ändern, ohne GitHub-Konto: Auf `/chat` mit dem Passwort anmelden, aufschreiben, was sich ändern soll, den Vorschlag prüfen und auf «Veröffentlichen» klicken. Nach etwa einer Minute ist es live. «Rückgängig machen» stellt die letzte Chat-Änderung wieder her; Änderungen aus dem CMS werden nie rückgängig gemacht.

Gemini macht nur Vorschläge. `api/_chat-tours.js` prüft jeden Vorschlag, und ohne Klick auf «Veröffentlichen» wird nichts gespeichert. Der Chat kann nur `src/data/tours.json` und neue Fotos in `public/assets/uploads/` schreiben. Das CMS unter `/admin` funktioniert unabhängig davon weiter.

Umgebungsvariablen in Vercel (Production, danach neu deployen):

| Name | Inhalt |
| --- | --- |
| `CHAT_PASSWORD` | Passwort für den Chat, mindestens 12 Zeichen. Eine Änderung meldet alle ab. |
| `GEMINI_API_KEY` | API-Key aus [Google AI Studio](https://aistudio.google.com/apikey) |
| `CHAT_GITHUB_TOKEN` | Fine-grained GitHub-Token nur für `DBS699/casa-italia`, Berechtigung «Contents: Read and write». Der Token muss von DBS699 stammen, sonst deployt Vercel die Commits nicht. Er läuft ab und muss dann erneuert werden. |
| `GEMINI_MODEL` | Optional: anderes Gemini-Modell als das Standardmodell in `api/_chat-gemini.js` |

Fehlt eine Variable, zeigt `/chat` nur einen Hinweis. Tests ohne Keys: `npm test`.
