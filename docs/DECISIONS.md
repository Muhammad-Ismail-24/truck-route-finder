# Decision Log

Each decision has an id. Do not change a locked decision without recording a new entry here.

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
| D-22 | Region | US-focused: geocode suggestions restricted to `countryCode:USA`; units are mph, in/hr, lb, miles. | Spec units are US. |
| D-23 | Route count | Request `alternatives=2` (→ up to 3 routes). If fewer than 3 are returned, show what exists and add notice `FEWER_THAN_3_ROUTES`. | Cannot manufacture routes that do not exist. |
| D-24 | Truck weight for routing | Pass HERE `truck[grossWeight]` = `(load_weight_lb + TRUCK_TARE_LB) × 0.45359237` kg, capped at 80,000 lb. `TRUCK_TARE_LB = 32000`. | Routing needs gross weight; spec input is load weight. Documented assumption. |
