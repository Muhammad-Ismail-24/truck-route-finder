'use client';

/**
 * @file MapLegend.jsx
 * Heatmap intensity legend showing the active metric's color ramp and thresholds.
 *
 * References:
 * ARCHITECTURE.md Section 14, 17.5.
 */

/**
 * @param {Object} props
 * @param {'RISK' | 'WIND' | 'RAIN' | 'SNOW'} [props.metric='RISK']
 * @param {string} [props.className='']
 */
export default function MapLegend({ metric = 'RISK', className = '' }) {
  const metricUpper = (metric || 'RISK').toUpperCase();

  const LEGEND_CONFIGS = {
    RISK: {
      title: 'Risk Level (Load-Aware)',
      ticks: ['Low', 'Mod', 'High', 'Severe', 'No Travel'],
      note: 'Low risk is transparent by design',
    },
    WIND: {
      title: 'Sustained Wind Speed',
      ticks: ['0 mph', '25', '35', '45', '55+ mph'],
      note: 'Threshold: 55 mph No Travel (any load)',
    },
    RAIN: {
      title: 'Precipitation Rate',
      ticks: ['0 in/hr', '0.1', '0.25', '0.5', '1.0+ in/hr'],
      note: 'Threshold: ≥ 1.0 in/hr No Travel',
    },
    SNOW: {
      title: 'Snowfall Rate',
      ticks: ['0 in/hr', '0.1', '0.5', '1.5', '3.0+ in/hr'],
      note: 'Threshold: ≥ 3.0 in/hr No Travel',
    },
  };

  const config = LEGEND_CONFIGS[metricUpper] || LEGEND_CONFIGS.RISK;

  return (
    <div className={`space-y-1.5 select-none text-left ${className}`}>
      {/* Legend Title */}
      <div className="flex items-center justify-between text-[11px] font-body text-text-muted">
        <span className="font-medium text-white">{config.title}</span>
        <span className="text-[10px] text-text-faint">{config.note}</span>
      </div>

      {/* Gradient Color Ramp */}
      <div
        className="w-full h-2 rounded-full border border-border-subtle"
        style={{
          background:
            'linear-gradient(to right, rgba(0,0,0,0) 0%, var(--color-risk-moderate) 25%, var(--color-risk-high) 50%, var(--color-risk-severe) 75%, var(--color-risk-no-travel) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Threshold Labels */}
      <div className="flex justify-between items-center text-[10px] font-mono tabular text-text-faint px-0.5">
        {config.ticks.map((tick, i) => (
          <span key={i} className="first:text-left last:text-right">
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
}
