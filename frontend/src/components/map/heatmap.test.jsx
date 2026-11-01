import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { HeatmapLruCache } from '../../hooks/useHeatmapFrame';
import { buildHeatmapGeoJSON } from '../../map/geojson';
import { addHeatmapLayer, setHeatmapVisibility, HEATMAP_SOURCE_ID, HEATMAP_LAYER_ID } from '../../map/heatmapLayer';
import Slider from '../ui/Slider';
import MapLegend from './MapLegend';
import HeatmapControls from './HeatmapControls';

describe('Heatmap GeoJSON Builder', () => {
  const sampleHeatmapData = {
    start_utc: '2026-11-02T13:00:00Z',
    hours: 49,
    truncated: false,
    points: [
      {
        lat: 41.88,
        lng: -87.63,
        risk: [0, 2, 4], // Hour 0: LOW (0), Hour 1: HIGH (2), Hour 2: NO_TRAVEL (4)
        wind_mph: [10, 27.5, 55], // Hour 0: 10, Hour 1: 27.5 (0.5), Hour 2: 55 (1.0)
        rain_in_hr: [0, 0.5, 1.2], // Hour 1: 0.5, Hour 2: 1.2 (clamped to 1.0)
        snow_in_hr: [0, 1.5, 3.6], // Hour 1: 1.5 (0.5), Hour 2: 3.6 (clamped to 1.0)
      },
    ],
  };

  it('returns empty collection for empty or missing data', () => {
    expect(buildHeatmapGeoJSON(null)).toEqual({ type: 'FeatureCollection', features: [] });
    expect(buildHeatmapGeoJSON({ points: [] })).toEqual({ type: 'FeatureCollection', features: [] });
  });

  it('calculates RISK intensity as risk / 4', () => {
    // Hour 0: risk 0 -> intensity 0 -> excluded
    const geo0 = buildHeatmapGeoJSON(sampleHeatmapData, 0, 'RISK');
    expect(geo0.features).toHaveLength(0);

    // Hour 1: risk 2 -> intensity 0.5
    const geo1 = buildHeatmapGeoJSON(sampleHeatmapData, 1, 'RISK');
    expect(geo1.features).toHaveLength(1);
    expect(geo1.features[0].properties.intensity).toBeCloseTo(0.5, 2);

    // Hour 2: risk 4 -> intensity 1.0
    const geo2 = buildHeatmapGeoJSON(sampleHeatmapData, 2, 'RISK');
    expect(geo2.features[0].properties.intensity).toBeCloseTo(1.0, 2);
  });

  it('calculates WIND intensity normalized to 55 mph and clamped to 1.0', () => {
    const geo1 = buildHeatmapGeoJSON(sampleHeatmapData, 1, 'WIND');
    expect(geo1.features[0].properties.intensity).toBeCloseTo(27.5 / 55, 2);

    const geo2 = buildHeatmapGeoJSON(sampleHeatmapData, 2, 'WIND');
    expect(geo2.features[0].properties.intensity).toBeCloseTo(1.0, 2);
  });

  it('calculates RAIN intensity normalized to 1.0 in/hr and clamped to 1.0', () => {
    const geo1 = buildHeatmapGeoJSON(sampleHeatmapData, 1, 'RAIN');
    expect(geo1.features[0].properties.intensity).toBeCloseTo(0.5, 2);

    const geo2 = buildHeatmapGeoJSON(sampleHeatmapData, 2, 'RAIN');
    expect(geo2.features[0].properties.intensity).toBeCloseTo(1.0, 2);
  });

  it('calculates SNOW intensity normalized to 3.0 in/hr and clamped to 1.0', () => {
    const geo1 = buildHeatmapGeoJSON(sampleHeatmapData, 1, 'SNOW');
    expect(geo1.features[0].properties.intensity).toBeCloseTo(1.5 / 3.0, 2);

    const geo2 = buildHeatmapGeoJSON(sampleHeatmapData, 2, 'SNOW');
    expect(geo2.features[0].properties.intensity).toBeCloseTo(1.0, 2);
  });
});

describe('Heatmap LRU Cache (Capacity 8)', () => {
  it('evicts least recently used item when capacity is exceeded', () => {
    const lru = new HeatmapLruCache(3); // Small capacity for test
    lru.set('0:RISK', 'frame-0');
    lru.set('1:RISK', 'frame-1');
    lru.set('2:RISK', 'frame-2');

    expect(lru.size).toBe(3);
    expect(lru.get('0:RISK')).toBe('frame-0'); // Promotes '0:RISK' to MRU

    // Adding 4th item should evict '1:RISK' (which is now the oldest)
    lru.set('3:RISK', 'frame-3');
    expect(lru.size).toBe(3);
    expect(lru.get('1:RISK')).toBeNull(); // Evicted!
    expect(lru.get('0:RISK')).toBe('frame-0'); // Still present
    expect(lru.get('2:RISK')).toBe('frame-2'); // Still present
    expect(lru.get('3:RISK')).toBe('frame-3'); // Present
  });

  it('clears all items on clear()', () => {
    const lru = new HeatmapLruCache(8);
    lru.set('0:RISK', 'frame-0');
    lru.set('1:WIND', 'frame-1');
    expect(lru.size).toBe(2);

    lru.clear();
    expect(lru.size).toBe(0);
    expect(lru.get('0:RISK')).toBeNull();
  });
});

describe('Heatmap Layer Setup & Visibility', () => {
  it('adds source and layer with 300ms opacity transition', () => {
    const mockMap = {
      getSource: vi.fn().mockReturnValue(null),
      getLayer: vi.fn().mockReturnValue(null),
      addSource: vi.fn(),
      addLayer: vi.fn(),
    };

    addHeatmapLayer(mockMap, 'routes-casing', true);

    expect(mockMap.addSource).toHaveBeenCalledWith(HEATMAP_SOURCE_ID, expect.any(Object));
    expect(mockMap.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: HEATMAP_LAYER_ID,
        type: 'heatmap',
        source: HEATMAP_SOURCE_ID,
        paint: expect.objectContaining({
          'heatmap-opacity': 0.75,
          'heatmap-opacity-transition': { duration: 300 },
        }),
      }),
      'routes-casing'
    );
  });

  it('toggles visibility with setHeatmapVisibility', () => {
    const mockMap = {
      isStyleLoaded: vi.fn().mockReturnValue(true),
      getLayer: vi.fn().mockReturnValue(true),
      setPaintProperty: vi.fn(),
    };

    setHeatmapVisibility(mockMap, false);
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(HEATMAP_LAYER_ID, 'heatmap-opacity', 0);

    setHeatmapVisibility(mockMap, true);
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(HEATMAP_LAYER_ID, 'heatmap-opacity', 0.75);
  });
});

describe('Slider Component', () => {
  it('renders slider element with accessibility role and attributes', () => {
    const html = renderToString(
      <Slider value={12} min={0} max={48} step={1} onChange={vi.fn()} ariaLabel="Forecast Hour" />
    );

    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="48"');
    expect(html).toContain('aria-valuenow="12"');
    expect(html).toContain('bg-cobalt');
  });
});

describe('MapLegend Component', () => {
  it('renders metric title, note, and thresholds for Risk', () => {
    const html = renderToString(<MapLegend metric="RISK" />);
    expect(html).toContain('Risk Level (Load-Aware)');
    expect(html).toContain('Low risk is transparent by design');
    expect(html).toContain('No Travel');
  });

  it('renders metric title and thresholds for Wind', () => {
    const html = renderToString(<MapLegend metric="WIND" />);
    expect(html).toContain('Sustained Wind Speed');
    expect(html).toContain('55+ mph');
    expect(html).toContain('55+ mph No Travel');
  });

  it('renders exact threshold text for Rain and Snow per Section 9', () => {
    const rainHtml = renderToString(<MapLegend metric="RAIN" />);
    expect(rainHtml).toContain('Precipitation Rate');
    expect(rainHtml).toContain('above 1.0 in/hr No Travel');

    const snowHtml = renderToString(<MapLegend metric="SNOW" />);
    expect(snowHtml).toContain('Snowfall Rate');
    expect(snowHtml).toContain('above 3.0 in/hr No Travel');
  });
});

describe('HeatmapControls Component', () => {
  const sampleHeatmap = {
    start_utc: '2026-11-02T13:00:00Z',
    hours: 49,
    truncated: false,
    points: [{ lat: 41.88, lng: -87.63, risk: [1, 2] }],
  };

  it('renders show/hide toggle, metric radio buttons, +Nh offset, and slider', () => {
    const html = renderToString(
      <HeatmapControls
        map={null}
        heatmapData={sampleHeatmap}
        visible={true}
        hour={6}
        metric="RISK"
        dispatch={vi.fn()}
      />
    );

    expect(html).toContain('Heatmap ON');
    expect(html).toContain('Risk');
    expect(html).toContain('Wind');
    expect(html).toContain('Rain');
    expect(html).toContain('Snow');
    expect(html).toContain('+6h');
    expect(html).toContain('role="slider"');
  });
});
