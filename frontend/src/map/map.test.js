import { describe, it, expect, vi } from 'vitest';
import { calculateRoutesBounds } from './bounds';
import { buildRoutesGeoJSON, EMPTY_GEOJSON } from './geojson';
import { getMapStyleUrl, DEFAULT_MAP_STYLE_URL } from './mapStyle';
import {
  getRouteLineWidthExpression,
  getRouteLineOpacityExpression,
  getRouteCasingWidthExpression,
} from './routeLayers';
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
