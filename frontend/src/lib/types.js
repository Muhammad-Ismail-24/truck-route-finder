/**
 * JSDoc Type Definitions for Spotter / Haulcast Truck Routing.
 * All API payloads retain their snake_case schema as documented in Section 15.
 */

/**
 * @typedef {Object} LatLng
 * @property {number} lat
 * @property {number} lng
 */

/**
 * @typedef {Object} Place
 * @property {string} label
 * @property {number} lat
 * @property {number} lng
 */

/**
 * @typedef {Object} GeocodeSuggestResponse
 * @property {Place[]} results
 */

/**
 * @typedef {Object} PlanRequest
 * @property {Place} origin
 * @property {Place} destination
 * @property {string} departure_time - ISO 8601 string with timezone offset
 * @property {number} load_weight_lb - Integer 1-80,000
 * @property {number} [checkpoint_interval_miles] - 10, 25, or 50
 */

/**
 * @typedef {Object} RouteSummary
 * @property {number} distance_miles
 * @property {number} base_duration_s
 * @property {number} buffered_duration_s
 * @property {string} departure_utc
 * @property {string} arrival_utc
 * @property {number} avg_risk
 * @property {string} max_level
 * @property {Record<string, number>} miles_by_level
 */

/**
 * @typedef {Object} CheckpointWeather
 * @property {number} wind_mph
 * @property {number} wind_gust_mph
 * @property {number} rain_in_hr
 * @property {number} snow_in_hr
 */

/**
 * @typedef {Object} CheckpointRisk
 * @property {string} level - LOW | MODERATE | HIGH | SEVERE | NO_TRAVEL
 * @property {string} wind_level
 * @property {string} rain_level
 * @property {string} snow_level
 * @property {string} driver - WIND | RAIN | SNOW
 * @property {string | null} load_rule
 */

/**
 * @typedef {Object} Checkpoint
 * @property {number} index
 * @property {number} mile
 * @property {number} lat
 * @property {number} lng
 * @property {number} segment_miles
 * @property {string} eta_utc
 * @property {string} forecast_hour_utc
 * @property {CheckpointWeather} weather
 * @property {CheckpointRisk} risk
 */

/**
 * @typedef {Object} RouteGeometry
 * @property {'LineString'} type
 * @property {[number, number][]} coordinates - GeoJSON [lng, lat]
 */

/**
 * @typedef {Object} Route
 * @property {string} id - e.g. "route-1"
 * @property {string} label - e.g. "Route A"
 * @property {number} rank - 1-based rank
 * @property {boolean} is_recommended
 * @property {RouteSummary} summary
 * @property {RouteGeometry} geometry
 * @property {Checkpoint[]} checkpoints
 */

/**
 * @typedef {Object} RankingItem
 * @property {string} route_id
 * @property {number[]} key - Lexicographic ranking key
 */

/**
 * @typedef {Object} Recommendation
 * @property {string} route_id
 * @property {'OK' | 'OK_WITH_WARNING'} status
 * @property {string[]} reasons
 * @property {RankingItem[]} ranking
 */

/**
 * @typedef {Object} HeatmapPoint
 * @property {number} lat
 * @property {number} lng
 * @property {number[]} risk - 49 risk scores (0..4)
 * @property {number[]} wind_mph - 49 hourly wind values
 * @property {number[]} rain_in_hr - 49 hourly rain values
 * @property {number[]} snow_in_hr - 49 hourly snow values
 */

/**
 * @typedef {Object} HeatmapResult
 * @property {string} start_utc
 * @property {number} hours - typically 49
 * @property {boolean} truncated
 * @property {HeatmapPoint[]} points
 */

/**
 * @typedef {Object} Notice
 * @property {string} code - e.g. "FEWER_THAN_3_ROUTES", "LONG_RANGE_FORECAST", "HEATMAP_THINNED", "HEATMAP_TRUNCATED"
 * @property {string} message
 */

/**
 * @typedef {Object} PlanResponse
 * @property {string} request_id
 * @property {string} generated_at_utc
 * @property {Object} input
 * @property {Object} settings
 * @property {Route[]} routes
 * @property {Recommendation} recommendation
 * @property {HeatmapResult} heatmap
 * @property {Notice[]} notices
 */

/**
 * @typedef {Object} ApiErrorPayload
 * @property {Object} error
 * @property {string} error.code
 * @property {string} error.message
 * @property {Record<string, any>} [error.details]
 */

/**
 * @typedef {Object} TripFormState
 * @property {Place | null} origin
 * @property {Place | null} destination
 * @property {string} departure_local - YYYY-MM-DDTHH:mm
 * @property {number | string} load_weight_lb
 * @property {number} checkpoint_interval_miles
 */

/**
 * @typedef {'RISK' | 'WIND' | 'RAIN' | 'SNOW'} HeatmapMetric
 */

/**
 * @typedef {Object} HeatmapState
 * @property {boolean} visible
 * @property {number} hour - 0..48
 * @property {HeatmapMetric} metric
 */

/**
 * @typedef {Object} TripState
 * @property {TripFormState} form
 * @property {'idle' | 'loading' | 'success' | 'error'} status
 * @property {PlanResponse | null} result
 * @property {{ code: string, message: string, details?: Record<string, any> } | null} error
 * @property {string | null} selectedRouteId
 * @property {string | null} selectedCheckpointKey - `${route_id}:${index}`
 * @property {HeatmapState} heatmap
 */

export {};
