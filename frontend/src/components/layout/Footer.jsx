/**
 * @file Footer.jsx
 * Application footer displaying mandated attribution for Open-Meteo and OpenFreeMap / OpenStreetMap.
 * Reference: ARCHITECTURE.md Section 17.1.
 */

export default function Footer() {
  return (
    <footer className="bg-ink border-t border-border-subtle py-8 px-4 sm:px-6 lg:px-12 text-center select-none">
      <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-body text-text-faint">
        <p className="tabular">
          Weather data by{' '}
          <a
            href="https://open-meteo.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted hover:text-white transition-colors underline underline-offset-2"
          >
            Open-Meteo.com
          </a>{' '}
          · Map ©{' '}
          <a
            href="https://openfreemap.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted hover:text-white transition-colors underline underline-offset-2"
          >
            OpenFreeMap
          </a>{' '}
          ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted hover:text-white transition-colors underline underline-offset-2"
          >
            OpenStreetMap contributors
          </a>
        </p>

        <p className="font-mono text-[11px] text-text-faint">
          HAULCAST &middot; WEATHER-AWARE TRUCK ROUTING
        </p>
      </div>
    </footer>
  );
}
