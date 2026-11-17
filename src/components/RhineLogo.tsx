import React from 'react';

interface RhineLogoProps {
  className?: string;
  showSubtext?: boolean;
  accentPolarity?: boolean;
}

/**
 * Official Arknights Rhine Lab LLC. emblem:
 * Asymmetric open infinity / owl-face contour with '+' (left) and '-' (right)
 * biochemical polarity marks, matching NoriZC's faction design proportions.
 */
export const RhineLogo: React.FC<RhineLogoProps> = ({
  className = 'w-11 h-6',
  showSubtext = false,
  accentPolarity = false,
}) => {
  const viewBox = showSubtext ? '0 0 120 76' : '0 0 120 64';
  const polarityColor = accentPolarity ? '#E05320' : 'currentColor';

  return (
    <svg
      className={className}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Rhine Lab Official Emblem"
    >
      {/* Continuous open infinity / owl-eye ribbon with rounded caps */}
      <path
        d="M 79.6 15.2 A 19 19 0 1 1 75.83 46.16 L 44.17 17.84 A 19 19 0 1 0 44.17 46.16 L 65.8 26.8"
        stroke="currentColor"
        strokeWidth="9.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Left loop polarity: '+' */}
      <path
        d="M 25.5 32 H 37.5 M 31.5 26 V 38"
        stroke={polarityColor}
        strokeWidth="4.8"
        strokeLinecap="round"
      />

      {/* Right loop polarity: '-' */}
      <path
        d="M 82.5 32 H 94.5"
        stroke={polarityColor}
        strokeWidth="4.8"
        strokeLinecap="round"
      />

      {showSubtext && (
        <text
          x="60"
          y="71"
          textAnchor="middle"
          fill="currentColor"
          fontSize="8.2"
          fontWeight="700"
          letterSpacing="3.2"
          fontFamily="'IBM Plex Sans', 'Inter', serif"
        >
          RHINE·LAB
        </text>
      )}
    </svg>
  );
};
