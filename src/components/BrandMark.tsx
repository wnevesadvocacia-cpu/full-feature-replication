export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="WnevesBox"
    >
      <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M11 14L15 28L20 18L25 28L29 14"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
