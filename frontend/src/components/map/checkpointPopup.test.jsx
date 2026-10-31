import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import CheckpointPopup from './CheckpointPopup';

describe('CheckpointPopup Component', () => {
  const baseCheckpoint = {
    index: 3,
    mile: 75.0,
    eta_utc: '2026-11-02T16:00:00Z',
    weather: {
      wind_mph: 22.4,
      wind_gust_mph: 34.0,
      rain_in_hr: 0.15,
      snow_in_hr: 0.0,
    },
    risk: {
      level: 'MODERATE',
      wind_level: 'MODERATE',
      rain_level: 'LOW',
      snow_level: 'LOW',
      driver: 'WIND',
      load_rule: null,
    },
  };

  const sampleRoute = {
    id: 'route-1',
    label: 'Route A',
  };

  it('renders mile, route label, and ETA in the browser timezone', () => {
    const html = renderToString(
      <CheckpointPopup checkpoint={baseCheckpoint} route={sampleRoute} onClose={vi.fn()} />
    );

    expect(html).toContain('Route A');
    expect(html).toContain('Mile 75.0');
    expect(html).toContain('Estimated Arrival (ETA)');
    expect(html).toContain('UTC');
  });

  it('renders weather metrics including wind with gusts, rain, and snow in mono tabular', () => {
    const html = renderToString(
      <CheckpointPopup checkpoint={baseCheckpoint} route={sampleRoute} onClose={vi.fn()} />
    );

    expect(html).toContain('22.4 mph (gust 34.0 mph)');
    expect(html).toContain('0.15 in/hr');
    expect(html).toContain('0.00 in/hr');
  });

  it('renders risk badge and primary weather driver', () => {
    const html = renderToString(
      <CheckpointPopup checkpoint={baseCheckpoint} route={sampleRoute} onClose={vi.fn()} />
    );

    expect(html).toContain('Moderate');
    expect(html).toContain('background-color:#F2C94C');
    expect(html).toContain('Primary Driver');
    expect(html).toContain('Wind');
  });

  it('renders plain-language note for WIND_45_54_OVER_30K load rule', () => {
    const cpWithRule = {
      ...baseCheckpoint,
      risk: {
        ...baseCheckpoint.risk,
        level: 'NO_TRAVEL',
        load_rule: 'WIND_45_54_OVER_30K',
      },
    };

    const html = renderToString(
      <CheckpointPopup checkpoint={cpWithRule} route={sampleRoute} onClose={vi.fn()} />
    );

    expect(html).toContain('Wind 45–54 mph with load &gt; 30,000 lb escalates risk to');
    expect(html).toContain('NO TRAVEL');
    expect(html).toContain('high rollover hazard');
  });

  it('renders plain-language note for WIND_35_44_OVER_40K load rule', () => {
    const cpWithRule = {
      ...baseCheckpoint,
      risk: {
        ...baseCheckpoint.risk,
        level: 'SEVERE',
        load_rule: 'WIND_35_44_OVER_40K',
      },
    };

    const html = renderToString(
      <CheckpointPopup checkpoint={cpWithRule} route={sampleRoute} onClose={vi.fn()} />
    );

    expect(html).toContain('Wind 35–44 mph with load &gt; 40,000 lb escalates risk to at least');
    expect(html).toContain('SEVERE');
    expect(html).toContain('heavy crosswind sensitivity');
  });

  it('returns null when checkpoint is not provided', () => {
    const html = renderToString(<CheckpointPopup checkpoint={null} onClose={vi.fn()} />);
    expect(html).toBe('');
  });
});
