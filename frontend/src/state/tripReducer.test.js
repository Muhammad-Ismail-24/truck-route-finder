import { describe, it, expect } from 'vitest';
import { tripReducer, createInitialTripState } from './tripReducer';
import {
  getSelectedRoute,
  getRecommendedRoute,
  getSelectedCheckpoint,
  getRouteById,
  getAllRoutes,
  getRecommendation,
  getNotices,
  getHeatmapData,
} from './selectors';

describe('tripReducer & selectors (Section 17.2)', () => {
  const samplePlanResponse = {
    request_id: 'test-req-123',
    generated_at_utc: '2026-11-01T12:00:00Z',
    input: {
      origin: { label: 'Chicago, IL', lat: 41.8781, lng: -87.6298 },
      destination: { label: 'Denver, CO', lat: 39.7392, lng: -104.9903 },
      departure_utc: '2026-11-02T13:00:00Z',
      load_weight_lb: 42000,
      checkpoint_interval_miles: 25,
    },
    settings: { delay_buffer: 1.1, heatmap_interval_miles: 25, truck_tare_lb: 32000 },
    routes: [
      {
        id: 'route-1',
        label: 'Route A',
        rank: 1,
        is_recommended: true,
        summary: {
          distance_miles: 1003.4,
          base_duration_s: 52000,
          buffered_duration_s: 57200,
          departure_utc: '2026-11-02T13:00:00Z',
          arrival_utc: '2026-11-03T04:53:20Z',
          avg_risk: 1.42,
          max_level: 'HIGH',
          miles_by_level: { LOW: 800.1, MODERATE: 130.0, HIGH: 73.3, SEVERE: 0, NO_TRAVEL: 0 },
        },
        geometry: { type: 'LineString', coordinates: [[-87.6298, 41.8781]] },
        checkpoints: [
          {
            index: 0,
            mile: 0.0,
            lat: 41.8781,
            lng: -87.6298,
            segment_miles: 12.5,
            eta_utc: '2026-11-02T13:00:00Z',
            forecast_hour_utc: '2026-11-02T13:00:00Z',
            weather: { wind_mph: 12.3, wind_gust_mph: 21.0, rain_in_hr: 0.0, snow_in_hr: 0.0 },
            risk: { level: 'LOW', wind_level: 'LOW', rain_level: 'LOW', snow_level: 'LOW', driver: 'WIND', load_rule: null },
          },
          {
            index: 1,
            mile: 25.0,
            lat: 41.9,
            lng: -88.0,
            segment_miles: 25.0,
            eta_utc: '2026-11-02T13:30:00Z',
            forecast_hour_utc: '2026-11-02T14:00:00Z',
            weather: { wind_mph: 36.0, wind_gust_mph: 42.0, rain_in_hr: 0.1, snow_in_hr: 0.0 },
            risk: { level: 'HIGH', wind_level: 'HIGH', rain_level: 'MODERATE', snow_level: 'LOW', driver: 'WIND', load_rule: null },
          },
        ],
      },
      {
        id: 'route-2',
        label: 'Route B',
        rank: 2,
        is_recommended: false,
        summary: {
          distance_miles: 1040.0,
          base_duration_s: 54000,
          buffered_duration_s: 59400,
          departure_utc: '2026-11-02T13:00:00Z',
          arrival_utc: '2026-11-03T05:30:00Z',
          avg_risk: 1.8,
          max_level: 'SEVERE',
          miles_by_level: { LOW: 700.0, MODERATE: 200.0, HIGH: 100.0, SEVERE: 40.0, NO_TRAVEL: 0 },
        },
        geometry: { type: 'LineString', coordinates: [[-87.6298, 41.8781]] },
        checkpoints: [],
      },
    ],
    recommendation: {
      route_id: 'route-1',
      status: 'OK',
      reasons: ['Route A has the fewest high risk miles.'],
      ranking: [{ route_id: 'route-1', key: [0, 0, 73.3, 1.42, 953] }],
    },
    heatmap: {
      start_utc: '2026-11-02T13:00:00Z',
      hours: 49,
      truncated: false,
      points: [
        { lat: 41.88, lng: -87.63, risk: [0, 1, 2], wind_mph: [10, 15, 20], rain_in_hr: [0, 0, 0], snow_in_hr: [0, 0, 0] },
      ],
    },
    notices: [{ code: 'TEST_NOTICE', message: 'Test message' }],
  };

  it('initializes with default structure', () => {
    const state = createInitialTripState();
    expect(state.status).toBe('idle');
    expect(state.result).toBeNull();
    expect(state.error).toBeNull();
    expect(state.selectedRouteId).toBeNull();
    expect(state.selectedCheckpointKey).toBeNull();
    expect(state.form.checkpoint_interval_miles).toBe(25);
    expect(state.form.load_weight_lb).toBe(40000);
    expect(state.heatmap.visible).toBe(true);
    expect(state.heatmap.hour).toBe(0);
    expect(state.heatmap.metric).toBe('RISK');
  });

  it('handles FORM_CHANGED', () => {
    const state = createInitialTripState();
    const updated = tripReducer(state, {
      type: 'FORM_CHANGED',
      payload: { load_weight_lb: 55000, checkpoint_interval_miles: 50 },
    });
    expect(updated.form.load_weight_lb).toBe(55000);
    expect(updated.form.checkpoint_interval_miles).toBe(50);
  });

  it('handles PLAN_REQUESTED', () => {
    const state = { ...createInitialTripState(), error: { code: 'PREV_ERROR', message: 'prev' } };
    const updated = tripReducer(state, { type: 'PLAN_REQUESTED' });
    expect(updated.status).toBe('loading');
    expect(updated.error).toBeNull();
  });

  it('handles PLAN_SUCCEEDED', () => {
    const state = { ...createInitialTripState(), status: 'loading' };
    const updated = tripReducer(state, {
      type: 'PLAN_SUCCEEDED',
      payload: samplePlanResponse,
    });
    expect(updated.status).toBe('success');
    expect(updated.result).toEqual(samplePlanResponse);
    expect(updated.error).toBeNull();
    expect(updated.selectedRouteId).toBe('route-1');
    expect(updated.selectedCheckpointKey).toBeNull();
    expect(updated.heatmap.hour).toBe(0);
  });

  it('handles PLAN_FAILED', () => {
    const state = { ...createInitialTripState(), status: 'loading' };
    const errorPayload = { code: 'NO_ROUTE_FOUND', message: 'No route between points' };
    const updated = tripReducer(state, {
      type: 'PLAN_FAILED',
      payload: errorPayload,
    });
    expect(updated.status).toBe('error');
    expect(updated.error).toEqual(errorPayload);
  });

  it('handles ROUTE_SELECTED', () => {
    const state = {
      ...createInitialTripState(),
      selectedRouteId: 'route-1',
      selectedCheckpointKey: 'route-1:0',
    };
    const updated = tripReducer(state, {
      type: 'ROUTE_SELECTED',
      payload: 'route-2',
    });
    expect(updated.selectedRouteId).toBe('route-2');
    expect(updated.selectedCheckpointKey).toBeNull();
  });

  it('handles CHECKPOINT_SELECTED', () => {
    const state = createInitialTripState();
    const updated = tripReducer(state, {
      type: 'CHECKPOINT_SELECTED',
      payload: 'route-1:1',
    });
    expect(updated.selectedCheckpointKey).toBe('route-1:1');
  });

  it('handles HEATMAP_HOUR_SET with clamping between 0 and 48', () => {
    const state = createInitialTripState();
    expect(tripReducer(state, { type: 'HEATMAP_HOUR_SET', payload: 12 }).heatmap.hour).toBe(12);
    expect(tripReducer(state, { type: 'HEATMAP_HOUR_SET', payload: 55 }).heatmap.hour).toBe(48);
    expect(tripReducer(state, { type: 'HEATMAP_HOUR_SET', payload: -5 }).heatmap.hour).toBe(0);
    expect(tripReducer(state, { type: 'HEATMAP_HOUR_SET', payload: '20' }).heatmap.hour).toBe(20);
  });

  it('handles HEATMAP_METRIC_SET', () => {
    const state = createInitialTripState();
    const updated = tripReducer(state, {
      type: 'HEATMAP_METRIC_SET',
      payload: 'WIND',
    });
    expect(updated.heatmap.metric).toBe('WIND');
  });

  it('handles HEATMAP_VISIBILITY_SET', () => {
    const state = createInitialTripState();
    const updated = tripReducer(state, {
      type: 'HEATMAP_VISIBILITY_SET',
      payload: false,
    });
    expect(updated.heatmap.visible).toBe(false);
  });

  it('returns unchanged state on unknown action', () => {
    const state = createInitialTripState();
    const updated = tripReducer(state, { type: 'UNKNOWN_ACTION' });
    expect(updated).toBe(state);
  });

  describe('Selectors', () => {
    const populatedState = {
      ...createInitialTripState(),
      result: samplePlanResponse,
      selectedRouteId: 'route-1',
      selectedCheckpointKey: 'route-1:1',
    };

    it('getAllRoutes returns list of routes', () => {
      expect(getAllRoutes(populatedState)).toHaveLength(2);
      expect(getAllRoutes(createInitialTripState())).toHaveLength(0);
    });

    it('getSelectedRoute returns selected or fallback route', () => {
      expect(getSelectedRoute(populatedState)?.id).toBe('route-1');

      const route2State = { ...populatedState, selectedRouteId: 'route-2' };
      expect(getSelectedRoute(route2State)?.id).toBe('route-2');
    });

    it('getRecommendedRoute returns route with is_recommended', () => {
      expect(getRecommendedRoute(populatedState)?.id).toBe('route-1');
    });

    it('getRouteById finds route by id', () => {
      expect(getRouteById(populatedState, 'route-2')?.label).toBe('Route B');
      expect(getRouteById(populatedState, 'non-existent')).toBeNull();
    });

    it('getSelectedCheckpoint retrieves checkpoint from key', () => {
      const checkpoint = getSelectedCheckpoint(populatedState);
      expect(checkpoint).toBeDefined();
      expect(checkpoint?.index).toBe(1);
      expect(checkpoint?.mile).toBe(25.0);
      expect(checkpoint?.risk.level).toBe('HIGH');
    });

    it('getRecommendation, getNotices, getHeatmapData return proper result parts', () => {
      expect(getRecommendation(populatedState)?.route_id).toBe('route-1');
      expect(getNotices(populatedState)).toEqual([{ code: 'TEST_NOTICE', message: 'Test message' }]);
      expect(getHeatmapData(populatedState)?.hours).toBe(49);
    });
  });
});
