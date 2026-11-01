# API Specification (`/api/v1`)

> **Base URL**: `/api/v1` (proxied same-origin from the frontend Next.js rewrite; direct backend calls require CORS configuration).  
> **Format**: JSON only (`application/json`).  
> **Authentication**: None required. Rate limited to 60 requests/minute per IP.

---

## 1. Endpoints

### 1.1 Health Check
Checks service operational status and upstream integration readiness.

* **Method**: `GET`
* **Path**: `/api/v1/health`
* **Response Status**: `200 OK`

#### Example Response
```json
{
  "status": "healthy",
  "service": "spotter-truck-routing",
  "version": "1.0.0",
  "checks": {
    "here_api": "configured",
    "open_meteo": "available",
    "cache": "operational"
  }
}
```

---

### 1.2 Geocode Suggest
Provides autocompletion suggestions for worldwide locations powered by the HERE Geocoding & Search API.

* **Method**: `GET`
* **Path**: `/api/v1/geocode/suggest?q={query}`
* **Query Parameters**:
  * `q` (string, required): Search query. Must be between 3 and 100 characters.

#### Example Request
```http
GET /api/v1/geocode/suggest?q=Chicago HTTP/1.1
Host: localhost:8000
```

#### Example Response (`200 OK`)
```json
{
  "results": [
    {
      "label": "Chicago, IL, United States",
      "lat": 41.8781,
      "lng": -87.6298
    },
    {
      "label": "Chicago Heights, IL, United States",
      "lat": 41.5061,
      "lng": -87.6356
    },
    {
      "label": "Chicago Ridge, IL, United States",
      "lat": 41.7031,
      "lng": -87.7781
    }
  ]
}
```

---

### 1.3 Plan Safe Routes
Computes up to three truck-specific routes between origin and destination, samples weather forecasts at each checkpoint according to estimated arrival time (ETA), evaluates severe weather risks against vehicle load, ranks routes lexicographically, and returns a 48-hour spatio-temporal weather heatmap.

* **Method**: `POST`
* **Path**: `/api/v1/plan`
* **Headers**: `Content-Type: application/json`

#### Request Payload
```json
{
  "origin": {
    "label": "Chicago, IL",
    "lat": 41.8781,
    "lng": -87.6298
  },
  "destination": {
    "label": "Denver, CO",
    "lat": 39.7392,
    "lng": -104.9903
  },
  "departure_time": "2026-11-02T08:00:00-06:00",
  "load_weight_lb": 42000,
  "checkpoint_interval_miles": 25
}
```

#### Validation Rules (HTTP 400 `VALIDATION_ERROR`)
* `origin`, `destination`: Valid latitude (`[-90, 90]`) and longitude (`[-180, 180]`). Origin and destination must be at least 1.0 mile apart.
* `departure_time`: Timezone-aware ISO-8601 timestamp within `[now - 60 min, now + 7 days]`.
* `load_weight_lb`: Integer between `1` and `80,000` lbs.
* `checkpoint_interval_miles`: Allowed integer choice of `10`, `25`, or `50` (defaults to `25` if omitted).

#### Example Response (`200 OK`, Trimmed)
```json
{
  "request_id": "a978f8cb-5e04-4c6e-9310-8b1e1b8b809a",
  "generated_at_utc": "2026-11-01T14:00:00Z",
  "input": {
    "origin": {
      "label": "Chicago, IL",
      "lat": 41.8781,
      "lng": -87.6298
    },
    "destination": {
      "label": "Denver, CO",
      "lat": 39.7392,
      "lng": -104.9903
    },
    "departure_utc": "2026-11-02T14:00:00Z",
    "load_weight_lb": 42000,
    "checkpoint_interval_miles": 25
  },
  "settings": {
    "delay_buffer": 1.1,
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
        "distance_miles": 1004.2,
        "base_duration_s": 54600,
        "buffered_duration_s": 60060,
        "departure_utc": "2026-11-02T14:00:00Z",
        "arrival_utc": "2026-11-03T06:41:00Z",
        "avg_risk": 1.45,
        "max_level": "HIGH",
        "miles_by_level": {
          "LOW": 782.4,
          "MODERATE": 171.8,
          "HIGH": 50.0,
          "SEVERE": 0.0,
          "NO_TRAVEL": 0.0
        }
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-87.6298, 41.8781],
          [-87.7124, 41.8653],
          [-88.2912, 41.7611],
          [-104.9903, 39.7392]
        ]
      },
      "checkpoints": [
        {
          "index": 0,
          "mile": 0.0,
          "lat": 41.8781,
          "lng": -87.6298,
          "segment_miles": 12.5,
          "eta_utc": "2026-11-02T14:00:00Z",
          "forecast_hour_utc": "2026-11-02T14:00:00Z",
          "weather": {
            "wind_mph": 14.2,
            "wind_gust_mph": 22.8,
            "rain_in_hr": 0.0,
            "snow_in_hr": 0.0
          },
          "risk": {
            "level": "LOW",
            "wind_level": "LOW",
            "rain_level": "LOW",
            "snow_level": "LOW",
            "driver": "WIND",
            "load_rule": null
          }
        },
        {
          "index": 1,
          "mile": 25.0,
          "lat": 41.8123,
          "lng": -88.1024,
          "segment_miles": 25.0,
          "eta_utc": "2026-11-02T14:26:00Z",
          "forecast_hour_utc": "2026-11-02T14:00:00Z",
          "weather": {
            "wind_mph": 27.5,
            "wind_gust_mph": 38.1,
            "rain_in_hr": 0.12,
            "snow_in_hr": 0.0
          },
          "risk": {
            "level": "HIGH",
            "wind_level": "HIGH",
            "rain_level": "MODERATE",
            "snow_level": "LOW",
            "driver": "WIND",
            "load_rule": ">40,000 lb rule (Moderate -> High)"
          }
        }
      ]
    }
  ],
  "recommendation": {
    "route_id": "route-1",
    "status": "OK",
    "reasons": [
      "Route A has 0.0 Severe miles and 50.0 High miles, the fewest of the 3 routes evaluated."
    ],
    "ranking": [
      {
        "route_id": "route-1",
        "key": [0.0, 0.0, 50.0, 1.45, 60060]
      }
    ]
  },
  "heatmap": {
    "start_utc": "2026-11-02T14:00:00Z",
    "hours": 49,
    "truncated": false,
    "points": [
      {
        "lat": 41.88,
        "lng": -87.63,
        "risk": [1, 1, 1, 2, 2, 3, 2, 1, 1],
        "wind_mph": [14.2, 16.1, 18.0, 26.4, 28.1, 36.2],
        "rain_in_hr": [0.0, 0.0, 0.0, 0.12, 0.15, 0.0],
        "snow_in_hr": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
      }
    ]
  },
  "notices": []
}
```

#### Notice Codes
When applicable, informational notices are included in `"notices": [...]`:
* `FEWER_THAN_3_ROUTES`: HERE Routing returned fewer than 3 alternatives for the corridor.
* `LONG_RANGE_FORECAST`: Departure is greater than 5 days out; forecast model confidence is reduced.
* `HEATMAP_THINNED`: Heatmap points along shared corridors were thinned to conserve payload bandwidth.
* `HEATMAP_TRUNCATED`: Route duration exceeded 48 hours; heatmap is bounded to the first 48 hours.

---

## 2. Error Response Format

All error responses adhere to a consistent JSON envelope across all endpoints:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Origin and destination must be at least 1 mile apart.",
    "details": {
      "destination": ["Distance between coordinates is 0.42 miles (minimum 1.0 mile)."]
    }
  }
}
```

### Error Code Reference

| Code | HTTP Status | Cause |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | `400 Bad Request` | Missing required fields, out-of-range coordinates, past departure time, or invalid weight/interval. |
| `NO_ROUTE_FOUND` | `422 Unprocessable Entity` | HERE Routing API could not locate a viable commercial truck route between origin and destination. |
| `UPSTREAM_ROUTING_ERROR` | `502 Bad Gateway` | HERE Routing API failed or returned a 5xx response after retry. |
| `UPSTREAM_WEATHER_ERROR` | `502 Bad Gateway` | Open-Meteo weather forecast API failed or returned unparseable/null data after retry. |
| `RATE_LIMITED` | `429 Too Many Requests` | Local API throttling limit (60 req/min) or upstream rate limit exceeded. |
| `INTERNAL_ERROR` | `500 Internal Server Error` | Unexpected server fault. Error is logged internally with `request_id`; stack traces are never exposed. |
