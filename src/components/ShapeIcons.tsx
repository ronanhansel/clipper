import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const defaults = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 18 18",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function RectIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...defaults(size)} {...props}>
      <rect x="2.5" y="2.5" width="13" height="13" rx="1.5" />
    </svg>
  );
}

export function LineIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...defaults(size)} {...props}>
      <line x1="2.5" y1="15.5" x2="15.5" y2="2.5" />
    </svg>
  );
}

export function ArrowIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...defaults(size)} {...props}>
      <line x1="3" y1="15" x2="15" y2="3" />
      <polyline points="7,3 15,3 15,11" />
    </svg>
  );
}

export function EllipseIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...defaults(size)} {...props}>
      <ellipse cx="9" cy="9" rx="6.5" ry="6.5" />
    </svg>
  );
}

export function PolygonIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...defaults(size)} {...props}>
      <polygon points="9,1.5 16.5,6.5 13.5,15.5 4.5,15.5 1.5,6.5" />
    </svg>
  );
}

export function StarIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...defaults(size)} {...props}>
      <polygon points="9,1.5 10.8,6.8 16.5,6.8 11.9,10.2 13.6,15.5 9,12.2 4.4,15.5 6.1,10.2 1.5,6.8 7.2,6.8" />
    </svg>
  );
}

export function NullObjectIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...defaults(size)} {...props}>
      <rect x="2.5" y="2.5" width="13" height="13" rx="1.5" />
      <line x1="9" y1="5" x2="9" y2="13" />
      <line x1="5" y1="9" x2="13" y2="9" />
    </svg>
  );
}

export function Pattern2DIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...defaults(size)} {...props}>
      <rect x="2.5" y="2.5" width="13" height="13" rx="1.5" />
      <circle cx="9" cy="9" r="3.25" />
    </svg>
  );
}
