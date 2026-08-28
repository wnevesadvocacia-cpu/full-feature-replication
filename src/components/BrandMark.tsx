export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="WnevesBox"
    >
      <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5" opacity="0.28" />
      <path
        d="M11 14C11 14 14.2 27 14.65 27C15.1 27 17.4 18 20 18C22.6 18 24.9 27 25.35 27C25.8 27 29 14 29 14"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.5 14H16.5M23.5 14H27.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
