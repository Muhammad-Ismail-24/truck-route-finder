'use client';

/**
 * @file HeatmapControls.jsx
 * Map overlay controls for the hourly weather/risk forecast heatmap.
 * Features show/hide toggle, metric segment selector, 0..48h forecast slider,
 * and intensity legend.
 *
 * Performance Architecture (Section 17.5 & 25.5):
 * - NO network on slider move (all 49 hours precomputed in result.heatmap).
 * - NO animation/transition on slider data updates.
 * - rAF-throttled source.setData updates to the GPU.
 * - Memoizes frames via useHeatmapFrame (LRU of 8).
 * - Only HeatmapControls re-renders during slider drag; MapView remains unrendered.
 *
 * References:
 * ARCHITECTURE.md Section 14, 17.5, 25.5, Decisions D-20, D-28.
 */

import { useRef, useCallback, useEffect } from 'react';
import Slider from '../ui/Slider';
import MapLegend from './MapLegend';
import { useHeatmapFrame } from '../../hooks/useHeatmapFrame';
import { HEATMAP_SOURCE_ID, setHeatmapVisibility } from '../../map/heatmapLayer';
import { formatUtcInBrowserTimezone } from '../../lib/format/time';

const METRICS = [
  { key: 'RISK', label: 'Risk' },
  { key: 'WIND', label: 'Wind' },
  { key: 'RAIN', label: 'Rain' },
  { key: 'SNOW', label: 'Snow' },
];

/**
 * @param {Object} props
 * @param {import('maplibre-gl').Map | null} props.map
 * @param {import('../../lib/types').HeatmapData} [props.heatmapData]
 * @param {boolean} [props.visible=true]
 * @param {number} [props.hour=0]
 * @param {'RISK' | 'WIND' | 'RAIN' | 'SNOW'} [props.metric='RISK']
 * @param {(action: any) => void} props.dispatch
 */
export default function HeatmapControls({
  map,
  heatmapData,
  visible = true,
  hour = 0,
  metric = 'RISK',
  dispatch,
}) {
  const rafRef = useRef(null);
  const { getFrame } = useHeatmapFrame(heatmapData);

  // Direct GPU data push throttled with requestAnimationFrame
  const pushFrameToMap = useCallback(
    (targetHour, targetMetric) => {
      if (!map || !map.isStyleLoaded() || !heatmapData) return;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        const source = map.getSource(HEATMAP_SOURCE_ID);
        if (source) {
          const frame = getFrame(targetHour, targetMetric);
          source.setData(frame);
        }
      });
    },
    [map, heatmapData, getFrame]
  );

  // Sync frame on metric or heatmapData change
  useEffect(() => {
    pushFrameToMap(hour, metric);
  }, [pushFrameToMap, hour, metric]);

  // Clean up rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Compute absolute timestamp for current hour in browser timezone
  const startUtc = heatmapData?.start_utc;
  const currentTimestamp = startUtc
    ? new Date(new Date(startUtc).getTime() + hour * 3600 * 1000)
    : null;
  const formattedTime = currentTimestamp
    ? formatUtcInBrowserTimezone(currentTimestamp)
    : '';

  // Slider change handler: push frame immediately via rAF and update state
  const handleSliderChange = (newHour) => {
    pushFrameToMap(newHour, metric);
    dispatch({ type: 'HEATMAP_HOUR_SET', payload: newHour });
  };

  // Metric toggle handler
  const handleMetricChange = (newMetric) => {
    pushFrameToMap(hour, newMetric);
    dispatch({ type: 'HEATMAP_METRIC_SET', payload: newMetric });
  };

  // Visibility toggle handler
  const handleVisibilityToggle = () => {
    const nextVisible = !visible;
    if (map) {
      setHeatmapVisibility(map, nextVisible);
    }
    dispatch({ type: 'HEATMAP_VISIBILITY_SET', payload: nextVisible });
  };

  if (!heatmapData) return null;

  return (
    <div
      role="region"
      aria-label="Heatmap forecast controls"
      className="absolute bottom-3 left-3 right-3 sm:left-4 sm:right-auto sm:w-[380px] z-10 bg-surface-1 border border-border-subtle rounded-2xl p-4 shadow-2xl space-y-3 text-white font-body select-none"
    >
      {/* Top Bar: Visibility Toggle & Metric Segmented Control */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Visibility Toggle Button */}
        <button
          type="button"
          onClick={handleVisibilityToggle}
          aria-pressed={visible}
          aria-label={visible ? 'Hide weather heatmap' : 'Show weather heatmap'}
          className={`flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-full text-xs font-mono tabular font-medium transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-1 focus-visible:ring-offset-surface-1 ${
            visible
              ? 'bg-cobalt/20 border-cobalt/40 text-cobalt hover:bg-cobalt/30'
              : 'bg-surface-2 border-border-subtle text-text-muted hover:text-white'
          }`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${visible ? 'bg-cobalt' : 'bg-text-faint'}`}
            aria-hidden="true"
          />
          <span>{visible ? 'Heatmap ON' : 'Heatmap OFF'}</span>
        </button>

        {/* Metric Segmented Control */}
        <div
          role="radiogroup"
          aria-label="Heatmap weather metric"
          className="flex items-center bg-surface-2 p-1 rounded-full border border-border-subtle"
        >
          {METRICS.map((m) => {
            const isSelected = metric === m.key;
            return (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handleMetricChange(m.key)}
                className={`min-h-[44px] min-w-[44px] px-3 flex items-center justify-center rounded-full text-xs font-mono tabular font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-1 focus-visible:ring-offset-surface-2 ${
                  isSelected
                    ? 'bg-cobalt text-white shadow-sm'
                    : 'text-text-muted hover:text-white'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Slider & Time Offset Display */}
      {visible && (
        <div className="space-y-1.5 pt-1">
          {/* Header Row: +Nh and Absolute Browser Time */}
          <div className="flex items-baseline justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-mono tabular font-bold text-sm text-white">
                {`+${hour}h`}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Forecast
              </span>
            </div>

            {formattedTime && (
              <span className="font-mono tabular text-[11px] text-text-muted">
                {formattedTime}
              </span>
            )}
          </div>

          {/* Slider Component (0..48h) */}
          <Slider
            value={hour}
            min={0}
            max={48}
            step={1}
            onChange={handleSliderChange}
            ariaLabel="Forecast Hour"
            ariaValueText={`+${hour} hours, ${formattedTime}`}
          />

          {/* Hour Tick Markers */}
          <div className="flex justify-between items-center text-[10px] font-mono tabular text-text-muted px-0.5">
            <span>0h (Dep)</span>
            <span>+12h</span>
            <span>+24h</span>
            <span>+36h</span>
            <span>+48h</span>
          </div>

          {/* Intensity Legend */}
          <div className="pt-2 border-t border-border-subtle/50">
            <MapLegend metric={metric} />
          </div>
        </div>
      )}
    </div>
  );
}
