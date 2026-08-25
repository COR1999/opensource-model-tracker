export default function Spinner({
  className = "h-4 w-4",
  label,
}: {
  className?: string;
  /** Provide when the spinner is the only indication of activity. */
  label?: string;
}) {
  return (
    <>
      <svg
        className={`animate-spin ${className}`}
        viewBox="0 0 24 24"
        // Decorative by default: the surrounding control carries the accessible
        // name, so announcing the spinner too would duplicate it.
        aria-hidden="true"
        focusable="false"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}
