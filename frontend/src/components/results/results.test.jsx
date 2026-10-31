import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { TripProvider } from '../../state/TripProvider';
import RiskBadge from './RiskBadge';
import RiskBreakdownBar from './RiskBreakdownBar';
import RouteSummaryStats from './RouteSummaryStats';
import RouteCard from './RouteCard';
import RecommendationBanner from './RecommendationBanner';
import CheckpointTable from './CheckpointTable';
import NoticesPanel from './NoticesPanel';
import ResultsSkeleton from './ResultsSkeleton';
import ErrorPanel from './ErrorPanel';

describe('RiskBadge Component', () => {
  it('renders correct labels and fill colors for each risk level', () => {
    const lowHtml = renderToString(<RiskBadge level="LOW" />);
    expect(lowHtml).toContain('Low');
    expect(lowHtml).toContain('background-color:#2E9E5B');

    const modHtml = renderToString(<RiskBadge level="MODERATE" />);
    expect(modHtml).toContain('Moderate');
    expect(modHtml).toContain('background-color:#F2C94C');

    const highHtml = renderToString(<RiskBadge level="HIGH" />);
    expect(highHtml).toContain('High');
    expect(highHtml).toContain('background-color:#F2994A');

    const severeHtml = renderToString(<RiskBadge level="SEVERE" />);
    expect(severeHtml).toContain('Severe');
    expect(severeHtml).toContain('background-color:#EB5757');

    const noTravelHtml = renderToString(<RiskBadge level="NO_TRAVEL" />);
    expect(noTravelHtml).toContain('No Travel');
    expect(noTravelHtml).toContain('background-color:#6B1D1D');
    expect(noTravelHtml).toContain('color:#fff');
    // AA contrast on dark surfaces: outline must be present
    expect(noTravelHtml).toContain('outline:1px solid rgba(255,255,255,.4)');
  });
});

describe('RiskBreakdownBar Component', () => {
  it('renders stacked horizontal bar segments and accessible text legend', () => {
    const milesByLevel = {
      LOW: 800.1,
      MODERATE: 130.0,
      HIGH: 73.3,
      SEVERE: 0,
      NO_TRAVEL: 0,
    };
    const totalMiles = 1003.4;

    const html = renderToString(
      <RiskBreakdownBar milesByLevel={milesByLevel} totalMiles={totalMiles} />
    );

    // Segment title and width
    expect(html).toContain('Low: 800.1 mi');
    expect(html).toContain('Moderate: 130.0 mi');
    expect(html).toContain('High: 73.3 mi');

    // Never color alone: accessible text legend
    expect(html).toContain('800.1 mi Low');
    expect(html).toContain('130.0 mi Moderate');
    expect(html).toContain('73.3 mi High');
  });
});

describe('RouteSummaryStats Component', () => {
  const sampleSummary = {
    distance_miles: 1003.4,
    base_duration_s: 52000,
    buffered_duration_s: 57200,
    departure_utc: '2026-11-02T13:00:00Z',
    arrival_utc: '2026-11-03T04:53:20Z',
    avg_risk: 1.42,
    max_level: 'HIGH',
    miles_by_level: { LOW: 800.1, MODERATE: 130.0, HIGH: 73.3, SEVERE: 0, NO_TRAVEL: 0 },
  };

  it('renders distance, travel time, peak risk badge, and average risk score', () => {
    const html = renderToString(<RouteSummaryStats summary={sampleSummary} />);

    expect(html).toContain('Distance');
    expect(html).toContain('Est. Time');
    expect(html).toContain('Peak Risk');
    expect(html).toContain('High');
    expect(html).toContain('Avg Risk Score');
    expect(html).toContain('/ 5.00');
  });
});

describe('RouteCard Component', () => {
  const sampleRoute = {
    id: 'route-1',
    label: 'Route A',
    rank: 1,
    is_recommended: true,
    summary: {
      distance_miles: 1003.4,
      buffered_duration_s: 57200,
      departure_utc: '2026-11-02T13:00:00Z',
      arrival_utc: '2026-11-03T04:53:20Z',
      avg_risk: 1.42,
      max_level: 'HIGH',
      miles_by_level: { LOW: 800.1, MODERATE: 130.0, HIGH: 73.3, SEVERE: 0, NO_TRAVEL: 0 },
    },
  };

  it('renders route label, recommended badge, and selection styling', () => {
    const selectedHtml = renderToString(
      <RouteCard route={sampleRoute} isSelected={true} onClick={vi.fn()} index={0} />
    );

    expect(selectedHtml).toContain('Route A');
    expect(selectedHtml).toContain('★ Recommended');
    expect(selectedHtml).toContain('border-cobalt');
    expect(selectedHtml).toContain('-translate-y-[2px]');

    const unselectedHtml = renderToString(
      <RouteCard route={sampleRoute} isSelected={false} onClick={vi.fn()} index={1} />
    );
    expect(unselectedHtml).toContain('border-border-subtle');
  });
});

describe('RecommendationBanner Component', () => {
  const sampleRec = {
    route_id: 'route-1',
    status: 'OK',
    reasons: ['Route A has 0 Severe miles and 73.3 High miles.'],
  };
  const sampleRoute = {
    id: 'route-1',
    label: 'Route A',
    summary: { miles_by_level: { NO_TRAVEL: 0, SEVERE: 0 } },
  };

  it('renders standard OK status with sweeping underline', () => {
    const html = renderToString(
      <RecommendationBanner recommendation={sampleRec} recommendedRoute={sampleRoute} />
    );

    expect(html).toContain('RECOMMENDED: Route A');
    expect(html).toContain('SAFEST CHOICE');
    expect(html).toContain('Route A has 0 Severe miles and 73.3 High miles.');
    expect(html).toContain('bg-cobalt');
  });

  it('renders orange warning styling for OK_WITH_WARNING on Severe miles', () => {
    const warningRec = {
      ...sampleRec,
      status: 'OK_WITH_WARNING',
    };
    const routeWithSevere = {
      ...sampleRoute,
      summary: { miles_by_level: { NO_TRAVEL: 0, SEVERE: 45.0 } },
    };

    const html = renderToString(
      <RecommendationBanner recommendation={warningRec} recommendedRoute={routeWithSevere} />
    );

    expect(html).toContain('ADVISORY: SEVERE WEATHER');
    expect(html).toContain('Least Bad Option (D-08)');
  });

  it('renders red warning styling for OK_WITH_WARNING on No Travel miles', () => {
    const warningRec = {
      ...sampleRec,
      status: 'OK_WITH_WARNING',
    };
    const routeWithNoTravel = {
      ...sampleRoute,
      summary: { miles_by_level: { NO_TRAVEL: 12.0, SEVERE: 45.0 } },
    };

    const html = renderToString(
      <RecommendationBanner recommendation={warningRec} recommendedRoute={routeWithNoTravel} />
    );

    expect(html).toContain('WARNING: NO TRAVEL CONDITIONS');
  });
});

describe('CheckpointTable Component', () => {
  const sampleRoute = {
    id: 'route-1',
    checkpoints: [
      {
        index: 0,
        mile: 0.0,
        eta_utc: '2026-11-02T13:00:00Z',
        weather: { wind_mph: 12.0, wind_gust_mph: 18.0, rain_in_hr: 0, snow_in_hr: 0 },
        risk: { level: 'LOW' },
      },
      {
        index: 1,
        mile: 25.0,
        eta_utc: '2026-11-02T13:30:00Z',
        weather: { wind_mph: 28.0, wind_gust_mph: 40.0, rain_in_hr: 0.2, snow_in_hr: 0 },
        risk: { level: 'HIGH' },
      },
    ],
  };

  it('renders checkpoint table rows and highlights selected row', () => {
    const html = renderToString(
      <CheckpointTable
        route={sampleRoute}
        selectedCheckpointKey="route-1:1"
        onSelectCheckpoint={vi.fn()}
      />
    );

    expect(html).toContain('CHECKPOINT LOG');
    expect(html).toContain('0.0');
    expect(html).toContain('25.0');
    expect(html).toContain('12.0 mph (gust 18.0 mph)');
    expect(html).toContain('28.0 mph (gust 40.0 mph)');
    expect(html).toContain('border-l-cobalt'); // Highlight on selected row
  });
});

describe('NoticesPanel Component', () => {
  it('renders notice items with human-friendly message', () => {
    const notices = [
      { code: 'LONG_RANGE_FORECAST', message: 'Departure is more than 5 days away.' },
    ];

    const html = renderToString(<NoticesPanel notices={notices} />);
    expect(html).toContain('LONG RANGE FORECAST');
    expect(html).toContain('Departure is more than 5 days away.');
  });
});

describe('ResultsSkeleton Component', () => {
  it('renders loading skeleton with accessibility attributes', () => {
    const html = renderToString(<ResultsSkeleton />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Calculating routes and risk analysis...');
  });
});

describe('ErrorPanel Component', () => {
  it('maps all Section 15.4 error codes to friendly messages', () => {
    const codes = [
      'VALIDATION_ERROR',
      'NO_ROUTE_FOUND',
      'UPSTREAM_ROUTING_ERROR',
      'UPSTREAM_WEATHER_ERROR',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
    ];

    for (const code of codes) {
      const html = renderToString(
        <TripProvider>
          <ErrorPanel error={{ code }} onRetry={vi.fn()} />
        </TripProvider>
      );
      expect(html).toContain(code);
      expect(html).toContain('Try Again');
    }
  });
});
