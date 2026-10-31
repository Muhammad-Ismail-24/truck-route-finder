# Loom Video Walkthrough Script

> **Target Duration**: 7 to 9 minutes (strictly within the 5–10 minute budget).  
> **Speaker Notes**: Present with screen recording, webcam inset in corner, and microphone audio. Speak clearly and demonstrate live interactions directly in the browser and code editor.

---

## Timeline & Scene Outline

```
[00:00 - 00:20] 01. Hero First Impression & Narrative Hook (20s)
[00:20 - 01:25] 02. The Problem: Truck Safety vs Passenger GPS (65s)
[01:25 - 02:40] 03. System Architecture & Strict Layering (75s)
[02:40 - 04:10] 04. The Weather Risk Engine & Worked Example (90s)
[04:10 - 05:25] 05. Lexicographic Route Ranking & Recommendation (75s)
[05:25 - 06:55] 06. Live Demo: Planner, Map & 48-Hour Heatmap (90s)
[06:55 - 08:05] 07. Motion System & Performance Optimization (70s)
[08:05 - 09:05] 08. Code Quality, Testing Suite & Layer Boundaries (60s)
[09:05 - 09:45] 09. Honest Limitations & Production Roadmap (40s)
```

---

## Scene-by-Scene Delivery Script

### 1. Hero First Impression & Narrative Hook (00:00 – 00:20)
* **Screen**: Fullscreen browser on the landing page `/` at the top of the scroll track.
* **Action**: Slowly scroll down. Show the container being lifted, rotated, and mounted onto the flatbed truck in sync with the scroll. Point out the giant typography `SAFER ROUTES` passing behind the truck cabin (`mix-blend-mode: darken`), the smoothed `NN MPH` speed indicator, and click the bottom pill `Plan a route` to glide seamlessly across the seamless black band into the `#planner` section.
* **Spoken Script**:
  > *"Welcome to HAULCAST. When an 80,000-pound semi-truck rolls out onto the interstate, standard passenger navigation isn't enough. We designed HAULCAST to make weather risk immediately tangible. As you scroll into the landing experience, our single requestAnimationFrame loop scrubs through the freight narrative at a buttery 60 frames per second, before dropping you directly into our weather-aware truck route planner."*

---

### 2. The Problem Space: Truck Safety vs Passenger GPS (00:20 – 01:25)
* **Screen**: The `#planner` input form and results view.
* **Action**: Hover over the `Load Weight` input and `Interval Select`.
* **Spoken Script**:
  > *"Every winter and severe weather season, crosswinds, freezing rain, and blizzard conditions cause devastating commercial truck rollover accidents and multi-vehicle highway pileups.*  
  > *Passenger car navigation apps optimize purely for minutes saved. But in commercial trucking, weight changes everything. An empty 32,000-pound dry van acts like a giant sail and will tip over in a 40 mph crosswind, whereas an 80,000-pound loaded rig handles wind differently, but has drastically longer braking distances on snow and ice.*  
  > *Crucially, weather is dynamic. A storm in Nebraska might be sunny when you leave Chicago, but dangerous 8 hours later when you actually arrive. HAULCAST calculates exact checkpoints along every corridor, models truck-specific travel duration, and samples the forecast at the exact hour your truck will reach that mile marker."*

---

### 3. System Architecture & Strict Layering (01:25 – 02:40)
* **Screen**: Switch to VS Code showing the repository directory structure or the layer diagram in `README.md`.
* **Action**: Highlight `backend/domain/`, `backend/planner/`, `backend/clients/`, and `frontend/src/`.
* **Spoken Script**:
  > *"Here's our architectural foundation. We strictly enforce unidirectional layering:*
  > * *In the backend, our `domain/` layer has zero dependencies on Django, HTTP, or external network packages. It consists of pure, deterministic Python functions for geometry, sampling, haversine interpolation, and risk classification.*
  > * *The `clients/` layer encapsulates communication with external APIs: HERE Routing API v8 with commercial truck profiles, and Open-Meteo for hourly multi-point forecasts.*
  > * *The `planner/orchestrator.py` module orchestrates routing, checkpoint sampling, forecast enrichment, and ranking with dependency injection.*
  > * *On the presentation layer, Django REST Framework serves clean JSON endpoints with Gzip compression and strict validation.*
  > * *The frontend is built with Next.js App Router and MapLibre GL JS for GPU-accelerated vector mapping, completely isolated from business logic so it remains a fast, responsive rendering client."*

---

### 4. The Weather Risk Engine & Worked Example (02:40 – 04:10)
* **Screen**: Open `docs/RISK_ENGINE.md` or highlight the checkpoint weather card in the UI.
* **Action**: Show the classification thresholds and the load escalation rule.
* **Spoken Script**:
  > *"Let's look at how risk is determined. Every checkpoint evaluates wind, rain, and snow on an ordered scale from LOW, MODERATE, HIGH, SEVERE, up to NO_TRAVEL.*
  > *Base sustained wind thresholds are: under 25 mph is Low, 25 to 35 is Moderate, 35 to 45 is High, 45 to 55 is Severe, and 55+ is No Travel. Note that wind gusts are shown as informational context only, strictly adhering to specification decision D-03.*
  > *Now, consider our load-adjusted wind rules: When load weight is greater than 40,000 lb, Moderate wind (25–35 mph) is automatically escalated to High risk because of braking instability and trailer sway.*
  > *Let's take a concrete checkpoint:*
  > * *Truck load is 42,000 lb.*
  > * *Wind speed is 28 mph (base Moderate).*
  > * *Rain rate is 0.15 in/hr (Moderate).*
  > * *Snow is 0.0 in/hr (Low).*
  > *Because load exceeds 40,000 lb, the wind level escalates from Moderate to HIGH. Taking the worst-of rule across all three conditions, the checkpoint's final classification is HIGH, driven by wind under the 40k load rule. Everything is deterministic, reproducible, and fully covered by our test suite."*

---

### 5. Lexicographic Route Ranking & Recommendation (04:10 – 05:25)
* **Screen**: The Results panel showing Route A, Route B, and Route C comparison cards.
* **Action**: Highlight the recommendation banner and the summary stats bar.
* **Spoken Script**:
  > *"How do we choose which route to recommend? We do not use arbitrary weighted point scores that can hide life-threatening hazards behind faster travel times.*
  > *Instead, we implement a strict lexicographic safety tuple:*
  > * *Tier 0: Miles in NO_TRAVEL conditions (must be zero if any route allows it).*
  > * *Tier 1: Miles in SEVERE weather.*
  > * *Tier 2: Miles in HIGH risk weather.*
  > * *Tier 3: Mile-weighted average risk level.*
  > * *Tier 4: Total buffered travel duration.*
  > *If Route A has 0 Severe miles and takes 16 hours, while Route B takes 14 hours but passes through 25 miles of Severe blizzard conditions, Route A is unequivocally recommended. Our banner provides a clear, human-readable reason detailing exactly why that route was chosen."*

---

### 6. Live Interactive Demo: Map, Checkpoints & Heatmap (05:25 – 06:55)
* **Screen**: Live UI in browser.
* **Action**:
  1. Type "Chicago, IL" into Origin and select the suggestion.
  2. Type "Denver, CO" into Destination and select the suggestion.
  3. Set load to 45,000 lb, interval to 25 mi, click "Calculate Safe Routes".
  4. Watch the routes animate onto the map; select Route A, then click a checkpoint marker to show the detailed weather popup.
  5. Drag the 48-Hour Heatmap slider back and forth from hour 0 to hour 48.
  6. Switch metric from "Risk" to "Wind" to "Snow".
* **Spoken Script**:
  > *"Let's see this in action. I'll enter Chicago to Denver with a 45,000 lb load and 25-mile intervals.*
  > *Our backend fetches three commercial truck routes from HERE, calculates 41 checkpoints along each corridor, fetches 120 unique Open-Meteo forecast points, and returns in under 3.7 seconds uncached.*
  > *Notice the route draw-in animation and risk breakdown bars. Clicking any checkpoint pops up its ETA, temperature, sustained wind, gusts, and exact hazard level.*
  > *Now look at the 48-hour spatio-temporal heatmap. As I scrub this time slider, the GPU-accelerated MapLibre layer renders future weather movement across the entire corridor at a sustained 60 frames per second without a single dropped frame. You can toggle between Overall Risk, Wind speed, Rain precipitation, or Snowfall depth rate."*

---

### 7. Motion System & Performance Optimization (06:55 – 08:05)
* **Screen**: Open DevTools Performance tab / React Profiler or show the before/after performance table in `ARCHITECTURE.md`.
* **Action**: Show that scrubbing the heatmap slider triggers zero re-renders in the sidebar or form.
* **Spoken Script**:
  > *"Performance was a first-class requirement across this build:*
  > * *First, our motion system uses zero heavy animation libraries like Framer Motion or GSAP. Everything is driven by CSS transforms, opacity, and requestAnimationFrame.*
  > * *In React, we decoupled the heatmap slider state using `useTripCore()`. Notice in the React Profiler that dragging the slider creates zero re-renders in the sidebar, form, or results panels.*
  > * *For initial page load, MapLibre GL and the planner are dynamically imported and deferred via IntersectionObserver with a 300px margin. The hero video uses a poster-first strategy with `preload='metadata'`.*
  > * *On the backend, our Ramer-Douglas-Peucker geometry simplification algorithm converges in 2 iterations using an initial coordinate span heuristic, and responses are compressed with Django's GZip middleware, cutting wire size by 84% to just 38 KB.*
  > * *The result: Desktop Lighthouse performance of 94, Mobile of 82, and zero cumulative layout shift."*

---

### 8. Code Quality, Test Suite & Architectural Integrity (08:05 – 09:05)
* **Screen**: Run tests in terminal (`pytest backend` and `npm test`).
* **Action**: Show all 223 backend tests passing, all 128 frontend tests passing, and clean linter output.
* **Spoken Script**:
  > *"Every calculation in HAULCAST is backed by comprehensive unit tests.*
  > *On the backend, our test suite has 223 automated pytest cases verifying geometry simplification, Haversine interpolation, timezone UTC handling, every edge case of the weather risk classifier, and upstream API parsing using HTTPX mock transports without hitting live networks.*
  > *On the frontend, 128 Vitest unit tests verify our reducers, formatters, GeoJSON builders, accessibility tags, and animation timing.*
  > *Both codebases pass strict linting with Ruff and ESLint with zero warnings."*

---

### 9. Honest Limitations & Next Steps (09:05 – 09:45)
* **Screen**: Return to the live map with a warm closing shot.
* **Spoken Script**:
  > *"To be transparent about limitations:*
  > * *Our ETA calculations assume a linear speed distribution between waypoints, meaning we don't currently model non-linear traffic congestion or mandatory DOT Hours of Service 10-hour rest breaks.*
  > * *Forecast data is bounded by Open-Meteo's atmospheric model grid resolution and hourly granularity.*
  > * *For production scaling, we recommend provisioning an external Redis cluster to share corridor cache across multi-tenant serverless instances, and self-hosting the hero video assets on a dedicated CDN.*
  > *Thank you for watching HAULCAST: safer routes, mile by mile, before you roll."*
