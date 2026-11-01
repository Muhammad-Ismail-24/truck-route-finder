# ARCHITECTURE.md — Weather-Aware Truck Routing

> **This document is the single source of truth.** If code, a comment, or your own assumption disagrees with this file, this file wins. If this file is wrong or incomplete, **stop, propose a change, and record it in `docs/DECISIONS.md`** before continuing. Never silently deviate.

---

## 0. How the coding agent must work

1. Work on **one task at a time** from [Section 22 (Build Plan)](#22-build-plan-small-tasks). Do not start the next task until the current task's acceptance criteria pass.
2. Before each task, re-read the sections the task references.
3. **Domain logic is test-first.** Everything in `backend/domain/` gets unit tests before or together with the implementation. Tests never hit the network.
4. **Never invent an API shape.** Use the contract in Section 15 exactly. Changing it means editing this file and `docs/API.md` in the same commit.
5. **No extra features.** The assessment says "prioritize correctness and clarity over extra features." Anything not listed here is out of scope (Section 2).
6. Run linters and tests before declaring a task done: `ruff check . && pytest` (backend), `npm run lint && npm test` (frontend).
7. One commit per task, using Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`), message references the task id, e.g. `feat(domain): implement risk classifier [T-03]`.
8. External API parameters in this document were researched from documentation but **must be verified against the live provider docs** when first implemented. If a parameter is rejected or behaves differently, fix it, add a fixture, and log the change in `docs/DECISIONS.md`.
9. Secrets never enter the repo. Only `.env.example` files with placeholder values are committed.

---

## 1. Product summary

A web app that helps a truck driver pick the safest of three routes using **weather, load weight, and travel time**.

**User inputs:** origin, destination, departure date/time, load weight (lb). Plus a checkpoint spacing selector (10 / 25 / 50 miles).

**App behavior:**

1. Geocode origin and destination (worldwide autocomplete).
2. Request **3 truck routes** from a routing API.
3. Place **checkpoints** along every route at the chosen interval.
4. Compute the truck's **ETA** at each checkpoint and fetch the **forecast for that location and hour**.
5. Classify **weather risk** at each checkpoint with the provided thresholds and load rules.
6. **Rank** routes and recommend the best one.
7. Show all routes, checkpoints, risk levels, ETAs, and summaries on a **map**.
8. Show a **weather heatmap** along the trip corridor with a **0–48 hour slider**.

**Grading weights (design priorities):** 40% routes/weather/risk/recommendation correctness · 40% UI, map, heatmap smoothness and performance · 15% code quality · 5% docs and Loom walkthrough.

**Deliverables:** GitHub repo · hosted app · 5–10 min Loom walkthrough.

---

## 2. Scope

### In scope
Everything in Section 1, plus: loading/error states, responsive layout, README and docs, unit tests for domain logic.

### Out of scope (do NOT build)
User accounts/login · database or persistence of trips · saved/shared trips · real-time traffic UI · turn-by-turn directions · hours-of-service/rest-stop modeling · multiple trucks/profiles · metric units toggle · dark/light toggle (the planner section is dark by design; no toggle) · i18n · weather alerts feed · push notifications · analytics · admin panel.

---

## 3. Locked decisions (decision log)

Each decision has an id. Do not change a locked decision without recording a new entry in `docs/DECISIONS.md`.

| ID | Topic | Decision | Rationale |
|---|---|---|---|
| D-01 | Checkpoint interval | **User selects** 10, 25, or 50 miles. Default **25**. | Spec says "10 / 25 / 50"; selector is the most literal and transparent reading. |
| D-02 | Boundary values | Honor the spec's explicit operators (`<`, `≥`, `>`). Where two ranges share an endpoint (e.g. rain 0.25 appears in Moderate and High), **the value belongs to the higher risk level**. Intervals are therefore half-open `[lower, upper)` except where the spec says `>`. | Safety-conservative and deterministic. Full tables in Section 9. |
| D-03 | Wind | Use **sustained wind speed** (`wind_speed_10m`) for classification. **Wind gusts are displayed** as extra information only. | User decision. Gusts are shown, never used in risk. |
| D-04 | Snow | Use **snowfall depth rate in inches/hour**, matching the spec's `in/hr` column directly. | User decision: match the requirements. |
| D-05 | Combined conditions | Checkpoint risk = **worst of** (wind level after load rules, rain level, snow level). | Simple, explainable. |
| D-06 | Miles per checkpoint | Each checkpoint owns the stretch of road **centered on it** (midpoint to midpoint). First owns `[0, mid]`, last owns `[mid, total]`. | Needed to compute "Severe miles" and "High miles" exactly. |
| D-07 | Average risk | **Mile-weighted average** of numeric levels (LOW=1 … NO_TRAVEL=5). | Fair across uneven segments. |
| D-08 | All routes bad | If every route contains No Travel, **recommend the least bad route with a prominent warning.** Never refuse. | User decision. |
| D-09 | Load boundaries | Strict `>` as written: exactly 30,000 lb does **not** trigger the 30k rule; exactly 40,000 lb does **not** trigger the 40k rule. Unit is **lb**, integer, valid range **1–80,000**. | Literal reading of spec. |
| D-10 | Time handling | Internally everything is **UTC**. Departure is entered in the **browser's time zone**, sent as ISO-8601 with offset. ETAs are shown in the **browser's time zone** with an offset label. Allowed departure window: **now − 60 min → now + 7 days.** Forecast is read at the **hour nearest the ETA** of each checkpoint. If departure is more than 5 days away, show a "long-range forecast, lower accuracy" notice. | Multi-day trips need ETA-driven forecasts; UTC avoids DST bugs. |
| D-11 | Travel time | Use the routing API's **truck profile** duration, then multiply by a **delay buffer of 1.10** (configurable, `DELAY_BUFFER`) for road delays, stops, and slower truck speeds. | User decision. |
| D-12 | Routing API | **HERE Routing API v8** (`transportMode=truck`) with HERE Geocoding & Search. | OpenRouteService's public API limits alternative routes to **100 km**, which breaks long-haul. HERE supports truck mode, up to 6 alternatives, generous free tier. |
| D-13 | Weather API | **Open-Meteo** forecast API, hourly. | No key, hourly data to 16 days, wind/rain/snow variables, supports multi-location requests. Free tier is non-commercial (fine for an assessment; attribution required). |
| D-14 | Database | **None.** Caching only (Django cache framework). | User decision. |
| D-15 | Hosting | **Two Vercel projects from one repo:** `frontend/` (Next.js) and `backend/` (Django on Vercel's Python runtime). **Fallback:** backend on Render (`gunicorn config.wsgi`). | User wants everything on Vercel; Vercel supports Django natively. Fallback exists if limits bite. |
| D-16 | Frontend | **JavaScript (ES2022) + Next.js App Router.** Types documented via JSDoc `@typedef`. | User decision. |
| D-17 | Map | **MapLibre GL JS** (WebGL) with keyless **OpenFreeMap** vector style by default. | Smooth polylines and a native GPU heatmap layer; no map key needed. |
| D-18 | Map interaction model | Backend does all logic; frontend only renders. | Testable logic, thin UI. |
| D-19 | Ranking | Lexicographic: **(No Travel miles, Severe miles, High miles, average risk, travel time)**, ascending. | Spec order, plus No Travel as tier 0 so a route through No Travel can never beat one without it. Documented extension. |
| D-20 | Heatmap time basis | Slider value `h ∈ [0, 48]` = **hours after the departure hour**. Heatmap is **load-aware** (uses the same classifier) and can switch between Risk / Wind / Rain / Snow. | Ties the heatmap to the user's actual trip. |
| D-21 | Weather failure policy | If weather data cannot be fetched after one retry, return **HTTP 502** with a clear error. Never guess or default weather values. | Correctness over leniency. |
| D-22 | Region | Worldwide locations; units remain mph, in/hr, lb, miles | Assessment does not require US-only; Open-Meteo returns specified units globally. |
| D-23 | Route count | Request `alternatives=2` (→ up to 3 routes). If fewer than 3 are returned, show what exists and add notice `FEWER_THAN_3_ROUTES`. | Cannot manufacture routes that do not exist. |
| D-24 | Truck weight for routing | Pass HERE `truck[grossWeight]` = `(load_weight_lb + TRUCK_TARE_LB) × 0.45359237` kg, capped at 80,000 lb. `TRUCK_TARE_LB = 32000`. | Routing needs gross weight; spec input is load weight. Documented assumption. |
| D-25 | Landing hero | Page `/` opens with a scroll-scrubbed video hero (mechanics from `docs/HERO_SPEC.md`), ported to a React client component. Directly after it comes the planner section (`#planner`). | Strong first impression; hero explains the product, planner does the work. |
| D-26 | Hero copy and brand | Keep the hero's visuals and mechanics. Replace the "KV freight services" copy with our product copy (Section 25.2). Brand text is a placeholder constant `BRAND_NAME = "HAULCAST"` in `heroConfig.js`. | The hero must describe this app, not a fictional freight group. |
| D-27 | Theme | White `#fff`, ink `#111`, cobalt `#2f63ff`, giant-letter grey `#e9e9e9`. Fonts: **Anton** (display), **Archivo** (body, variable), **JetBrains Mono** (numbers/data), loaded with `next/font/google`. The planner section is dark ink by design (continues the hero's black band). | One cohesive look from hero to app. |
| D-28 | Motion system | Motion tokens in `lib/motion.js` + CSS variables. Animate **transform and opacity only**. No animation library (CSS transitions + `requestAnimationFrame`). `prefers-reduced-motion` disables all non-essential motion. **No animation or transition on the heatmap slider data path.** | Smoothness and bundle size (40% UI/performance score). |
| D-29 | Hero media | Use the CloudFront URLs from `HERO_SPEC.md`, stored only in `heroConfig.js`. 720p at ≤ 900 px wide or when `navigator.connection.saveData` is true. Self-hosting under `public/media/` is a possible later swap (single constant change). | Spec-provided assets; one place to change. |
| D-30 | Hero performance | One `requestAnimationFrame` loop, running **only while the hero track is near the viewport** (IntersectionObserver). Seek guard: do not set `currentTime` while `video.seeking` and only when the difference > 1/60 s. | Avoid wasting CPU while the user uses the planner/map. |
| D-31 | Map style | Default `https://tiles.openfreemap.org/styles/positron` (light, low-noise, makes route/heatmap colors pop). Verify the style exists; fall back to `liberty`. Map sits inside a rounded frame on the dark section. | Contrast for heatmap and risk colors. |
| D-32 | Recorder mode | The hero's `?rec=1` recorder mode and `window.__recTime` are **not implemented**. | Not needed for the assessment. |

---

## 4. Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (latest stable, App Router), React, **JavaScript**, Tailwind CSS (latest), MapLibre GL JS, `next/font/google` (Anton, Archivo, JetBrains Mono), ESLint, Vitest |
| Backend | Python **3.12**, Django (latest stable), Django REST Framework, `httpx`, `flexpolyline` (HERE flexible polyline decoder), `django-cors-headers`, `gunicorn` (fallback host), `pytest`, `pytest-django`, `ruff` |
| Routing + geocoding | HERE Routing v8, HERE Geocoding & Search v1 |
| Weather | Open-Meteo Forecast API |
| Map tiles/style | OpenFreeMap (default), overridable by env |
| Cache | Django cache framework: `LocMemCache` default; optional Redis via `REDIS_URL` |
| Hosting | Vercel (frontend project + backend project) |

`next/font/google` (Anton, Archivo, JetBrains Mono). **No** animation libraries (no framer-motion/GSAP).

No numpy/shapely/pandas on the backend. Geometry is small pure-Python code (keeps bundle small and logic readable).

---

## 5. System architecture

```
┌────────────────────────────── Browser ───────────────────────────────┐
│  Next.js UI  ──  TripForm  ──  ResultsPanel  ──  MapView (MapLibre)  │
└───────────────┬──────────────────────────────────────────────────────┘
                │  /api/v1/*   (same-origin, rewritten to backend)
┌───────────────▼──────────────── Next.js (Vercel project: frontend) ───┐
│  next.config.mjs rewrites  /api/:path*  →  BACKEND_URL/api/:path*     │
└───────────────┬───────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────── Django (Vercel project: backend) ─────┐
│ api/            HTTP layer: views, serializers, errors                │
│ planner/        orchestration: trip_planner, weather_grid, cache      │
│ domain/         PURE logic: risk, geometry, sampling, eta, ranking... │
│ clients/        HERE geocoding+routing, Open-Meteo (all network I/O)  │
└───────┬──────────────────────────┬────────────────────────────────────┘
        │                          │
   HERE Routing/Geocode        Open-Meteo Forecast
```

**Layering rule (strict):**
`api` → `planner` → (`domain`, `clients`). `domain` imports **nothing** from Django, DRF, `clients`, or `planner`. `clients` import nothing from `domain` except dataclasses in `domain.models`. Violations are bugs.

### Request flow for `POST /api/v1/plan`

1. `api.views.PlanView` validates input with `PlanRequestSerializer`.
2. `planner.trip_planner.plan_trip()`:
   1. `clients.here_routing.fetch_truck_routes()` → up to 3 `RouteGeometry` objects (full-resolution points, base duration, distance).
   2. For each route: `domain.sampling.build_checkpoints()` at the selected interval; compute buffered duration; `domain.eta.compute_etas()`.
   3. `planner.weather_grid.build_weather_points()` → de-duplicated set of grid points covering all checkpoints **and** heatmap sample points of all routes.
   4. `clients.open_meteo.fetch_hourly()` (batched, parallel, cached) → hourly series per grid point.
   5. For each checkpoint: pick the forecast hour nearest its ETA, `domain.risk.classify_checkpoint()`.
   6. `domain.aggregation.summarize_route()` → miles by level, average risk, max level.
   7. `domain.ranking.rank_routes()` → ordered routes + reasons + warning status.
   8. `domain.heatmap.build_heatmap()` → 49-hour risk/metric arrays per heatmap point.
3. `planner.presenters.present_plan()` shapes the JSON response (Section 15).

---

## 6. Naming conventions (conflict avoidance)

### 6.1 General
- English only. No abbreviations except the standard ones in the glossary.
- **Unit suffixes are mandatory** on every numeric variable, field, and JSON key that has a unit:

| Suffix | Meaning | Example |
|---|---|---|
| `_mph` | miles per hour | `wind_mph` |
| `_in_hr` | inches per hour | `rain_in_hr` |
| `_lb` | pounds | `load_weight_lb` |
| `_mi` (Python/JS locals) / `_miles` (JSON) | miles | `segment_miles`, `distance_mi` |
| `_s` | seconds | `buffered_duration_s` |
| `_utc` | UTC ISO-8601 timestamp string (`...Z`) | `eta_utc` |
| `_m` | meters (only inside HERE client) | `length_m` |

### 6.2 Python (backend)
- Files/modules/functions/variables: `snake_case`. Classes: `PascalCase`. Constants: `UPPER_SNAKE_CASE`.
- Enum members: `UPPER_SNAKE_CASE`; enum **string values equal the member name** (`"NO_TRAVEL"`).
- Dataclasses are `@dataclass(frozen=True, slots=True)`.
- All public functions have type hints and a one-line docstring.
- Formatting/lint: `ruff` (line length 100).
- Test files: `test_<module>.py`; test functions: `test_<behavior>_<condition>`.

### 6.3 JavaScript (frontend)
- Folders: `kebab-case` (`trip-form/`). React components: `PascalCase.jsx`. Hooks: `useThing.js`. Other modules: `camelCase.js`. Constants: `UPPER_SNAKE_CASE`. Tests: `<module>.test.js` next to the module.
- **API data keeps `snake_case` keys exactly as received.** Do not rename/camelCase API payloads. Local variables and props are `camelCase`.
- One component per file; default export = the component.
- No `any`-style shortcuts: shapes are declared with JSDoc `@typedef` in `src/lib/types.js`.
- Hero CSS classes are prefixed `hero-`; hero CSS variables are prefixed `--hero-`. Hero styles live in exactly one file: `components/hero/hero.css`.
- Theme tokens: `--color-*`; surface tokens: `--surface-*`; motion tokens: `--motion-*`. Defined once in `app/globals.css`.
- Motion components live in `components/motion/` (`Reveal.jsx`, `CountUp.jsx`); shared constants in `lib/motion.js`.

### 6.4 URLs and JSON
- Endpoints: `/api/v1/<noun>` lowercase, hyphen-free single words where possible.
- JSON keys: `snake_case`. Enum values: `UPPER_SNAKE_CASE`. Timestamps: ISO-8601 UTC with `Z`.
- Coordinates: objects use `lat` and `lng`; GeoJSON arrays use `[lng, lat]` (GeoJSON standard). Never mix inside the same structure.

### 6.5 Identifiers
- Route ids: `route-1`, `route-2`, `route-3` (HERE order). Labels: `Route A`, `Route B`, `Route C`.
- Checkpoint key (frontend): `${route_id}:${index}`.
- Env vars: backend plain `UPPER_SNAKE`; frontend public vars must start `NEXT_PUBLIC_`.

### 6.6 Glossary
| Term | Meaning |
|---|---|
| Checkpoint | A sampled point on a route (every 10/25/50 mi) with ETA, weather, risk. |
| Segment | The road stretch owned by a checkpoint (D-06). |
| Risk level | One of `LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL`. |
| Weather grid point | A rounded lat/lng (2 decimals) used as the unit of weather fetching and caching. |
| Heatmap point | A grid point sampled every `HEATMAP_INTERVAL_MILES` along any route. |
| Departure hour | Departure time floored to the UTC hour; heatmap hour 0. |

---

## 7. Repository structure (exact)

```
spotter-truck-routing/                      ← repo root
├── ARCHITECTURE.md                         ← this file (source of truth)
├── README.md                               ← setup, run, deploy, overview
├── AGENTS.md                               ← 5-line pointer: "read ARCHITECTURE.md first"
├── .gitignore
├── .editorconfig
├── docs/
│   ├── API.md                              ← endpoint contract (mirror of Section 15)
│   ├── DECISIONS.md                        ← decision log; agent appends deviations here
│   ├── DEPLOYMENT.md                       ← Vercel (x2) + Render fallback steps
│   ├── RISK_ENGINE.md                      ← thresholds, boundaries, load rules, worked examples
│   ├── LOOM_SCRIPT.md                      ← walkthrough outline
│   └── HERO_SPEC.md                        ← verbatim hero prompt (reference)
│
├── backend/                                ← Django project root (Vercel project #2)
│   ├── manage.py
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── pytest.ini
│   ├── ruff.toml
│   ├── .python-version                     ← "3.12"
│   ├── .env.example
│   ├── vercel.json
│   ├── config/
│   │   ├── __init__.py
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── api/                                ← HTTP layer only
│   │   ├── __init__.py
│   │   ├── urls.py
│   │   ├── views.py
│   │   ├── serializers.py
│   │   └── errors.py
│   ├── domain/                             ← PURE logic, no I/O, no Django
│   │   ├── __init__.py
│   │   ├── constants.py
│   │   ├── enums.py
│   │   ├── models.py
│   │   ├── units.py
│   │   ├── risk.py
│   │   ├── geometry.py
│   │   ├── sampling.py
│   │   ├── eta.py
│   │   ├── aggregation.py
│   │   ├── ranking.py
│   │   └── heatmap.py
│   ├── clients/                            ← all outbound HTTP
│   │   ├── __init__.py
│   │   ├── http.py
│   │   ├── here_geocoding.py
│   │   ├── here_routing.py
│   │   └── open_meteo.py
│   ├── planner/                            ← orchestration
│   │   ├── __init__.py
│   │   ├── trip_planner.py
│   │   ├── weather_grid.py
│   │   ├── cache.py
│   │   └── presenters.py
│   └── tests/
│       ├── conftest.py
│       ├── fixtures/
│       │   ├── here_routes_sample.json
│       │   ├── here_geocode_sample.json
│       │   └── open_meteo_batch_sample.json
│       ├── domain/
│       │   ├── test_risk.py
│       │   ├── test_geometry.py
│       │   ├── test_sampling.py
│       │   ├── test_eta.py
│       │   ├── test_aggregation.py
│       │   ├── test_ranking.py
│       │   └── test_heatmap.py
│       ├── clients/
│       │   ├── test_here_routing.py
│       │   ├── test_here_geocoding.py
│       │   └── test_open_meteo.py
│       ├── planner/
│       │   └── test_trip_planner.py
│       └── api/
│           └── test_plan_endpoint.py
│
└── frontend/                               ← Next.js project root (Vercel project #1)
    ├── package.json
    ├── next.config.mjs
    ├── jsconfig.json
    ├── eslint.config.mjs
    ├── postcss.config.mjs
    ├── vitest.config.mjs
    ├── .env.example
    ├── scripts/
    │   └── copy-worker.mjs
    ├── public/
    │   └── favicon.ico
    └── src/
        ├── app/
        │   ├── layout.jsx
        │   ├── page.jsx                            ← <ScrollHero/> then <PlannerSection/>
        │   ├── fonts.js                            ← next/font setup (Anton, Archivo, JetBrains Mono)
        │   └── globals.css                         ← theme tokens, base styles, motion tokens
        ├── components/
        │   ├── hero/
        │   │   ├── ScrollHero.jsx                  ← track, scene, video, giant letters, band
        │   │   ├── HeroNav.jsx
        │   │   ├── HeroStrip.jsx                   ← headline block + 5 cards
        │   │   ├── HeroCard.jsx
        │   │   ├── HeroIcons.jsx                   ← 5 line icons (inline SVG)
        │   │   ├── heroConfig.js                   ← BRAND_NAME, copy, media URLs, timing constants
        │   │   └── hero.css
        │   ├── motion/
        │   │   ├── Reveal.jsx                      ← scroll-in reveal wrapper (IntersectionObserver)
        │   │   └── CountUp.jsx                     ← number count-up
        │   ├── layout/
        │   │   ├── PlannerSection.jsx              ← #planner: heading, sidebar, map frame (replaces AppShell)
        │   │   └── Footer.jsx                      ← attribution
        │   ├── trip-form/    (TripForm, LocationInput, DepartureInput, LoadWeightInput, IntervalSelect)
        │   ├── results/      (ResultsPanel, RecommendationBanner, RouteCard, RouteSummaryStats, RiskBadge,
        │   │                  RiskBreakdownBar, CheckpointTable, NoticesPanel, ResultsSkeleton, ErrorPanel)
        │   ├── map/          (MapView, MapLegend, HeatmapControls, CheckpointPopup)
        │   └── ui/           (Button, Spinner, Slider)
        ├── map/              (mapStyle, geojson, routeLayers, checkpointLayers, heatmapLayer, bounds, routeAnimation)
        ├── hooks/
        │   ├── useDebouncedValue.js
        │   ├── useGeocodeSuggest.js
        │   ├── usePlanTrip.js
        │   ├── useMapInstance.js
        │   ├── useHeatmapFrame.js
        │   ├── useHeroScroll.js                    ← scroll → video time, strip/letters transforms
        │   ├── useReducedMotion.js
        │   └── useIsMounted.js
        ├── state/            (TripProvider, tripReducer, selectors)
        └── lib/
            ├── api/          (client, plan, geocode, ApiError)
            ├── format/       (time, distance, weight, weather)
            ├── risk/riskLevels.js
            ├── motion.js
            ├── constants.js
            └── types.js
```

`components/layout/AppShell.jsx` and `Header.jsx` from the old tree are **removed** (the hero nav replaces the header). `map/routeAnimation.js` is new (Section 25.5).

Nothing may be added to or moved in this tree without updating this section.

---

## 8. Domain model

### 8.1 Enums (`backend/domain/enums.py`)
```python
class RiskLevel(IntEnum):
    LOW = 1
    MODERATE = 2
    HIGH = 3
    SEVERE = 4
    NO_TRAVEL = 5
# String name (e.g. "SEVERE") is what is serialized to JSON.

class WeatherDriver(StrEnum):
    WIND = "WIND"; RAIN = "RAIN"; SNOW = "SNOW"

class HeatmapMetric(StrEnum):
    RISK = "RISK"; WIND = "WIND"; RAIN = "RAIN"; SNOW = "SNOW"
```

### 8.2 Dataclasses (`backend/domain/models.py`, all frozen)
```python
LatLng(lat: float, lng: float)
Place(label: str, lat: float, lng: float)

RouteGeometry(
    route_id: str,                  # "route-1"
    points: tuple[LatLng, ...],     # full resolution
    distance_mi: float,
    base_duration_s: float,         # from HERE, before buffer
)

Checkpoint(
    index: int,
    mile: float,                    # distance from origin along route
    position: LatLng,
    segment_miles: float,           # D-06
    eta_utc: datetime,
    forecast_hour_utc: datetime,    # eta rounded to nearest hour
)

WeatherSample(wind_mph, wind_gust_mph, rain_in_hr, snow_in_hr)   # all floats, never None

RiskAssessment(
    level: RiskLevel,
    wind_level: RiskLevel, rain_level: RiskLevel, snow_level: RiskLevel,
    driver: WeatherDriver,
    load_rule: str | None,          # None | "WIND_55_ANY_LOAD" | "WIND_45_54_OVER_30K" | "WIND_35_44_OVER_40K"
)

RouteSummary(
    distance_miles, base_duration_s, buffered_duration_s,
    departure_utc, arrival_utc,
    miles_by_level: dict[RiskLevel, float],   # all five keys always present
    avg_risk: float, max_level: RiskLevel,
)

HourlySeries(
    times_utc: list[datetime],
    wind_mph: list[float],
    wind_gust_mph: list[float],
    rain_in_hr: list[float],
    snow_in_hr: list[float],
)

HeatmapPoint(
    lat: float,
    lng: float,
    risk: list[int],
    wind_mph: list[float],
    rain_in_hr: list[float],
    snow_in_hr: list[float],
)

HeatmapResult(
    start_utc: datetime,
    hours: int,
    truncated: bool,
    points: list[HeatmapPoint],
)
```

### 8.3 Constants (`backend/domain/constants.py`)
```python
ALLOWED_INTERVALS_MILES = (10, 25, 50)
DEFAULT_INTERVAL_MILES = 25
HEATMAP_INTERVAL_MILES = 25
HEATMAP_HOURS = 49                 # hours 0..48 inclusive
MAX_LOAD_LB = 80_000
MIN_LOAD_LB = 1
DELAY_BUFFER_DEFAULT = 1.10
TRUCK_TARE_LB_DEFAULT = 32_000
MAX_DEPARTURE_DAYS_AHEAD = 7
DEPARTURE_PAST_GRACE_MINUTES = 60
LONG_RANGE_NOTICE_DAYS = 5
WEATHER_GRID_DECIMALS = 2
MAX_UNIQUE_WEATHER_POINTS = 1000   # applies to heatmap thinning only (Section 12.4)
DISPLAY_GEOMETRY_MAX_POINTS = 2000
MILES_COMPARE_DECIMALS = 1
AVG_RISK_COMPARE_DECIMALS = 2
```

---

## 9. Risk engine specification (`backend/domain/risk.py`, `units.py`)

### 9.1 Units
Open-Meteo is requested with `wind_speed_unit=mph` and `precipitation_unit=inch`, so no manual conversion is needed for wind, rain, or snowfall. Hourly precipitation/snowfall values are the **sum over the preceding hour**, so inches per hour = the value itself.
- `rain_in_hr = rain + showers`  (liquid only; do **not** use the `precipitation` variable, it includes snow water equivalent)
- `snow_in_hr = snowfall`
- `wind_mph = wind_speed_10m`; `wind_gust_mph = wind_gusts_10m` (display only)

`units.py` additionally provides `meters_to_miles`, `miles_to_meters`, `lb_to_kg`.

### 9.2 Base thresholds (D-02)

**Wind (mph)**
| Level | Rule |
|---|---|
| LOW | `< 25` |
| MODERATE | `25 ≤ x < 35` |
| HIGH | `35 ≤ x < 45` |
| SEVERE | `45 ≤ x < 55` |
| NO_TRAVEL | `x ≥ 55` |

**Rain (in/hr)**
| Level | Rule |
|---|---|
| LOW | `< 0.10` |
| MODERATE | `0.10 ≤ x < 0.25` |
| HIGH | `0.25 ≤ x < 0.50` |
| SEVERE | `0.50 ≤ x ≤ 1.00` |
| NO_TRAVEL | `x > 1.00` |

**Snow (in/hr)**
| Level | Rule |
|---|---|
| LOW | `< 0.5` |
| MODERATE | `0.5 ≤ x < 1.0` |
| HIGH | `1.0 ≤ x < 2.0` |
| SEVERE | `2.0 ≤ x ≤ 3.0` |
| NO_TRAVEL | `x > 3.0` |

### 9.3 Load rules (apply to **sustained wind** only; implemented as escalation)
Evaluate on the raw `wind_mph` and `load_weight_lb`:
1. `wind ≥ 55` → `NO_TRAVEL` for any load. (`load_rule = "WIND_55_ANY_LOAD"`)
2. `45 ≤ wind < 55` **and** `load > 30000` → `NO_TRAVEL`. (`"WIND_45_54_OVER_30K"`)
3. `35 ≤ wind < 45` **and** `load > 40000` → at least `SEVERE`. (`"WIND_35_44_OVER_40K"`)

`wind_level = max(base_wind_level, rule_level)`. `load_rule` is set only when the rule **raised** the level above base (rule 1 is already base NO_TRAVEL, so set `load_rule = None` for it; only rules 2 and 3 can set a load_rule).

### 9.4 Checkpoint classification
```
level  = max(wind_level, rain_level, snow_level)
driver = first of [WIND, RAIN, SNOW] whose level equals `level`   # tie-break order
```

### 9.5 Golden test cases (must all be in `test_risk.py`)
Load = 20,000 lb unless stated.

| Input | Expected |
|---|---|
| wind 24.9 / 25 / 34.9 / 35 | LOW / MODERATE / MODERATE / HIGH |
| wind 44.9 / 45 / 54.9 / 55 | HIGH / SEVERE / SEVERE / NO_TRAVEL |
| wind 50, load 30,000 | SEVERE (30,000 is not `>`) |
| wind 50, load 30,001 | NO_TRAVEL, `load_rule = WIND_45_54_OVER_30K` |
| wind 40, load 40,000 | HIGH |
| wind 40, load 40,001 | SEVERE, `load_rule = WIND_35_44_OVER_40K` |
| wind 30, load 80,000 | MODERATE (no rule applies below 35) |
| wind 44, load 35,000 | HIGH (40k rule not met; 30k rule is for 45–54) |
| wind 60, load 100 | NO_TRAVEL |
| rain 0.099 / 0.10 / 0.25 / 0.50 | LOW / MODERATE / HIGH / SEVERE |
| rain 1.00 / 1.01 | SEVERE / NO_TRAVEL |
| snow 0.49 / 0.5 / 1.0 / 2.0 | LOW / MODERATE / HIGH / SEVERE |
| snow 3.0 / 3.01 | SEVERE / NO_TRAVEL |
| wind 30, rain 0.30, snow 0 | HIGH, driver RAIN |
| wind 40 (load 50,000), rain 0.30 | SEVERE, driver WIND |
| all zeros | LOW |

Each decision here must also be written into `docs/RISK_ENGINE.md` with the worked examples.

---

## 10. Geometry and checkpoint sampling

### 10.1 `geometry.py` (pure functions)
- `haversine_mi(a: LatLng, b: LatLng) -> float` (Earth radius 3958.7613 mi).
- `cumulative_miles(points) -> list[float]` (same length as points; first = 0).
- `point_at_mile(points, cumulative, mile) -> LatLng` (linear interpolation within the containing segment; binary search via `bisect`).
- `simplify_polyline(points, max_points) -> list[LatLng]` (Douglas-Peucker with iteratively increased tolerance until ≤ `max_points`; used **only** for display geometry; sampling always uses full-resolution points).

### 10.2 `sampling.py`
`build_checkpoints(route, interval_miles, departure_utc, buffered_duration_s)`:
1. `total = route.distance_mi` should equal the last cumulative value; use the **computed cumulative total** as the authority for miles and rescale nothing.
2. Checkpoint miles: `0, I, 2I, …` while `< total`, then **always** `total` (destination). If `total < I` the result is exactly two checkpoints (0 and total).
3. Position: `point_at_mile`.
4. Segment ownership (D-06). With miles `m[0..n-1]`:
   - `lower[i] = 0` if `i == 0` else `(m[i-1] + m[i]) / 2`
   - `upper[i] = total` if `i == n-1` else `(m[i] + m[i+1]) / 2`
   - `segment_miles[i] = upper[i] − lower[i]`
   - Invariant (test it): `sum(segment_miles) == total` within 1e-6.
5. ETA via `eta.py` (below).

### 10.3 `eta.py`
```
eta(mile) = departure_utc + (mile / total_miles) × buffered_duration_s
buffered_duration_s = route.base_duration_s × DELAY_BUFFER
forecast_hour_utc = floor_to_hour(eta + 30 minutes)     # nearest hour
```
Linear-by-distance interpolation is intentional (simple, explainable, documented).

---

## 11. Clients (`backend/clients/`) — all network I/O lives here

### 11.1 `http.py`
Shared `httpx.Client` factory: timeout 10 s (connect 5 s), 1 retry on timeout / 5xx / 429 with 300 ms backoff, custom `User-Agent: spotter-truck-routing/1.0`. Raises typed errors: `UpstreamError(service, status, detail)`.

### 11.2 `here_routing.py` — `fetch_truck_routes(origin, destination, departure_utc, load_weight_lb) -> list[RouteGeometry]`
- `GET https://router.hereapi.com/v8/routes`
- Params: `transportMode=truck`, `origin={lat},{lng}`, `destination={lat},{lng}`, `departureTime={ISO-8601}`, `alternatives=2`, `return=polyline,summary`, `truck[grossWeight]={kg int}` (D-24), `apikey=…`.
- Each HERE route has `sections[]`. Concatenate section polylines in order (drop the duplicate join point); sum `summary.length` (m) and `summary.duration` (s) across sections.
- Decode with `flexpolyline.decode`. Drop consecutive duplicate points.
- Map to `route-1..route-3` in HERE order.
- Zero routes returned → raise `NoRouteFound`.
- **Verify** parameter names and units against current HERE docs on first run; record a trimmed real response in `tests/fixtures/here_routes_sample.json`.

### 11.3 `here_geocoding.py`
- `suggest(query) -> list[Place]` : uses HERE Geocoding & Search autosuggest endpoint with worldwide bounding box `in=bbox:-180,-90,180,90`, `limit=5`. Returns `Place(label, lat, lng)`.
- `geocode_one(query)` is **not needed**: the frontend sends coordinates picked from suggestions; the backend never re-geocodes.
- Verify against current HERE docs and record fixture `here_geocode_sample.json`.

### 11.4 `open_meteo.py` — `fetch_hourly(points, start_date, end_date) -> dict[GridKey, HourlySeries]`
- `GET https://api.open-meteo.com/v1/forecast`
- Params: `latitude=lat1,lat2,…`, `longitude=lng1,lng2,…`, `hourly=wind_speed_10m,wind_gusts_10m,rain,showers,snowfall`, `wind_speed_unit=mph`, `precipitation_unit=inch`, `timezone=GMT`, `start_date=YYYY-MM-DD`, `end_date=YYYY-MM-DD`.
- Chunk into **50 locations per request**, run chunks in a `ThreadPoolExecutor(max_workers=8)`.
- Response is a **list** for multi-location requests (order matches input) and an **object** for a single location: handle both.
- `HourlySeries`: `times_utc: list[datetime]`, arrays `wind_mph`, `wind_gust_mph`, `rain_in_hr` (= rain + showers), `snow_in_hr`. Any `null` value → raise `WeatherDataError` (D-21).
- `GridKey = (round(lat, 2), round(lng, 2))`.
- Attribution requirement: Footer must show "Weather data by Open-Meteo.com".

---

## 12. Planner (`backend/planner/`)

### 12.1 `trip_planner.plan_trip(request) -> PlanResult`
Implements the flow in Section 5. Pure orchestration; calls `clients` and `domain` only.

### 12.2 `weather_grid.py`
- `grid_key(lat, lng)` rounds to 2 decimals (~1.1 km).
- `build_weather_points(routes, checkpoints_by_route, heatmap_points)` returns the **unique** union of grid keys used by checkpoints and heatmap points (routes often share corridors; dedupe saves requests).
- `weather_date_range(departure_utc, all_etas)`: `start = date(floor_hour(departure))`, `end = date(max(max_forecast_hour, departure_hour + 48h))`.

### 12.3 Heatmap sample points
For each route, take points every `HEATMAP_INTERVAL_MILES` (25) via `point_at_mile` (always including destination). Union across routes, deduped by grid key.

### 12.4 Cap
If unique heatmap-only points exceed `MAX_UNIQUE_WEATHER_POINTS`, double the heatmap interval (25 → 50 → 100) and rebuild until under the cap. **Checkpoints are never thinned** (they define correctness).

### 12.5 `cache.py`
Thin wrapper over Django cache:
| Key | TTL |
|---|---|
| `wx:v1:{lat2}:{lng2}:{start_date}:{end_date}` (one grid point's hourly series) | 30 min |
| `route:v1:{sha1(origin,dest,departure_hour,load_bucket)}` | 10 min |
| `suggest:v1:{lowercased query}` | 24 h |
`load_bucket` = `load_weight_lb // 5000`. Caching routes by load bucket is acceptable because only gross weight (a routing restriction) varies. The planner reads from cache first and only fetches **missing** weather points.

### 12.6 `presenters.py`
Converts `PlanResult` into the JSON in Section 15. Display geometry is simplified via `simplify_polyline(…, DISPLAY_GEOMETRY_MAX_POINTS)` and emitted as GeoJSON `[lng, lat]` coordinates. All floats rounded: miles 1 decimal in summaries (2 in checkpoints), weather 2 decimals, coordinates 5 decimals.

---

## 13. Aggregation and ranking

### 13.1 `aggregation.summarize_route`
```
miles_by_level[level] = Σ segment_miles of checkpoints whose risk.level == level   (all 5 keys present, default 0.0)
avg_risk = Σ(int(level) × segment_miles) / total_miles
max_level = highest level present
```

### 13.2 `ranking.rank_routes`
Sort key (ascending, lexicographic) — D-19:
```
(
  round(no_travel_miles, 1),
  round(severe_miles, 1),
  round(high_miles, 1),
  round(avg_risk, 2),
  round(buffered_duration_s / 60),     # minutes
)
```
Output:
- `ranking`: list of `{route_id, key}` best→worst.
- `recommended_route_id` = first.
- `status`: `"OK"`, or `"OK_WITH_WARNING"` if the recommended route has `no_travel_miles > 0` **or** `severe_miles > 0`.
- `reasons`: 1–3 human strings explaining the deciding tier against the runner-up, e.g. `"Route B has 0 Severe miles vs 42.5 for Route A."` or, when the first three tiers tie, `"Routes tie on weather risk; Route C is 38 min faster."` A single-route result yields `"Only one route was available."`.
- When `no_travel_miles > 0` for the recommended route, the first reason is `"Every route crosses No Travel conditions; this is the least bad option."`

### 13.3 Required ranking tests
- Tier 0 beats everything (a route with 0 Severe but 5 No Travel miles loses to a route with 100 Severe and 0 No Travel).
- Severe tier beats High tier; High beats avg risk; avg risk beats time; time is the final tiebreaker.
- Rounding: miles differing by <0.05 tie.
- Single-route and two-route inputs.

---

## 14. Heatmap (`backend/domain/heatmap.py`)

`build_heatmap(points, series_by_key, departure_hour_utc, load_weight_lb)`:
- For each heatmap point and each hour `h = 0..48`: take `series[time = departure_hour_utc + h hours]`; classify with `classify_checkpoint` (load-aware).
- Output per point: `risk: [int 0..4]` (= `RiskLevel − 1`), `wind_mph: [...]`, `rain_in_hr: [...]`, `snow_in_hr: [...]` (each 49 values, rounded to 1/2/2 decimals).
- If an hour is missing from the series (beyond forecast), repeat the last available value and flag `truncated: true` on the heatmap object.

Frontend intensity (`heatmapLayer.js`):
- RISK mode: `intensity = risk / 4` (LOW=0 is invisible by design).
- Metric modes: `intensity = clamp(value / NO_TRAVEL_THRESHOLD, 0, 1)` using wind 55, rain 1.0, snow 3.0.

---

## 15. API contract (`/api/v1`)

Base: same origin `/api/v1` from the browser (Next rewrite). JSON only. No auth.

### 15.1 `GET /api/v1/health`
`200 {"status": "ok", "version": "1.0.0"}`

### 15.2 `GET /api/v1/geocode/suggest?q=<text>`
- `q` min 3 chars, max 100. Returns `200` with up to 5 worldwide suggestions:
```json
{ "results": [ { "label": "Chicago, IL, United States", "lat": 41.8781, "lng": -87.6298 } ] }
```
(max 5 results).

### 15.3 `POST /api/v1/plan`
**Request**
```json
{
  "origin":      { "label": "Chicago, IL", "lat": 41.8781, "lng": -87.6298 },
  "destination": { "label": "Denver, CO",  "lat": 39.7392, "lng": -104.9903 },
  "departure_time": "2026-11-02T08:00:00-05:00",
  "load_weight_lb": 42000,
  "checkpoint_interval_miles": 25
}
```
**Validation** (HTTP 400 `VALIDATION_ERROR` with per-field `details`):
- lat ∈ [−90, 90], lng ∈ [−180, 180]; origin and destination at least 1 mile apart.
- `departure_time`: timezone-aware ISO-8601; within `now − 60 min … now + 7 days`.
- `load_weight_lb`: integer 1–80,000.
- `checkpoint_interval_miles` ∈ {10, 25, 50} (default 25 if omitted).

**Response 200**
```json
{
  "request_id": "uuid",
  "generated_at_utc": "2026-11-01T12:00:00Z",
  "input": {
    "origin": {...}, "destination": {...},
    "departure_utc": "2026-11-02T13:00:00Z",
    "load_weight_lb": 42000,
    "checkpoint_interval_miles": 25
  },
  "settings": {
    "delay_buffer": 1.10,
    "heatmap_interval_miles": 25,
    "truck_tare_lb": 32000
  },
  "routes": [
    {
      "id": "route-1",
      "label": "Route A",
      "rank": 1,
      "is_recommended": true,
      "summary": {
        "distance_miles": 1003.4,
        "base_duration_s": 52000,
        "buffered_duration_s": 57200,
        "departure_utc": "2026-11-02T13:00:00Z",
        "arrival_utc": "2026-11-03T04:53:20Z",
        "avg_risk": 1.42,
        "max_level": "HIGH",
        "miles_by_level": { "LOW": 800.1, "MODERATE": 130.0, "HIGH": 73.3, "SEVERE": 0.0, "NO_TRAVEL": 0.0 }
      },
      "geometry": { "type": "LineString", "coordinates": [[-87.62980, 41.87810], ...] },
      "checkpoints": [
        {
          "index": 0,
          "mile": 0.0,
          "lat": 41.87810, "lng": -87.62980,
          "segment_miles": 12.5,
          "eta_utc": "2026-11-02T13:00:00Z",
          "forecast_hour_utc": "2026-11-02T13:00:00Z",
          "weather": { "wind_mph": 12.3, "wind_gust_mph": 21.0, "rain_in_hr": 0.0, "snow_in_hr": 0.0 },
          "risk": {
            "level": "LOW",
            "wind_level": "LOW", "rain_level": "LOW", "snow_level": "LOW",
            "driver": "WIND",
            "load_rule": null
          }
        }
      ]
    }
  ],
  "recommendation": {
    "route_id": "route-1",
    "status": "OK",
    "reasons": ["Route A has 0 Severe miles and 73.3 High miles, the fewest of the three routes."],
    "ranking": [ { "route_id": "route-1", "key": [0.0, 0.0, 73.3, 1.42, 953] } ]
  },
  "heatmap": {
    "start_utc": "2026-11-02T13:00:00Z",
    "hours": 49,
    "truncated": false,
    "points": [
      { "lat": 41.88, "lng": -87.63,
        "risk": [0,0,1,...], "wind_mph": [...], "rain_in_hr": [...], "snow_in_hr": [...] }
    ]
  },
  "notices": [ { "code": "LONG_RANGE_FORECAST", "message": "Departure is more than 5 days away; forecast accuracy is lower." } ]
}
```
Notice codes: `FEWER_THAN_3_ROUTES`, `LONG_RANGE_FORECAST`, `HEATMAP_THINNED`, `HEATMAP_TRUNCATED`.
`routes` is ordered by `rank` (best first). Display labels (A/B/C) stay tied to HERE order, not rank.

### 15.4 Error format (all endpoints)
```json
{ "error": { "code": "NO_ROUTE_FOUND", "message": "No truck route found between these points.", "details": {} } }
```
| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | bad input |
| `NO_ROUTE_FOUND` | 422 | HERE returned no route |
| `UPSTREAM_ROUTING_ERROR` | 502 | HERE failed after retry |
| `UPSTREAM_WEATHER_ERROR` | 502 | Open-Meteo failed after retry or returned nulls |
| `RATE_LIMITED` | 429 | our throttle or upstream 429 after retry |
| `INTERNAL_ERROR` | 500 | anything else (log with `request_id`; never leak stack traces) |

DRF config: JSON renderer only, no auth classes, `UNAUTHENTICATED_USER = None`, anon throttle `60/min`.

---

## 16. Backend configuration

### 16.1 `settings.py` rules
- Minimal `INSTALLED_APPS`: `rest_framework`, `corsheaders`. **No** admin/auth/sessions/contenttypes. `DATABASES = {}`.
- `CACHES`: `LocMemCache` by default; if `CACHE_BACKEND=redis` use Django's Redis backend with `REDIS_URL`.
- `CORS_ALLOWED_ORIGINS` from env (comma-separated) for local dev and direct-call fallback.
- `ALLOWED_HOSTS` from env.

### 16.2 `backend/.env.example`
```
DJANGO_SECRET_KEY=change-me
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,.vercel.app
CORS_ALLOWED_ORIGINS=http://localhost:3000
HERE_API_KEY=
CACHE_BACKEND=locmem
REDIS_URL=
DELAY_BUFFER=1.10
TRUCK_TARE_LB=32000
```

### 16.3 `backend/vercel.json`
Set `maxDuration` for the Django entrypoint (verify the exact `functions` key format against current Vercel docs; Vercel detects Django from `manage.py` and reads `WSGI_APPLICATION`). Typical budget for a plan request: 5–15 s uncached.

---

## 17. Frontend architecture

### 17.1 Page layout (`app/page.jsx` → `ScrollHero` + `PlannerSection`)
- `/` is one long page: **(1) `ScrollHero`** (sticky scene scroll story) then **(2) `PlannerSection`** (`id="planner"`).
- `PlannerSection`: ink `#111` background. Top: eyebrow + large Anton heading "PLAN YOUR ROUTE" (reveal animation). Below: **desktop** two columns: left sidebar (~440 px: `TripForm` then `ResultsPanel`, internally scrollable) and right a rounded (24 px) map frame; section height ≈ 100vh minus heading. **Mobile**: map first (~45 vh), form/results below.
- Footer attribution inside the section bottom: "Weather data by Open-Meteo.com · Map © OpenFreeMap © OpenStreetMap contributors".

### 17.2 State (`state/`)
`TripProvider` uses `useReducer`. State shape:
```js
{
  form: { origin, destination, departure_local, load_weight_lb, checkpoint_interval_miles },
  status: 'idle' | 'loading' | 'success' | 'error',
  result: PlanResponse | null,
  error: { code, message, details } | null,
  selectedRouteId: string | null,       // defaults to recommended route
  selectedCheckpointKey: string | null, // `${route_id}:${index}`
  heatmap: { visible: true, hour: 0, metric: 'RISK' }
}
```
Actions: `FORM_CHANGED`, `PLAN_REQUESTED`, `PLAN_SUCCEEDED`, `PLAN_FAILED`, `ROUTE_SELECTED`, `CHECKPOINT_SELECTED`, `HEATMAP_HOUR_SET`, `HEATMAP_METRIC_SET`, `HEATMAP_VISIBILITY_SET`. `selectors.js` holds derived data (selected route, recommended route, checkpoint lookup).

### 17.3 Trip form
- `LocationInput`: debounced (300 ms) call to `/geocode/suggest`, keyboard-accessible listbox, user must **pick a suggestion** (stores label + lat/lng). Typing again clears the selection.
- `DepartureInput`: `<input type="datetime-local">`, default = next full hour; helper text shows timezone; validates window (Section 15.3).
- `LoadWeightInput`: integer lb, 1–80,000, thousands separators on blur.
- `IntervalSelect`: segmented control 10 / 25 / 50 mi, default 25.
- Submit disabled until valid; `usePlanTrip` aborts any in-flight request (AbortController) before a new one.

### 17.4 Results panel
- `RecommendationBanner`: recommended route name, reasons list, **warning style** when `status = OK_WITH_WARNING` (orange for Severe, red for No Travel).
- `RouteCard` ×3 (clickable): label + color swatch, "Recommended" badge, distance, buffered duration, departure → arrival, `RiskBadge` (max level), avg risk, `RiskBreakdownBar` (stacked horizontal bar of miles by level, with numbers in tooltip/text for accessibility).
- `CheckpointTable` for the selected route: columns `Mile · ETA · Wind (gust) · Rain · Snow · Risk`. Row click selects checkpoint and flies the map there. Selected row highlighted. Sticky header.
- `NoticesPanel` renders `notices`.
- `ResultsSkeleton` while loading; `ErrorPanel` maps error codes to friendly text with a retry button.

### 17.5 Map (`components/map/MapView.jsx`, `src/map/*`, `hooks/useMapInstance.js`)
- MapLibre instance created once in a client component (dynamic import with `ssr: false`); default style per D-31 from `NEXT_PUBLIC_MAP_STYLE_URL` (`https://tiles.openfreemap.org/styles/positron`, light, low-noise, fallback to `liberty`). Map sits inside a rounded (24 px) frame on the dark section.
- **Sources** (all GeoJSON; update with `setData`, never remove/re-add layers on interaction):
  - `routes-src` — one `LineString` feature per route with props `route_id, color_key, is_recommended`.
  - `checkpoints-src` — one `Point` per checkpoint of **all routes** with props `route_id, index, level, label`.
  - `heatmap-src` — one `Point` per heatmap point with prop `intensity` for the current hour.
- **Layers (bottom → top):** `heatmap-layer` → `routes-casing` → `routes-line` → `checkpoints-circle` → `checkpoints-selected`.
  - Selected route: full opacity, 5 px; other routes: 55 % opacity, 3 px. Recommended route gets a distinct outline.
  - Checkpoints: circle color via `match` on `level` (palette in `riskLevels.js`); non-selected routes' checkpoints are hidden below zoom 7 and shown small otherwise; selected route's checkpoints always shown.
  - Hover → pointer cursor; click → select route/checkpoint and open `CheckpointPopup` (mile, ETA, weather incl. gusts, risk with driver and load rule text).
- Fit bounds to all routes after each successful plan (`bounds.js`), with padding for the sidebar (`duration: 900`, easing from `--motion-ease`).
- Heatmap layer: `heatmap-weight` from `intensity`, radius interpolated by zoom, color ramp transparent → yellow → orange → red → dark red, opacity 0.75, placed **below** route lines.
- **Animations (Section 25.5):**
  - Route draw-in: on a new plan only, reveal each route polyline progressively over ~900 ms (ease-out, staggered 120 ms, `map/routeAnimation.js`). Skip when reduced motion.
  - Selected checkpoint: DOM marker with a CSS pulsing ring (transform scale + opacity loop) at the selected checkpoint; removed when deselected.
  - Heatmap visibility: `heatmap-opacity-transition` ~300 ms when toggling visibility.
  - **No animation or transition on the heatmap slider data path.**
- **Slider performance (critical, 40% of grade):**
  - All 49 hours are already in memory; the slider only rebuilds one GeoJSON `FeatureCollection` for hour `h` (≤ ~1000 features) and calls `setData`, throttled with `requestAnimationFrame`. No network call on slider move.
  - `useHeatmapFrame` memoizes per `(hour, metric)` feature collections (LRU of 8).
  - Slider shows both `+Nh` and the absolute time in the browser time zone.
  - No React re-render of the map component on slider changes: `MapView` receives the frame through a ref/subscription; only `HeatmapControls` re-renders.
- Performance budgets: slider drag ≥ 55 fps on a mid-range laptop for a 1,500-mile trip; route/heatmap first paint < 500 ms after response parsed; main-thread blocking per update < 16 ms.

### 17.6 API client (`lib/api/`)
- `client.js`: `fetchJson(path, { method, body, signal })`; base URL = `process.env.NEXT_PUBLIC_API_BASE_URL ?? ''` (empty → same-origin rewrite). Parses the error format into `ApiError`.
- `plan.js`: `planTrip(payload, { signal })`. `geocode.js`: `suggestPlaces(q, { signal })`.
- Departure conversion: `departure_local` (from `datetime-local`) → `new Date(value).toISOString()`-style ISO with offset before sending (documented in `format/time.js`).

### 17.7 Styling rules

**Theme tokens (defined once in `globals.css`):**
```css
--color-white:#fff; --color-ink:#111; --color-cobalt:#2f63ff; --color-giant:#e9e9e9;
--surface-1:#161616; --surface-2:#1d1d1d; --surface-3:#262626;
--border-subtle:rgba(255,255,255,.12); --border-strong:rgba(255,255,255,.28);
--text-primary:#fff; --text-muted:rgba(255,255,255,.62); --text-faint:rgba(255,255,255,.4);
--motion-fast:150ms; --motion-base:280ms; --motion-slow:600ms;
--motion-ease:cubic-bezier(.22,1,.36,1); --motion-ease-inout:cubic-bezier(.4,.05,.55,.95);
```
Tailwind v4 `@theme` maps these to utilities; font utilities: `font-display` (Anton), `font-body` (Archivo), `font-mono` (JetBrains Mono).

**Typography rules:** Anton uppercase for big headings/titles; Archivo for UI/body; **all numbers with units (miles, mph, in/hr, lb, times, durations) use JetBrains Mono with `tabular-nums`**.

**Components on the dark section:** surfaces `--surface-1/2`, 1 px `--border-subtle`, radius 16–24 px, text `--text-primary/muted`. Primary button: white pill with ink text (hover cobalt); secondary: outline pill. Focus ring: 2 px cobalt + 2 px offset. Inputs: `--surface-2`, border `--border-subtle`, focus border cobalt.

**Risk palette (unchanged values) in `riskLevels.js`, now with `textColor` and `outline`:**

| Level | Fill | Text on fill | Extra |
|---|---|---|---|
| LOW | `#2E9E5B` | `#111` | |
| MODERATE | `#F2C94C` | `#111` | |
| HIGH | `#F2994A` | `#111` | |
| SEVERE | `#EB5757` | `#111` | |
| NO_TRAVEL | `#6B1D1D` | `#fff` | 1 px `rgba(255,255,255,.4)` outline so it is visible on dark surfaces |

Route colors: A `#2F80ED`, B `#9B51E0`, C `#00A3A3`. Risk never relies on color alone (always a text label). All text must meet WCAG AA contrast on its background. Accessibility: labels on inputs, focus rings, `aria-live` region announcing loading/success/error, keyboard-operable slider.

### 17.8 `next.config.mjs`
```js
async rewrites() {
  return [{ source: '/api/:path*', destination: `${process.env.BACKEND_URL}/api/:path*` }];
}
```
`BACKEND_URL` is server-side only (not `NEXT_PUBLIC_`).

### 17.9 `frontend/.env.example`
```
BACKEND_URL=http://127.0.0.1:8000
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/positron
```

---

## 18. Error and edge-case handling

| Situation | Behavior |
|---|---|
| Fewer than 3 routes | Show available routes + `FEWER_THAN_3_ROUTES` notice. |
| Origin ≈ destination (<1 mi) | 400 validation error. |
| Route shorter than interval | Two checkpoints (start, end). |
| Departure beyond 5 days | `LONG_RANGE_FORECAST` notice. |
| Departure outside allowed window | 400 with message of the allowed window. |
| Weather nulls / failed chunks | One retry, then 502 `UPSTREAM_WEATHER_ERROR` (D-21). |
| ETA beyond available forecast hours | Clamp to last available hour; set heatmap `truncated` / notice `HEATMAP_TRUNCATED` only for heatmap; checkpoint clamping logged. |
| Heatmap point count over cap | Thin heatmap interval (Section 12.4), notice `HEATMAP_THINNED`. |
| HERE returns >3 routes | Take first 3. |
| Client aborts request | Frontend ignores aborted responses; backend completes harmlessly. |

---

## 19. Caching and rate-limit strategy

- Weather is cached **per grid point** (30 min) so repeated plans, alternate intervals, and shared corridors reuse data.
- Interval change re-calls `/plan` (cheap after the first call because routes and weather are cached).
- Open-Meteo free tier is ~10,000 calls/day; each grid point counts as a call. A 1,000-mile trip at 25 mi with 3 routes uses on the order of 100–200 unique points. Keep `MAX_UNIQUE_WEATHER_POINTS` and the 50-per-request chunking.
- Vercel instances do not share memory; `LocMemCache` is best-effort. This is acceptable; the Redis option exists but is **not required** for the assessment.

---

## 20. Testing strategy

**Backend (pytest, no network):**
- `domain/`: risk (Section 9.5), geometry (haversine known distances, interpolation, simplify keeps endpoints and ≤ max points), sampling (counts, last point = destination, segment sums), eta (nearest-hour rounding, DST-free UTC math), aggregation, ranking (Section 13.3), heatmap (49 hours, load-aware).
- `clients/`: parse recorded fixtures with `httpx.MockTransport`; multi-location list vs single-object response; null handling; chunking.
- `planner/`: `plan_trip` with fake clients injected (clients are passed in as dependencies, not imported globally inside functions).
- `api/`: endpoint validation, error format, happy path with fake planner.

**Frontend (Vitest):** `riskLevels`, `format/*`, `tripReducer`, `geojson` builders. No browser E2E required.

**Manual checklist (record in README):** short trip (<25 mi), cross-country trip, 10/25/50 intervals, heavy load (>40k) vs light load on a windy forecast, slider scrub smoothness, mobile layout, error states (disable network, bad key).

---

## 21. Documentation and deliverables

| Item | Requirement |
|---|---|
| `README.md` | Overview, screenshots, live URL, architecture summary, local setup (backend + frontend), env vars, how risk/ranking work (link to `docs/RISK_ENGINE.md`), known limitations, API credits/attribution. |
| `docs/RISK_ENGINE.md` | Thresholds, boundary rule, load rules, tie-breaks, worked examples. |
| `docs/API.md` | Mirror of Section 15. |
| `docs/DECISIONS.md` | Copy of Section 3 table, plus every deviation (date, reason). |
| `docs/DEPLOYMENT.md` | Exact Vercel steps for both projects, env vars, Render fallback. |
| `docs/LOOM_SCRIPT.md` | 5–10 min outline: problem → architecture → risk logic with a worked example → ranking → map + heatmap demo → code quality (tests, layering) → limitations. |
| GitHub | Public repo, meaningful commit history (one per task). |
| Hosted app | Both Vercel projects live; README links the frontend URL. |

**Known limitations to state honestly in the README:** linear-by-distance ETA interpolation; no hours-of-service modeling; forecast resolution ≈ weather-model grid; Open-Meteo free tier is non-commercial; HERE freemium limits; LocMem cache is per-instance on serverless.

---

## 22. Build plan (small tasks)

Each task lists **Scope**, **Files**, and **Done when**. Do them in order.

| ID | Task | Done when |
|---|---|---|
| T-01…T-13 | (complete — backend) | — |
| T-14 | Merge this patch into `ARCHITECTURE.md`; confirm `docs/HERO_SPEC.md` exists; update `docs/DECISIONS.md` | Doc merged, patch file deleted, docs only. |
| T-15 | Frontend foundation + theme tokens + fonts + motion tokens | Reducer/format/riskLevels/motion tests pass; fonts and tokens render on a test page. |
| T-16 | Hero core (scene, video scrub, band, giant letters, strip with plain cards) | Scrub, strip travel, letters-behind-truck all work. |
| T-17 | Hero finish (icons, card reveal gradient, readout, pill, phone layout, reduced motion) | Hero matches 25.6 acceptance on desktop and phone. |
| T-18 | Page composition, PlannerSection shell, motion primitives | Hero flows into planner; Reveal/CountUp work. |
| T-19 | Trip form (themed) | Valid submit calls `/plan`. |
| T-20 | Map base + routes + route draw-in animation | 3 routes animate in and are selectable. |
| T-21 | Checkpoints + popup + selected pulse | Risk-colored checkpoints and popup. |
| T-22 | Results panel (themed, animated) | Cards/banner/table synced with map. |
| T-23 | Heatmap + slider | Smooth slider within budgets. |
| T-24 | Motion polish pass | Every animation in 25.5 present, reduced-motion verified. |
| T-25 | Responsive + accessibility | 375/768/1440 verified, keyboard flow works. |
| T-26 | Performance pass (map, heatmap, hero) | Budgets in 17.5 and 25.3 met. |
| T-27 | Deploy | Live URL works end to end. |
| T-28 | Docs + Loom prep | Section 21 complete (add hero section to README). |
| T-29 | Final audit | Section 24 + 25.6 all pass. |

---

## 23. Deployment

1. **Backend project (Vercel):** import repo → Root Directory `backend` → framework auto-detected as Django → set env vars from 16.2 (`HERE_API_KEY` is required) → deploy → note URL.
2. **Frontend project (Vercel):** import same repo → Root Directory `frontend` → env: `BACKEND_URL=<backend URL>` and optional `NEXT_PUBLIC_MAP_STYLE_URL` → deploy.
3. Add the frontend URL to backend `CORS_ALLOWED_ORIGINS` (only needed if calling the backend directly).
4. Smoke test: `/api/v1/health` through the frontend domain, then a real plan.
5. **Fallback (only if Vercel limits break the plan call):** deploy `backend/` to Render as a Python web service with build `pip install -r requirements.txt` and start `gunicorn config.wsgi --timeout 60`; point `BACKEND_URL` at it. Record the switch in `docs/DECISIONS.md`.

---

## 24. Definition of done (project level)

- [ ] 3 truck routes returned (or notice shown) and drawn on the map.
- [ ] Checkpoints at 10/25/50 mi with ETAs, weather, risk (gusts shown).
- [ ] Risk matches Section 9 for all golden tests; load rules verified.
- [ ] Recommendation follows Section 13 and explains itself.
- [ ] Heatmap with 0–48 h slider, load-aware, smooth.
- [ ] No DB; caching works; weather failures surface as clear errors.
- [ ] Unit tests pass; lint passes; layering rule respected.
- [ ] README, docs, hosted URL, GitHub repo, Loom recorded.
- [ ] Hero acceptance (25.6) passes on desktop and phone.
- [ ] Theme tokens used everywhere; no hard-coded colors outside `globals.css`, `riskLevels.js`, `hero.css`.
- [ ] Reduced-motion mode verified.

---

## 25. Landing hero, theme, motion

### 25.1 Page composition
`app/page.jsx` renders `<ScrollHero />` then `<PlannerSection />`. The hero's final frame ends with the black band at the bottom of the viewport; `PlannerSection` background is `#111`, so the band flows into the planner with no visible seam as the white part of the scene scrolls away. The hero pill and nav links smooth-scroll to `#planner` (instant when reduced-motion is on). `#planner` has `scroll-margin-top: 0`.

### 25.2 Hero port rules (React)
**Source of mechanics:** `docs/HERO_SPEC.md` — track height `(1 + A + B)` viewports, A = 2.4, B from strip width, sticky scene, video framing math (cover vs portrait), `--edge-px`, giant letters with `mix-blend-mode: darken`, strip and letters translate formulas, card gradient reveal, settled flag `--ph`, speed readout, phone layout.

**Port rules:**
- A single client component tree: `ScrollHero` (owns refs and the `useHeroScroll` hook) → `HeroNav`, `HeroStrip` → `HeroCard`. No framework-external globals; no `document.write`.
- All DOM reads/writes (video `currentTime`, CSS variables, transforms) happen in the rAF loop via refs, **not React state**. React must not re-render on scroll.
- Layout measurements (strip width, letters width, viewport) are recomputed on mount, on `resize`/`orientationchange`, and after fonts load (`document.fonts.ready`). Track height is set via a CSS variable on the track element. Before JS runs, the track has a sensible fallback height (e.g. `min-height: 600vh`) to limit layout shift.
- The `<video>`: `muted`, `playsInline`, `preload="auto"`, `poster` set, `disablePictureInPicture`, `aria-hidden="true"`; never `play()`ed or looped.
- Source selection: 720p if viewport ≤ 900 px or `navigator.connection?.saveData`; otherwise 1080p.
- `?rec=1` recorder mode: **not implemented** (D-32).

**Content overrides (replace the KV freight copy; everything else stays):**

| Element | Value |
|---|---|
| Brand (nav left) | `BRAND_NAME` = "HAULCAST" (placeholder; one constant) |
| Nav right | text link "→ Planner" (to `#planner`) and outline pill "Plan a route" (to `#planner`). Remove "Menu" and "Follow". |
| Giant letters | "SAFER ROUTES" (12 characters, same fit as "OUR SERVICES") |
| Bottom pill | "Plan a route" (scrolls to `#planner`) |
| Readout | "NN MPH" (same smoothed scroll-speed logic, label changed) |
| Strip headline | line 1 "KNOW YOUR ROUTE." · line 2 "MILE BY MILE." · line 3 "BEFORE YOU ROLL." (line 3 cobalt) |
| Paragraph 1 | "We pull truck-specific route options, then check the forecast at your estimated arrival time at every checkpoint along the way." |
| Paragraph 2 | "Wind, rain and snow are scored against your load weight, so the recommendation fits your truck, not a generic car." |

**Five cards** (title is two lines in Anton; icon is a white line icon in `HeroIcons.jsx`):
| # | Title (2 lines) | Icon | Body |
|---|---|---|---|
| 1 | TRUCK / ROUTES | route (two pins joined by a path) | "Three truck-profile route options per trip, compared side by side on one map." |
| 2 | WEATHER AT / EVERY MILE | cloud with rain lines | "Wind, rain and snow forecast for your arrival time, every 10, 25 or 50 miles." |
| 3 | LOAD-AWARE / RISK RULES | weight/scale | "Heavier loads trigger stricter wind limits, scored from Low to No Travel." |
| 4 | SMART / RECOMMENDATION | shield with check | "Fewest Severe and High miles first, then average risk, then travel time." |
| 5 | 48-HOUR / HEATMAP | stacked layers | "Scrub a forecast heatmap along your corridor to find the safest window." |

No real brands or logos anywhere.

### 25.3 Hero technical requirements
- **One rAF loop**, started when the track is within ~1 viewport of the screen (IntersectionObserver with `rootMargin`) and stopped when it is not. Never two loops.
- **Clip time:** `q = clamp(scrollY / (A·vh))`; target = `q × (duration − 1/48)`; ease `cur += (target − cur) × 0.2`; set `currentTime` only if `!video.seeking` and `|Δ| > 1/60`; re-seek on `seeked`.
- **Strip / letters / readout / `--ph`:** exactly as in `HERO_SPEC.md` ("Scroll mapping").
- **Reduced motion:** ease factor becomes 1 (no smoothing), pill fade/rise disabled, smooth-scroll disabled. Scrubbing itself stays (it is user-driven).
- **Resize safety:** no stale measurements; no horizontal scroll at any width (`overflow-x: clip` on the track where needed).
- **Blend trick:** giant letters sit **behind** the vehicles through `mix-blend-mode: darken` on a `#e9e9e9` text over the white parts of the clip; do not add opacity transitions to the video.
- **Phones (< 768 px or portrait):** layout rules from `HERO_SPEC.md` "Phones".
- **Perf budget:** no long tasks > 50 ms in the loop; at most one style write batch per frame; `will-change: transform` only on strip and letters.
- **iOS Safari:** verify scrubbing works with `muted playsInline preload="auto"`; if the first seek does not render, document the workaround in `docs/DECISIONS.md` (do not play the video).
- **Accessibility:** decorative layers `aria-hidden`; nav links and pill are real `<a>` elements with visible focus; the cards are real text (selectable).

### 25.4 Planner section design
- Eyebrow (Archivo, uppercase, tracked) "THE PLANNER" + heading "PLAN YOUR ROUTE" (Anton, large, white). A thin cobalt rule animates under the heading on first reveal.
- Sidebar panel: `--surface-1`, radius 24, internal padding 20–24 px. Form fields stacked with generous spacing; the interval control is a segmented pill; the submit button is a white pill ("Find safest route") with a cobalt progress sweep while loading.
- Map frame: radius 24, 1 px `--border-subtle`, overlay controls use `--surface-1` with blur-free solid backgrounds (no `backdrop-filter`, for performance).
- Empty state (before first plan): short illustrated instruction with three numbered steps in mono numerals.

### 25.5 Motion system (all must respect `prefers-reduced-motion`)
Tokens: `--motion-fast/base/slow`, `--motion-ease`, `--motion-ease-inout`; JS mirror in `lib/motion.js` (same numbers). Animate **transform and opacity only**.

| Where | Animation |
|---|---|
| `Reveal` (generic) | Fade + translateY(16px → 0), `--motion-slow`, ease; optional stagger delay prop (default 60 ms steps). Triggers once via IntersectionObserver. |
| Planner heading | Words slide up inside an overflow-hidden mask; cobalt rule scales from 0 to 100 % width (origin left). |
| Sidebar panel / map frame | Reveal on first view, 80 ms stagger between them. |
| Autocomplete listbox | Fade + 6 px slide, `--motion-fast`; options highlight with background transition. |
| Submit button | Press scale 0.98; loading: cobalt bar sweeps (translateX loop) inside the pill; text switches to "Planning…". |
| Results appear | `ResultsSkeleton` shimmer (translateX gradient) while loading; on success banner then route cards stagger in (50 ms steps, translateY 16 → 0 + fade). |
| Recommendation banner | Cobalt underline sweeps under the recommended route name once. |
| `RiskBreakdownBar` | Segments grow from `scaleX(0)` to full, origin left, 600 ms ease, staggered by level. |
| Numbers | `CountUp` for distance, duration, avg risk (600 ms, ease-out, mono tabular numerals, final value exact). |
| Route card selection | Border color transition (cobalt) + 2 px lift (`translateY(-2px)`), `--motion-fast`. |
| Map: route draw-in | On a **new plan only**: reveal each route polyline progressively by feeding a growing prefix of its coordinates to the source with rAF over ~900 ms (ease-out), routes staggered 120 ms; skip when reduced motion; do not run on selection changes. `map/routeAnimation.js`. |
| Map: fit bounds | `easeTo/fitBounds` with `duration: 900`, easing from `--motion-ease` (0 when reduced motion). |
| Map: selected checkpoint | A DOM marker with a CSS pulsing ring (transform scale + opacity loop) at the selected checkpoint; removed when deselected. |
| Map: heatmap visibility | `heatmap-opacity-transition` ~300 ms when toggling visibility. **No transition on slider data updates.** |
| Hero | Per `HERO_SPEC.md` plus pill fade/rise at settle. |

### 25.6 Acceptance
**Hero (desktop 1440×960):** on load the stacker holds the container under the nav; scrolling lifts, turns and loads the truck, then pulls back until the truck sits on the black band; "SAFER ROUTES" passes behind the truck (no letters over the container or cab); the headline enters from the right followed by five cards sweeping blue to white; the MPH number follows scroll speed; scrolling back reverses everything; the pill and nav links scroll to `#planner`; the black band flows into the planner section without a seam.
**Hero (phone):** no horizontal scroll; framing per spec; strip and cards readable.
**Theme:** every screen uses the tokens; fonts load without layout jump; numbers use mono tabular figures.
**Motion:** each row of 25.5 present; reduced-motion shows the final states with no motion; the slider path stays animation-free and smooth.
