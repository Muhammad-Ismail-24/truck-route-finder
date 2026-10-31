/**
 * @file HeroIcons.jsx
 * Inline SVG line icons for the hero feature cards.
 * White line icons (rendered at 38u per spec).
 * Original artwork; no real brands or trademarked designs.
 *
 * Icons:
 * 1. route: Two pins joined by a path
 * 2. weather: Cloud with slanted rain lines
 * 3. scale: Weight / balance scale
 * 4. shield: Shield with checkmark
 * 5. heatmap: Stacked isometric layers
 */

export function RouteIcon({ className = 'hero-card-icon', ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {/* Origin Pin */}
      <circle cx="6" cy="6" r="2.5" />
      <path d="M6 8.5V11" />
      {/* Destination Pin */}
      <circle cx="18" cy="18" r="2.5" />
      <path d="M18 13V15.5" />
      {/* Connecting Path */}
      <path d="M6 11C6 15 18 10 18 13" />
    </svg>
  );
}

export function WeatherIcon({ className = 'hero-card-icon', ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {/* Cloud outline */}
      <path d="M17.5 17H7.2C4.9 17 3 15.1 3 12.8C3 10.6 4.7 8.8 6.9 8.6C7.5 5.4 10.3 3 13.6 3C17.3 3 20.3 5.8 20.7 9.4C21.5 10 22 11 22 12.2C22 14.8 19.9 17 17.5 17Z" />
      {/* Rain lines */}
      <path d="M8 19L6.5 22" />
      <path d="M12.5 19L11 22" />
      <path d="M17 19L15.5 22" />
    </svg>
  );
}

export function ScaleIcon({ className = 'hero-card-icon', ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {/* Central post and base */}
      <path d="M12 3V20" />
      <path d="M7 20H17" />
      {/* Crossbeam */}
      <path d="M4 6.5H20" />
      {/* Left pan */}
      <path d="M4 6.5L1.5 13H6.5L4 6.5Z" />
      <path d="M1.5 13C1.5 14.5 2.6 15.5 4 15.5C5.4 15.5 6.5 14.5 6.5 13" />
      {/* Right pan */}
      <path d="M20 6.5L17.5 13H22.5L20 6.5Z" />
      <path d="M17.5 13C17.5 14.5 18.6 15.5 20 15.5C21.4 15.5 22.5 14.5 22.5 13" />
    </svg>
  );
}

export function ShieldIcon({ className = 'hero-card-icon', ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {/* Shield outline */}
      <path d="M12 2L4 5.5V11.5C4 16.5 7.4 21.1 12 22C16.6 21.1 20 16.5 20 11.5V5.5L12 2Z" />
      {/* Checkmark */}
      <path d="M8.5 11.8L11 14.3L15.8 9.5" />
    </svg>
  );
}

export function HeatmapIcon({ className = 'hero-card-icon', ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {/* Top layer */}
      <path d="M12 2L2 7L12 12L22 7L12 2Z" />
      {/* Middle layer */}
      <path d="M2 12L12 17L22 12" />
      {/* Bottom layer */}
      <path d="M2 17L12 22L22 17" />
    </svg>
  );
}

const ICONS = {
  route: RouteIcon,
  weather: WeatherIcon,
  scale: ScaleIcon,
  shield: ShieldIcon,
  heatmap: HeatmapIcon,
};

export function HeroIcon({ name, ...props }) {
  const Component = ICONS[name];
  if (!Component) return null;
  return <Component {...props} />;
}
