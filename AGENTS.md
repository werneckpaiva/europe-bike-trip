# AGENTS

This file provides guidance to Agents when working with code in this repository.

## What this is

Pedal — a self-hosted trip planner for multi-day bike tours. Users build a route as an ordered sequence of days, each containing a list of cities/stops with a transport mode (bike/ferry/train) between them and a night type (warmshowers/hotel/airbnb/friend) at the end. The app calls Google Maps (Directions, Elevation, Bicycling layer) client-side to compute distances, elevation gain, and render route maps per day and for the whole trip. Multiple trips are supported as "projects".

## Architecture

**Backend**: Flask app (`backend/app.py`) that serves the static frontend and exposes a small JSON API backed by SQLite (`backend/database.py`). There is no build step, bundler, or frontend framework — `frontend/script.js` is a single vanilla-JS file manipulating the DOM directly, run as an unpkg `<script src="script.js">` from `frontend/index.html`.

- `backend/app.py` — Flask routes for CRUD on `projects` and get/save the route (`cities`/`selected_cities` JSON blobs) per project. Runs migrations on startup (best-effort, logs on failure, doesn't crash the app).
- `backend/database.py` — thin SQLite wrapper. Two tables: `projects` (id, name, description, timestamps) and `config` (id == project_id, `cities` and `selected_cities` as JSON text columns — the whole route document is stored as one JSON blob per project, not normalized).
- `backend/migrations.py` — versioned, idempotent migrations tracked in a `migrations` table, run in order on every startup via `run_all_migrations`. Add new migrations by appending a function + entry to `MIGRATIONS_LIST`; never edit past migrations.
- `frontend/script.js` — all application logic: fetches/saves data via `fetch()` to `/api/projects...`, renders the day-by-day sidebar (`initSidebar`) and the main route/map view (`renderAll`), handles drag-and-drop reordering of both days and cities, and talks directly to the Google Maps JS API (Directions/Elevation/Bicycling services) for route calculation. Global mutable state (`days`, `selectedCities`, `activeDayIndex`, `currentProjectId`, `projects`) sits at module scope — there is no state management library.

### Data model

A project's route is a list of "days":
```
{ id, collapsed, cities: [{ name, transport }], night_type }
```
`selected_cities` is a separate ordered list of city names that are "active" (checked) — only selected cities are drawn on the map / counted in distance. Legacy flat city lists (with `is_sleep` markers) are auto-migrated to this day-based structure both server-side (`migrations.py`) and client-side (`migrateToDays` in `script.js`, kept as a defensive fallback).

Directions/elevation results are cached in-memory (`directionsCache`, `elevationCache` Maps in `script.js`) and also persisted back onto the city object (`cachedPolyline`, `cachedDistance`, `cachedElevation`, ...) so a saved trip doesn't need to re-hit the Google Maps API on every load — `renderAll()` writes these caches into `days` and calls `saveData()` when they change.

## Running the app

Local (always use the checked-in virtual environment `./venv/bin/python3` for running any Python commands):
```bash
./run.sh
```
This loads `.env`, runs `./venv/bin/python3 -m backend.run_migrations`, then starts `./venv/bin/python3 -m backend.app` on port 8000.

Run migrations only:
```bash
./venv/bin/python3 -m backend.run_migrations
```

Docker:
```bash
docker-compose up --build
```
Serves on port 8000; SQLite DB is persisted in the `app_data` volume at `/data/pedal.db` (`DB_PATH` env var). `docker-entrypoint.sh` runs migrations then starts `gunicorn --bind 0.0.0.0:8000 backend.app:app`.

There is no test suite, linter, or frontend build/package.json in this repo — changes are verified by running the app and exercising the UI in a browser.

## Notes for making changes

- **Virtual Environment**: Always use `./venv/bin/python3` when running Python commands or backend scripts in this project.
- The Google Maps API key is embedded directly in `frontend/index.html` (client-side, restricted by Google Cloud API key restrictions rather than kept secret) — this is intentional for a JS Maps API key, not an oversight to "fix" by moving it server-side.
- `DB_PATH` and `COOLIFY_TOKEN` are configured via `.env` (gitignored); `COOLIFY_TOKEN` is used for deployment, not by the app itself.
- When changing the shape of the `days`/`cities` JSON document, add a new migration in `backend/migrations.py` rather than mutating data in place elsewhere, and keep `migrateToDays` in `script.js` in sync if the flat-list fallback path is still relevant.

