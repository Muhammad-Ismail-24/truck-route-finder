/**
 * @file Spinner.jsx
 * Accessible SVG circular loading spinner.
 */

export default function Spinner({ className = 'w-4 h-4', ...props }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
      {...props}
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="9"
      />
      <path
        className="opacity-90"
        d="M12 3a9 9 0 0 1 9 9"
      />
    </svg>
  );
}
