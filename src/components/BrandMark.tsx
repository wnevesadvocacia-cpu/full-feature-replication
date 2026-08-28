import { useId } from "react";

export function BrandMark({ className }: { className?: string }) {
  const uid = useId().replace(/[:]/g, "");
  const grad = `bm-g-${uid}`;
  const shine = `bm-s-${uid}`;

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="WnevesBox"
    >
      <defs>
        <linearGradient id={grad} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.72" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.98" />
        </linearGradient>
        <linearGradient id={shine} x1="12" y1="10" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* emblem shell */}
      <path
        d="M24 3.5 41 12v18.2c0 1.6-.85 3.1-2.23 3.9L24 44.5 9.23 34.1A4.5 4.5 0 0 1 7 30.2V12L24 3.5Z"
        fill={`url(#${shine})`}
        stroke={`url(#${grad})`}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* monogram W */}
      <path
        d="M15.5 17.5 20 31l4-9.2 4 9.2 4.5-13.5"
        stroke={`url(#${grad})`}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* accent seal */}
      <circle cx="24" cy="36.6" r="1.5" fill="currentColor" opacity="0.9" />
    </svg>
  );
}
