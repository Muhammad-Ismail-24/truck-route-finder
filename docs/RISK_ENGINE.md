# RISK_ENGINE.md — Weather Risk Classifier

> **Source of truth:** ARCHITECTURE.md Section 9. This document is a human-readable
> expansion of that section. In any conflict, ARCHITECTURE.md wins.

---

## 1. Overview

The risk engine classifies each route checkpoint into one of five ordered risk levels:

| Level | Integer | Meaning |
|---|---|---|
| `LOW` | 1 | Safe conditions |
| `MODERATE` | 2 | Caution advised |
| `HIGH` | 3 | Significant hazard |
| `SEVERE` | 4 | Dangerous; consider alternatives |
| `NO_TRAVEL` | 5 | Do not proceed |

The final checkpoint level is the **worst of** wind, rain, and snow levels after
load-based escalation is applied to the wind component (D-05).

---

## 2. Base Thresholds (Section 9.2)

### 2.1 Wind (mph) — `classify_wind`

Uses **sustained wind speed** (`wind_speed_10m` from Open-Meteo, requested in mph).
Wind gusts are **displayed only** and never influence risk (D-03).

| Level | Rule |
|---|---|
| LOW | `wind_mph < 25` |
| MODERATE | `25 ≤ wind_mph < 35` |
| HIGH | `35 ≤ wind_mph < 45` |
| SEVERE | `45 ≤ wind_mph < 55` |
| NO_TRAVEL | `wind_mph ≥ 55` |

### 2.2 Rain (in/hr) — `classify_rain`

Rain rate = `rain + showers` (liquid only; the `precipitation` variable is excluded
because it includes snow water equivalent). See Section 9.1.

| Level | Rule |
|---|---|
| LOW | `rain_in_hr < 0.10` |
| MODERATE | `0.10 ≤ rain_in_hr < 0.25` |
| HIGH | `0.25 ≤ rain_in_hr < 0.50` |
| SEVERE | `0.50 ≤ rain_in_hr ≤ 1.00` |
| NO_TRAVEL | `rain_in_hr > 1.00` |

### 2.3 Snow (in/hr) — `classify_snow`

Snowfall depth rate in in/hr, matching Open-Meteo `snowfall` directly (D-04).

| Level | Rule |
|---|---|
| LOW | `snow_in_hr < 0.5` |
| MODERATE | `0.5 ≤ snow_in_hr < 1.0` |
| HIGH | `1.0 ≤ snow_in_hr < 2.0` |
| SEVERE | `2.0 ≤ snow_in_hr ≤ 3.0` |
| NO_TRAVEL | `snow_in_hr > 3.0` |

---

## 3. The Boundary Rule (D-02)

> **A value that sits exactly on a boundary belongs to the *higher* risk level.**

All intervals are **half-open `[lower, upper)`** except at the very top of SEVERE,
where the spec uses `≤` to mean the ceiling of SEVERE is *inclusive* (e.g. rain 1.00
is SEVERE, not NO_TRAVEL; but 1.01 is NO_TRAVEL).

**Why?** Safety-conservative design: when a value is ambiguous, the more dangerous
classification wins. This eliminates any "ties at the boundary" and makes the
implementation deterministic.

### Implementation pattern (wind example)

```python
if wind_mph < 25:    return LOW
if wind_mph < 35:    return MODERATE   # 25 is caught here, not in LOW
if wind_mph < 45:    return HIGH       # 35 is caught here
if wind_mph < 55:    return SEVERE     # 45 is caught here
return NO_TRAVEL                       # 55+ including exactly 55
```

---

## 4. Load Rules — Wind Escalation (Section 9.3)

Load rules only escalate the **wind** component (never rain or snow).
They are evaluated on raw `wind_mph` and `load_weight_lb` (integer, 1–80 000 lb).

> [!IMPORTANT]
> Load boundaries use **strict `>`** (D-09). A load of exactly 30 000 lb does **not**
> trigger Rule 2. A load of exactly 40 000 lb does **not** trigger Rule 3.

### Rule priority (evaluated in order)

| Priority | Condition | Effect | `load_rule` field |
|---|---|---|---|
| 1 | `wind_mph ≥ 55` (any load) | `NO_TRAVEL` | `None` — already the base level |
| 2 | `45 ≤ wind_mph < 55` **and** `load > 30 000` | Escalate to `NO_TRAVEL` | `"WIND_45_54_OVER_30K"` |
| 3 | `35 ≤ wind_mph < 45` **and** `load > 40 000` | Escalate to at least `SEVERE` | `"WIND_35_44_OVER_40K"` |

`wind_level = max(base_wind_level, rule_level)`

The `load_rule` field on `RiskAssessment` is `None` when no rule raised the level
(including Rule 1, which cannot raise it above the base `NO_TRAVEL`).

---

## 5. Full Checkpoint Classification (Section 9.4)

```
wind_level, load_rule = apply_load_rules(weather.wind_mph, load_weight_lb)
rain_level            = classify_rain(weather.rain_in_hr)
snow_level            = classify_snow(weather.snow_in_hr)

level  = max(wind_level, rain_level, snow_level)          # D-05
driver = first of [WIND, RAIN, SNOW] where level == max   # tie-break order
```

**Tie-break order (D-05):** WIND → RAIN → SNOW.
When two or more phenomena share the maximum level, the driver listed earliest
in that sequence is selected. This is deterministic and meaningful: wind is the
most operationally significant hazard for trucks.

---

## 6. Worked Examples

### Example 1 — Light conditions (all zeros)

| Input | Value |
|---|---|
| `wind_mph` | 0.0 |
| `rain_in_hr` | 0.0 |
| `snow_in_hr` | 0.0 |
| `load_weight_lb` | 20 000 |

- `classify_wind(0)` → LOW (0 < 25)
- `classify_rain(0)` → LOW (0 < 0.10)
- `classify_snow(0)` → LOW (0 < 0.5)
- No load rule (wind < 35)
- **Result:** `level=LOW, driver=WIND, load_rule=None`

---

### Example 2 — Rain dominates over moderate wind

| Input | Value |
|---|---|
| `wind_mph` | 30.0 |
| `rain_in_hr` | 0.30 |
| `snow_in_hr` | 0.0 |
| `load_weight_lb` | 20 000 |

- `classify_wind(30)` → MODERATE (25 ≤ 30 < 35)
- `classify_rain(0.30)` → HIGH (0.25 ≤ 0.30 < 0.50)
- `classify_snow(0)` → LOW
- No load rule (wind < 35)
- `level = max(MODERATE, HIGH, LOW)` = HIGH
- WIND=MODERATE ≠ HIGH; RAIN=HIGH → **driver = RAIN**
- **Result:** `level=HIGH, driver=RAIN, load_rule=None`

---

### Example 3 — Heavy load escalates wind to NO_TRAVEL

| Input | Value |
|---|---|
| `wind_mph` | 50.0 |
| `rain_in_hr` | 0.0 |
| `snow_in_hr` | 0.0 |
| `load_weight_lb` | 30 001 |

- `classify_wind(50)` → SEVERE (45 ≤ 50 < 55)
- Rule 2: `45 ≤ 50 < 55` **and** `30 001 > 30 000` → escalate to NO_TRAVEL
- `load_rule = "WIND_45_54_OVER_30K"`
- **Result:** `level=NO_TRAVEL, driver=WIND, load_rule="WIND_45_54_OVER_30K"`

Compare: `load_weight_lb=30 000` (exactly) → Rule 2 not triggered → SEVERE, load_rule=None.

---

### Example 4 — Moderate load does not trigger 40 k rule

| Input | Value |
|---|---|
| `wind_mph` | 40.0 |
| `rain_in_hr` | 0.0 |
| `snow_in_hr` | 0.0 |
| `load_weight_lb` | 40 000 |

- `classify_wind(40)` → HIGH (35 ≤ 40 < 45)
- Rule 3 check: `35 ≤ 40 < 45` ✓ but `40 000 > 40 000`? **No** (strict >). Rule not triggered.
- **Result:** `level=HIGH, driver=WIND, load_rule=None`

---

### Example 5 — Wind and load dominate rain; tie-break in action

| Input | Value |
|---|---|
| `wind_mph` | 40.0 |
| `rain_in_hr` | 0.30 |
| `snow_in_hr` | 0.0 |
| `load_weight_lb` | 50 000 |

- `classify_wind(40)` → HIGH base; Rule 3: `40 < 45` ✓, `50 000 > 40 000` ✓ → SEVERE
- `load_rule = "WIND_35_44_OVER_40K"`
- `classify_rain(0.30)` → HIGH
- `classify_snow(0)` → LOW
- `level = max(SEVERE, HIGH, LOW)` = SEVERE
- WIND_level=SEVERE → **driver = WIND**
- **Result:** `level=SEVERE, driver=WIND, load_rule="WIND_35_44_OVER_40K"`

---

### Example 6 — SEVERE snow with boundary exactness

| Input | Value |
|---|---|
| `wind_mph` | 0.0 |
| `rain_in_hr` | 0.0 |
| `snow_in_hr` | 3.0 |
| `load_weight_lb` | 20 000 |

- `classify_snow(3.0)` → SEVERE (2.0 ≤ 3.0 ≤ 3.0; inclusive ceiling)
- **Result:** `level=SEVERE, driver=SNOW, load_rule=None`

Now with `snow_in_hr=3.01`:
- `classify_snow(3.01)` → NO_TRAVEL (3.01 > 3.0)
- **Result:** `level=NO_TRAVEL, driver=SNOW, load_rule=None`

---

### Example 7 — Gust has no effect (D-03)

| Input | Value |
|---|---|
| `wind_mph` | 10.0 (sustained) |
| `wind_gust_mph` | 999.0 |
| `rain_in_hr` | 0.0 |
| `snow_in_hr` | 0.0 |
| `load_weight_lb` | 20 000 |

- `classify_wind(10.0)` → LOW (gust is ignored entirely)
- **Result:** `level=LOW, driver=WIND, load_rule=None`

---

## 7. Decision Cross-Reference

| Decision | Where it matters |
|---|---|
| D-02 | Boundary rule: value belongs to higher level; half-open intervals |
| D-03 | `wind_gust_mph` is never passed to any classifier |
| D-04 | `snow_in_hr` = Open-Meteo `snowfall` directly (in/hr) |
| D-05 | `level = max(wind, rain, snow)`; tie-break WIND > RAIN > SNOW |
| D-09 | Load boundary: strict `>`; 30 000 and 40 000 exactly do NOT trigger |
