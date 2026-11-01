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
        wind_mph: [10, 27.5, 55], // Hour 0: 10, Hour 1: 27.5, Hour 2: 55
        rain_in_hr: [0, 0.5, 1.2], // Hour 1: 0.5, Hour 2: 1.2
        snow_in_hr: [0, 1.5, 3.6], // Hour 1: 1.5, Hour 2: 3.6
      },
    ],
  };

  it('returns empty collection for empty or missing data', () => {
    expect(buildHeatmapGeoJSON(null)).toEqual({ type: 'FeatureCollection', features: [] });
    expect(buildHeatmapGeoJSON({ points: [] })).toEqual({ type: 'FeatureCollection', features: [] });
  });

  it('calculates RISK intensity with a 0.20 floor for LOW, scaling to 1.0 at NO_TRAVEL', () => {
    // Hour 0: risk 0 (LOW) -> intensity 0.20 -> included as visible baseline feature
    const geo0 = buildHeatmapGeoJSON(sampleHeatmapData, 0, 'RISK');
    expect(geo0.features).toHaveLength(1);
    expect(geo0.features[0].properties.intensity).toBeCloseTo(0.2, 2);

    // Hour 1: risk 2 (HIGH) -> intensity 0.2 + 0.8 * (2/4) = 0.60
    const geo1 = buildHeatmapGeoJSON(sampleHeatmapData, 1, 'RISK');
    expect(geo1.features).toHaveLength(1);
    expect(geo1.features[0].properties.intensity).toBeCloseTo(0.6, 2);

    // Hour 2: risk 4 (NO_TRAVEL) -> intensity 1.00
    const geo2 = buildHeatmapGeoJSON(sampleHeatmapData, 2, 'RISK');
    expect(geo2.features).toHaveLength(1);
    expect(geo2.features[0].properties.intensity).toBeCloseTo(1.0, 2);
  });

  it('calculates WIND intensity using perceptual sqrt scale clamped to 1.0', () => {
    const geo1 = buildHeatmapGeoJSON(sampleHeatmapData, 1, 'WIND');
    expect(geo1.features[0].properties.intensity).toBeCloseTo(Math.sqrt(27.5 / 55), 2);

    const geo2 = buildHeatmapGeoJSON(sampleHeatmapData, 2, 'WIND');
    expect(geo2.features[0].properties.intensity).toBeCloseTo(1.0, 2);
  });

  it('calculates RAIN intensity using perceptual sqrt scale clamped to 1.0', () => {
    const geo1 = buildHeatmapGeoJSON(sampleHeatmapData, 1, 'RAIN');
    expect(geo1.features[0].properties.intensity).toBeCloseTo(Math.sqrt(0.5 / 1.0), 2);

    const geo2 = buildHeatmapGeoJSON(sampleHeatmapData, 2, 'RAIN');
    expect(geo2.features[0].properties.intensity).toBeCloseTo(1.0, 2);
  });

  it('calculates SNOW intensity using perceptual sqrt scale clamped to 1.0', () => {
    const geo1 = buildHeatmapGeoJSON(sampleHeatmapData, 1, 'SNOW');
    expect(geo1.features[0].properties.intensity).toBeCloseTo(Math.sqrt(1.5 / 3.0), 2);

    const geo2 = buildHeatmapGeoJSON(sampleHeatmapData, 2, 'SNOW');
    expect(geo2.features[0].properties.intensity).toBeCloseTo(1.0, 2);
  });
});

describe('Heatmap LRU Cache (Capacity 8)', () => {
  it('evicts least recently used item when capacity is exceeded', () => {
    const lru = new HeatmapLruCache(3);
    lru.set('0:RISK', 'frame-0');
    lru.set('1:RISK', 'frame-1');
    lru.set('2:RISK', 'frame-2');

    expect(lru.size).toBe(3);
    expect(lru.get('0:RISK')).toBe('frame-0');

    lru.set('3:RISK', 'frame-3');
    expect(lru.size).toBe(3);
    expect(lru.get('1:RISK')).toBeNull();
    expect(lru.get('0:RISK')).toBe('frame-0');
    expect(lru.get('2:RISK')).toBe('frame-2');
    expect(lru.get('3:RISK')).toBe('frame-3');
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
          'heatmap-opacity': 0.80,
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
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(HEATMAP_LAYER_ID, 'heatmap-opacity', 0.80);
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
    expect(html).toContain('Green = Low risk baseline');
    expect(html).toContain('No Travel');
  });

  it('renders custom corridor status message in legend when all checkpoints are LOW', () => {
    const html = renderToString(
      <MapLegend metric="RISK" statusMessage="All clear: Low risk along the corridor" />
    );
    expect(html).toContain('All clear: Low risk along the corridor');
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
    points: [{ lat: 41.88, lng: -87.63, risk: [1, 2], rain_in_hr: [0, 0] }],
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

  it('renders empty-state message when all corridor points have zero values for a metric', () => {
    const dryHeatmap = {
      start_utc: '2026-11-02T13:00:00Z',
      hours: 49,
      points: [
        { lat: 41.88, lng: -87.63, rain_in_hr: Array(49).fill(0), snow_in_hr: Array(49).fill(0) },
        { lat: 41.50, lng: -88.00, rain_in_hr: Array(49).fill(0), snow_in_hr: Array(49).fill(0) },
      ],
    };

    const rainHtml = renderToString(
      <HeatmapControls
        map={null}
        heatmapData={dryHeatmap}
        visible={true}
        hour={0}
        metric="RAIN"
        dispatch={vi.fn()}
      />
    );
    expect(rainHtml).toContain('No rain forecast along the corridor at this hour');

    const snowHtml = renderToString(
      <HeatmapControls
        map={null}
        heatmapData={dryHeatmap}
        visible={true}
        hour={0}
        metric="SNOW"
        dispatch={vi.fn()}
      />
    );
    expect(snowHtml).toContain('No snow forecast along the corridor at this hour');
  });

  it('renders all-clear message in legend area when risk is all LOW', () => {
    const allClearHeatmap = {
      start_utc: '2026-11-02T13:00:00Z',
      hours: 49,
      points: [
        { lat: 41.88, lng: -87.63, risk: Array(49).fill(0) },
        { lat: 41.50, lng: -88.00, risk: Array(49).fill(0) },
      ],
    };

    const riskHtml = renderToString(
      <HeatmapControls
        map={null}
        heatmapData={allClearHeatmap}
        visible={true}
        hour={0}
        metric="RISK"
        dispatch={vi.fn()}
      />
    );
    expect(riskHtml).toContain('All clear: Low risk along the corridor');
  });
});
