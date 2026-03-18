# catcape showcase

Modernes Blog-/Draft-Showcase mit animiertem Intro, interaktiver UI und einer serverseitigen Top-30-Auswahl aus Supabase via Claude.

## Was dieses Projekt macht

- Zeigt Drafts in einer hochwertigen Showcase-UI mit:
  - Featured Draft
  - Most Important Now
  - Suche, Filter, Sortierung
  - Detail-Modal mit Copy-Funktion
  - vielen Motion-/Micro-Animationen
- Nutzt eine Vercel API (`api/top-drafts.js`), die:
  - `public.scrape_results` aus Supabase liest
  - Claude die wichtigsten Eintraege auswaehlen laesst
  - die Top 30 ans Frontend liefert
- Hat einen Fallback auf lokale JSON-Dateien in `data/drafts/`, falls die API nicht verfuegbar ist.

## Architektur

- Frontend: statisches `index.html` + `src/showcase/styles.css` + `src/showcase/app.js`
- Backend (serverseitig): `api/top-drafts.js` (Vercel Function)
- Datenquelle: Supabase Tabelle `public.scrape_results`
- Priorisierung: Claude API (mit heuristischem Fallback)

## Projektstruktur

```txt
.
├── api/
│   └── top-drafts.js
├── data/
│   └── drafts/                       # lokale Fallback-Daten
├── src/
│   ├── showcase/
│   │   ├── app.js
│   │   └── styles.css
│   ├── fetchX.js
│   ├── scrapeX.js
│   ├── generateDrafts.js
│   └── config.js
├── index.html
├── package.json
└── .env.example
```

## Voraussetzungen

- Node.js 18+
- Vercel CLI (fuer lokales API-Testing empfohlen)
- Supabase Projekt
- Claude API Key

## Environment Variablen

`SUPABASE_SECRET_KEY` darf **nie** im Frontend landen.

In `.env` (lokal) und/oder Vercel Project Settings setzen:

```bash
# Supabase (server-only)
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...

# Claude
CLAUDE_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-3-5-sonnet-latest

# Optional: Wie viele Zeilen als Kandidaten-Pool gescannt werden
TOP_POOL_LIMIT=220
```

## Supabase Schema (aktuell)

```sql
create table scrape_results (
  id serial primary key,
  task text not null,
  item jsonb not null,
  inserted_at timestamp with time zone default now()
);
```

## Lokal starten

### Option A (empfohlen: inkl. API)

```bash
npm install
npx vercel dev
```

Danach im Browser die von Vercel ausgegebene URL oeffnen.

### Option B (nur statische Seite)

```bash
python3 -m http.server 8080
```

Hinweis: Ohne laufende API nutzt die UI den lokalen JSON-Fallback aus `data/drafts/`.

## Deployment auf Vercel

1. Repo mit Vercel verbinden
2. Env Vars in Vercel setzen (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLAUDE_API_KEY`, optional `CLAUDE_MODEL`, `TOP_POOL_LIMIT`)
3. Deploy ausfuehren

## Wie die Top-30-Auswahl funktioniert

1. API laedt Kandidaten aus `public.scrape_results`
2. Aus `item` werden Text/URL/Autor/Handle robust extrahiert
3. Claude bekommt den Kandidaten-Pool und soll die 30 wichtigsten IDs liefern
4. Falls Claude fehlschlaegt: heuristisches Ranking als Fallback
5. Frontend zeigt die gelieferten Ergebnisse in der bestehenden Showcase-Logik

## Sicherheit

- Keine Secrets in `index.html` oder `src/showcase/app.js`
- Kein Commit von `.env`
- Bei geleakten Keys: sofort rotieren/revoken

## Legacy Scripts (optional weiterhin nutzbar)

Die bisherigen Datenerzeugungs-Skripte sind noch vorhanden:

```bash
npm run fetch:x
npm run scrape:x
npm run drafts:generate
```

Sie koennen weiterhin fuer lokale Datengenerierung/Fallback verwendet werden.
