/**
 * Animated SVG icons for habits & goals.
 * - AnimatedFlame: pulsing/flickering fire for streaks
 * - AnimatedTrophy: shimmering trophy for completed goals
 */

interface AnimatedIconProps {
  size?: number;
  className?: string;
}

/** Animated fire icon — gentle flicker + glow for streaks */
export function AnimatedFlame({ size = 20, className }: AnimatedIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="flame-grad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="50%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <linearGradient id="flame-inner-grad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#fef08a" />
        </linearGradient>
        <filter id="flame-glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer flame */}
      <path
        d="M12 2C12 2 9 6.5 9 9.5C8.2 8 7 7.5 7 7.5C7 7.5 4 11 4 15C4 19.4 7.6 22 12 22C16.4 22 20 19.4 20 15C20 10 16 6 12 2Z"
        fill="url(#flame-grad)"
        filter="url(#flame-glow)"
      >
        <animateTransform
          attributeName="transform"
          type="scale"
          values="1 1;1.02 1.04;0.98 1.02;1 1"
          dur="1.2s"
          repeatCount="indefinite"
          additive="sum"
        />
        <animate
          attributeName="opacity"
          values="0.95;1;0.9;0.95"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>

      {/* Inner flame (brighter core) */}
      <path
        d="M12 10C12 10 10 13 10 15C10 16.7 10.9 18 12 18C13.1 18 14 16.7 14 15C14 13 12 10 12 10Z"
        fill="url(#flame-inner-grad)"
      >
        <animateTransform
          attributeName="transform"
          type="scale"
          values="1 1;0.95 1.06;1.05 0.97;1 1"
          dur="0.9s"
          repeatCount="indefinite"
          additive="sum"
        />
      </path>
    </svg>
  );
}

/** Animated trophy icon — shimmer sweep + gentle bounce for completed goals */
export function AnimatedTrophy({ size = 24, className }: AnimatedIconProps) {
  const id = `trophy-${Math.random().toString(36).slice(2, 6)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="50%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        {/* Shimmer sweep */}
        <linearGradient id={`${id}-shimmer`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="40%" stopColor="rgba(255,255,255,0)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.6)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            values="-1 0;2 0"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </linearGradient>
      </defs>

      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0;0 -0.5;0 0"
          dur="2s"
          repeatCount="indefinite"
        />

        {/* Cup body */}
        <path
          d="M6 3H18V8C18 11.3 15.3 14 12 14C8.7 14 6 11.3 6 8V3Z"
          fill={`url(#${id}-grad)`}
          stroke="#d97706"
          strokeWidth="0.5"
        />

        {/* Left handle */}
        <path
          d="M6 5H4C3.4 5 3 5.4 3 6V7C3 8.7 4.3 10 6 10"
          stroke="#d97706"
          strokeWidth="1.2"
          fill="none"
        />

        {/* Right handle */}
        <path
          d="M18 5H20C20.6 5 21 5.4 21 6V7C21 8.7 19.7 10 18 10"
          stroke="#d97706"
          strokeWidth="1.2"
          fill="none"
        />

        {/* Stem */}
        <rect x="11" y="14" width="2" height="4" rx="0.5" fill="#d97706" />

        {/* Base */}
        <rect x="8" y="18" width="8" height="2" rx="1" fill={`url(#${id}-grad)`} stroke="#d97706" strokeWidth="0.5" />

        {/* Shimmer overlay on cup */}
        <path
          d="M6 3H18V8C18 11.3 15.3 14 12 14C8.7 14 6 11.3 6 8V3Z"
          fill={`url(#${id}-shimmer)`}
        />

        {/* Star on cup */}
        <path
          d="M12 6L12.9 8.3L15.3 8.3L13.4 9.7L14.1 12L12 10.5L9.9 12L10.6 9.7L8.7 8.3L11.1 8.3Z"
          fill="#fef3c7"
          opacity="0.9"
        />
      </g>
    </svg>
  );
}
