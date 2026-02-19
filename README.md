# ETA Travel Discovery + Triage (FastAPI + SQLite + Vanilla JS)

Full-stack app for travel company discovery and review queue triage.

## Stack
- Backend: FastAPI
- Frontend: plain HTML/CSS/vanilla JS
- DB: SQLite
- Run: Docker Compose

## One-command run
1. Install Docker Desktop.
2. From project root:
   ```bash
   cp .env.example .env
   docker compose up --build
   ```
3. Open: http://localhost:8000

## Core behavior
- Search by `location`, `company_type`, `specialty`.
- Loads 50 results at a time (Next/Previous).
- Shows company fields: name, owner, location, employees/agents, specialties, website.
- Triage with Reject/Maybe/Good + notes.
- Persists triage + notes in SQLite.
- Rejected domains are excluded from future `/search` results.

## Providers & feature flags
Configured in `.env`:
- `PROVIDER_GOOGLE_PLACES=1` (requires `GOOGLE_PLACES_API_KEY`)
- `PROVIDER_WEB_SEARCH=1` (requires `BRAVE_SEARCH_API_KEY`)
- `PROVIDER_DEMO=1` (works out-of-box)

API endpoint `GET /providers` returns enabled providers.

## Review Queue Mode
`POST /search` returns light candidates first.
Deep scraping (owner/employees/specialties) runs when a company is marked `maybe` or `good` via `POST /triage`.

## API endpoints
- `GET /providers`
- `POST /search`
- `POST /triage`
- `GET /board`

## Tests
Run inside container:
```bash
docker compose run --rm eta-app pytest -q
```

## Demo acceptance flow
With default `.env` (demo provider enabled):
1. Search `Boston` + `tour operator` -> returns results.
2. Mark one as Reject.
3. Search again; rejected domain no longer appears.
4. Refresh browser; notes + triage persist from SQLite.
5. Toggle provider flags in `.env` and restart to switch behavior without code changes.
