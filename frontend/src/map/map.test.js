import { describe, it, expect, vi } from 'vitest';
import { calculateRoutesBounds } from './bounds';
import { buildRoutesGeoJSON, buildCheckpointsGeoJSON, EMPTY_GEOJSON } from './geojson';
import { getMapStyleUrl, DEFAULT_MAP_STYLE_URL } from './mapStyle';
import {
  getRouteLineWidthExpression,
  getRouteLineOpacityExpression,
  getRouteCasingWidthExpression,
} from './routeLayers';
import {
  getCheckpointCircleColorExpression,
  getCheckpointCircleRadiusExpression,
  getCheckpointCircleOpacityExpression,
} from './checkpointLayers';
import { animateRouteDrawIn } from './routeAnimation';

describe('Map Bounds Calculation', () => {
  it('returns null for empty or invalid routes', () => {
    expect(calculateRoutesBounds([])).toBeNull();
    expect(calculateRoutesBounds(null)).toBeNull();
    expect(calculateRoutesBounds([{ geometry: { coordinates: [] } }])).toBeNull();
  });

  it('calculates correct bounds encompassing all coordinates across routes', () => {
    const routes = [
      {
        id: 'route_quickest',
        geometry: {
          coordinates: [
            [-105.0, 39.7],
            [-104.5, 40.0],
          ],
        },
      },
      {
        id: 'route_safest',
        geometry: {
          coordinates: [
            [-106.2, 38.5],
            [-103.0, 41.2],
          ],
        },
      },
    ];

    const bounds = calculateRoutesBounds(routes);
    expect(bounds).toEqual([
      [-106.2, 38.5],
      [-103.0, 41.2],
    ]);
  });
});

describe('Map GeoJSON Builder', () => {
  const sampleRoutes = [
    {
      id: 'route_quickest',
      label: 'Route A',
      is_recommended: true,
      geometry: {
        coordinates: [
          [-105.0, 39.7],
          [-104.5, 40.0],
          [-104.0, 40.2],
        ],
      },
    },
    {
      id: 'route_safest',
      label: 'Route B',
      is_recommended: false,
      geometry: {
        coordinates: [
          [-106.0, 39.0],
          [-105.5, 39.5],
        ],
      },
    },
  ];

  it('returns empty feature collection for empty input', () => {
    expect(buildRoutesGeoJSON([])).toEqual(EMPTY_GEOJSON);
  });

  it('builds valid GeoJSON FeatureCollection with properties and coordinates', () => {
    const geojson = buildRoutesGeoJSON(sampleRoutes);
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(2);

    const featureA = geojson.features[0];
    expect(featureA.id).toBe('route_quickest');
    expect(featureA.properties.route_id).toBe('route_quickest');
    expect(featureA.properties.is_recommended).toBe(true);
    expect(featureA.properties.color_key).toBe('A');
    expect(featureA.geometry.coordinates).toHaveLength(3);
  });

  it('slices coordinates when coordinatePrefixes is provided for progressive draw-in', () => {
    const geojson = buildRoutesGeoJSON(sampleRoutes, {
      coordinatePrefixes: {
        route_quickest: 2,
        route_safest: 1, // <= 1 should duplicate first point to maintain valid LineString
      },
    });

    expect(geojson.features[0].geometry.coordinates).toHaveLength(2);
    expect(geojson.features[1].geometry.coordinates).toEqual([
      [-106.0, 39.0],
      [-106.0, 39.0],
    ]);
  });
});

describe('Map Style URL', () => {
  it('returns default OpenFreeMap Positron URL', () => {
    expect(getMapStyleUrl()).toBe(DEFAULT_MAP_STYLE_URL);
  });
});

describe('Map Route Layer Expressions', () => {
  it('returns selected route width 5 and unselected width 3', () => {
    const expr = getRouteLineWidthExpression('route_safest');
    expect(expr).toEqual(['case', ['==', ['get', 'route_id'], 'route_safest'], 5, 3]);
  });

  it('returns selected route opacity 1.0 and unselected opacity 0.55', () => {
    const expr = getRouteLineOpacityExpression('route_safest');
    expect(expr).toEqual(['case', ['==', ['get', 'route_id'], 'route_safest'], 1.0, 0.55]);
  });

  it('returns casing width expression with recommended outline logic', () => {
    const expr = getRouteCasingWidthExpression('route_safest');
    expect(expr).toEqual([
      'case',
      ['==', ['get', 'route_id'], 'route_safest'],
      9,
      ['get', 'is_recommended'],
      7,
      5,
    ]);
  });
});

describe('Route Draw-in Animation', () => {
  it('instantly sets full data when isReducedMotion is true', () => {
    const mockSource = {
      setData: vi.fn(),
    };
    const mockMap = {
      getSource: vi.fn().mockReturnValue(mockSource),
    };
    const onComplete = vi.fn();

    const routes = [
      {
        id: 'r1',
        geometry: { coordinates: [[0, 0], [1, 1]] },
      },
    ];

    const controller = animateRouteDrawIn({
      map: mockMap,
      routes,
      isReducedMotion: true,
      onComplete,
    });

    expect(mockSource.setData).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(typeof controller.cancel).toBe('function');
  });
});

describe('Checkpoints GeoJSON Builder', () => {
  it('returns empty collection for empty or invalid routes', () => {
    expect(buildCheckpointsGeoJSON([])).toEqual({ type: 'FeatureCollection', features: [] });
    expect(buildCheckpointsGeoJSON(null)).toEqual({ type: 'FeatureCollection', features: [] });
  });

  it('builds Point features with props route_id, index, level, key, mile', () => {
    const routes = [
      {
        id: 'route-1',
        label: 'Route A',
        checkpoints: [
          {
            index: 0,
            mile: 0,
            lat: 41.878,
            lng: -87.629,
            risk: { level: 'LOW' },
          },
          {
            index: 1,
            mile: 25.0,
            lat: 41.5,
            lng: -88.0,
            risk: { level: 'SEVERE' },
          },
        ],
      },
    ];

    const geojson = buildCheckpointsGeoJSON(routes);
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(2);

    const cp0 = geojson.features[0];
    expect(cp0.type).toBe('Feature');
    expect(cp0.geometry.type).toBe('Point');
    expect(cp0.geometry.coordinates).toEqual([-87.629, 41.878]);
    expect(cp0.properties.route_id).toBe('route-1');
    expect(cp0.properties.index).toBe(0);
    expect(cp0.properties.key).toBe('route-1:0');
    expect(cp0.properties.level).toBe('LOW');

    const cp1 = geojson.features[1];
    expect(cp1.properties.key).toBe('route-1:1');
    expect(cp1.properties.level).toBe('SEVERE');
  });
});

describe('Checkpoint Layer Expressions', () => {
  it('returns match expression for circle color', () => {
    const colorExpr = getCheckpointCircleColorExpression();
    expect(colorExpr[0]).toBe('match');
    expect(colorExpr[1]).toEqual(['get', 'level']);
    expect(colorExpr).toContain('#2E9E5B'); // LOW
    expect(colorExpr).toContain('#6B1D1D'); // NO_TRAVEL
  });

  it('returns radius expression with selected route always visible and others hidden below zoom 7', () => {
    const radiusExpr = getCheckpointCircleRadiusExpression('route-1');
    expect(radiusExpr[0]).toBe('step');
    expect(radiusExpr[1]).toEqual(['zoom']);
    expect(radiusExpr[2]).toEqual(['case', ['==', ['get', 'route_id'], 'route-1'], 4.5, 0]);
    expect(radiusExpr[3]).toBe(7);
  });

  it('returns opacity expression with other routes hidden below zoom 7', () => {
    const opacityExpr = getCheckpointCircleOpacityExpression('route-1');
    expect(opacityExpr[0]).toBe('step');
    expect(opacityExpr[1]).toEqual(['zoom']);
    expect(opacityExpr[2]).toEqual(['case', ['==', ['get', 'route_id'], 'route-1'], 1.0, 0]);
    expect(opacityExpr[3]).toBe(7);
  });
});
