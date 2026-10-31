'use client';

import { useState, useEffect } from 'react';
import { fetchJson } from '../lib/api/client';
import { RISK_LEVELS, ROUTE_COLORS } from '../lib/risk/riskLevels';
import { formatMiles } from '../lib/format/distance';
import { formatWeight } from '../lib/format/weight';
import { formatDuration } from '../lib/format/time';

export default function TestPage() {
  const [healthStatus, setHealthStatus] = useState('checking...');

  useEffect(() => {
    let active = true;
    fetchJson('/api/v1/health')
      .then((data) => {
        if (active) setHealthStatus(`Online: ${JSON.stringify(data)}`);
      })
      .catch((err) => {
        if (active) setHealthStatus(`Offline or Error: ${err.message}`);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-ink p-8 text-white font-body">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Anton Display Font */}
        <div>
          <h2 className="text-xs tracking-widest text-text-muted uppercase mb-2 font-body">
            Display Font (Anton)
          </h2>
          <h1 className="font-display text-5xl md:text-6xl tracking-wide uppercase text-white">
            KNOW YOUR ROUTE. MILE BY MILE.
          </h1>
        </div>

        {/* Archivo Body Font */}
        <div>
          <h2 className="text-xs tracking-widest text-text-muted uppercase mb-2 font-body">
            Body Font (Archivo)
          </h2>
          <p className="font-body text-base text-text-muted leading-relaxed max-w-2xl">
            We pull truck-specific route options, then check the forecast at your estimated arrival
            time at every checkpoint along the way. Wind, rain and snow are scored against your
            load weight, so the recommendation fits your truck, not a generic car.
          </p>
        </div>

        {/* JetBrains Mono Tabular Numbers */}
        <div>
          <h2 className="text-xs tracking-widest text-text-muted uppercase mb-2 font-body">
            Numbers with Units (JetBrains Mono + Tabular Figures)
          </h2>
          <div className="p-4 rounded-xl bg-surface-1 border border-border-subtle space-y-2 tabular text-sm">
            <div className="flex justify-between border-b border-border-subtle pb-2">
              <span>ROUTE A: {formatMiles(1003.4)}</span>
              <span>{formatDuration(57200)}</span>
              <span>{formatWeight(42000)}</span>
              <span>12.3 mph</span>
            </div>
            <div className="flex justify-between border-b border-border-subtle pb-2">
              <span>ROUTE B: {formatMiles(1250.0)}</span>
              <span>{formatDuration(68400)}</span>
              <span>{formatWeight(80000)}</span>
              <span>48.5 mph</span>
            </div>
            <div className="flex justify-between">
              <span>ROUTE C: {formatMiles(980.5)}</span>
              <span>{formatDuration(51300)}</span>
              <span>{formatWeight(25000)}</span>
              <span>24.0 mph</span>
            </div>
          </div>
        </div>

        {/* Theme Tokens & Swatches */}
        <div>
          <h2 className="text-xs tracking-widest text-text-muted uppercase mb-3 font-body">
            Theme Colors & Surfaces
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-white text-ink font-semibold">White #fff</div>
            <div className="p-3 rounded-lg bg-ink text-white border border-border-strong font-semibold">
              Ink #111
            </div>
            <div className="p-3 rounded-lg bg-cobalt text-white font-semibold">Cobalt #2f63ff</div>
            <div className="p-3 rounded-lg bg-giant text-ink font-semibold">Giant #e9e9e9</div>
            <div className="p-3 rounded-lg bg-surface-1 text-white border border-border-subtle">
              Surface 1
            </div>
            <div className="p-3 rounded-lg bg-surface-2 text-white border border-border-subtle">
              Surface 2
            </div>
            <div className="p-3 rounded-lg bg-surface-3 text-white border border-border-subtle">
              Surface 3
            </div>
            <div className="p-3 rounded-lg bg-surface-2 border border-cobalt text-cobalt">
              Cobalt Focus
            </div>
          </div>
        </div>

        {/* Risk Palette & Route Colors */}
        <div>
          <h2 className="text-xs tracking-widest text-text-muted uppercase mb-3 font-body">
            Risk Palette (Section 17.7)
          </h2>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {Object.values(RISK_LEVELS).map((lvl) => (
              <span
                key={lvl.key}
                className="px-3 py-1.5 rounded-full"
                style={{
                  backgroundColor: lvl.fill,
                  color: lvl.textColor,
                  border: lvl.outline || 'none',
                }}
              >
                {lvl.label} ({lvl.level})
              </span>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-xs">
            {Object.entries(ROUTE_COLORS)
              .filter(([k]) => ['A', 'B', 'C'].includes(k))
              .map(([label, color]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-text-muted">Route {label}: {color}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Backend Health Check Status */}
        <div className="p-4 rounded-xl bg-surface-1 border border-border-subtle text-xs">
          <span className="text-text-muted">Next.js API Rewrite (/api/v1/health): </span>
          <span className="tabular font-semibold text-cobalt">{healthStatus}</span>
        </div>
      </div>
    </main>
  );
}
