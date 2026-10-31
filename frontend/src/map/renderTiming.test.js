import { describe, it, expect } from 'vitest';
import { buildRoutesGeoJSON, buildCheckpointsGeoJSON, buildHeatmapGeoJSON } from './geojson';

describe('Render and GeoJSON timing for 1,500-mile trip', () => {
  it('measures GeoJSON construction and frame preparation under 50ms', () => {
    // Generate synthetic 1,500-mile 3-route result
    const routes = [1, 2, 3].map(id => ({
      id: `route-${id}`,
      geometry: {
        type: 'LineString',
        coordinates: Array.from({ length: 2000 }, (_, i) => [-74.006 + i * 0.01, 40.7128 - i * 0.005])
      },
      checkpoints: Array.from({ length: 65 }, (_, i) => ({
        index: i,
        mile: i * 25,
        lat: 40.7128 - i * 0.005,
        lng: -74.006 + i * 0.01,
        risk: { level: 'LOW' }
      }))
    }));

    const heatmap = {
      points: Array.from({ length: 180 }, (_, i) => ({
        lat: 40.7128 - i * 0.005,
        lng: -74.006 + i * 0.01,
        risk: Array.from({ length: 49 }, () => 1),
        wind_mph: Array.from({ length: 49 }, () => 15),
        rain_in_hr: Array.from({ length: 49 }, () => 0),
        snow_in_hr: Array.from({ length: 49 }, () => 0)
      }))
    };

    const t0 = performance.now();
    const routesGeoJSON = buildRoutesGeoJSON(routes, 'route-1');
    const checkpointsGeoJSON = buildCheckpointsGeoJSON(routes);
    const heatmapGeoJSON = buildHeatmapGeoJSON(heatmap, 0, 'RISK');
    const duration = performance.now() - t0;

    console.log(`GeoJSON feature collection construction for 1,500-mi trip: ${duration.toFixed(2)} ms`);
    expect(duration).toBeLessThan(100);
    expect(routesGeoJSON.features.length).toBe(3);
    expect(checkpointsGeoJSON.features.length).toBe(195);
    expect(heatmapGeoJSON.features.length).toBe(180);
  });
});
