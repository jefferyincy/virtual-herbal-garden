/**
 * Single line-icon set: 1.5px stroke, rounded caps and joins, 20px default.
 * Registry-based so every screen uses the same geometry and stroke weight.
 */
import type { SVGProps } from 'react';

const shapes = {
  leaf: (
    <>
      <path d="M4 20c0-7 5-13 16-16 3 11-3 16-11 16H4z" />
      <path d="M4 20 15 9" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="m5 13 4 4L19 7" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'chevron-up': <path d="m6 15 6-6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z" />
      <path d="M8 3v18" />
    </>
  ),
  'book-open': (
    <>
      <path d="M12 6.5C10.5 5 8.5 4.5 5 4.5v13c3.5 0 5.5.5 7 2" />
      <path d="M12 6.5C13.5 5 15.5 4.5 19 4.5v13c-3.5 0-5.5.5-7 2z" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="m9 13.5-1.5 7L12 18l4.5 2.5-1.5-7" />
    </>
  ),
  flame: (
    <path d="M12 3c3 3.5 5 6 5 9a5 5 0 0 1-10 0c0-1.5.6-2.8 1.5-4 .6 1 1.5 1.6 2.5 1.8-.8-2.2-.5-4.5 1-6.8z" />
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 5.6M18 20a6 6 0 0 0-3-5.2" />
    </>
  ),
  message: (
    <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
  ),
  'arrow-up': <path d="M12 19V5M6 11l6-6 6 6" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  'arrow-left': <path d="M19 12H5M11 18l-6-6 6-6" />,
  bookmark: <path d="M6 4h12v16l-6-4-6 4z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M4.5 7.5l1.7 1M17.8 15.5l1.7 1M4.5 16.5l1.7-1M17.8 8.5l1.7-1" />
    </>
  ),
  filter: <path d="M4 5h16l-6 7v6l-4 2v-8z" />,
  shield: <path d="M12 3.5 20 6v6c0 5-3.4 8-8 9.5C7.4 20 4 17 4 12V6z" />,
  'alert-triangle': (
    <>
      <path d="M12 4.5 21 20H3z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 8h.01" />
    </>
  ),
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  rain: (
    <>
      <path d="M7 15a4.5 4.5 0 0 1 .4-9 6 6 0 0 1 11.3 1.7A3.6 3.6 0 0 1 18 15" />
      <path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2" />
    </>
  ),
  mist: (
    <>
      <path d="M7 14a4.5 4.5 0 0 1 .4-9 6 6 0 0 1 11.3 1.7A3.6 3.6 0 0 1 18 14" />
      <path d="M5 19h14" />
    </>
  ),
  volume: (
    <>
      <path d="M5 10v4h3l4 3V7l-4 3z" />
      <path d="M16 9.5a4 4 0 0 1 0 5" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V5M8 9l4-4 4 4" />
      <path d="M4 17v3h16v-3" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="10" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  paperclip: (
    <path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" />
  ),
  send: (
    <>
      <path d="M5 12 20 4l-8 16-2.5-6z" />
      <path d="M9.5 14 20 4" />
    </>
  ),
  star: <path d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z" />,
  home: (
    <>
      <path d="M4 11 12 4l8 7v9H4z" />
      <path d="M10 20v-6h4v6" />
    </>
  ),
  chart: <path d="M5 20V10M12 20V4M19 20v-7" />,
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3M12 13v4M9 20h6" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V10a6 6 0 1 1 12 0v6l2 2H4z" />
      <path d="M10 21h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  logout: (
    <>
      <path d="M15 4h4v16h-4" />
      <path d="M11 8l-4 4 4 4M7 12h8" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.5 6.3A9.7 9.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.4 8.3A17 17 0 0 0 2 12s3.5 6 10 6a9.6 9.6 0 0 0 3-.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" />
    </>
  ),
  mail: (
    <>
      <path d="M3 6h18v12H3z" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 4 1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
      <path d="m18.5 15.5.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15 9-2 5-4 1 2-5z" />
    </>
  ),
  map: (
    <>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 3 2.5 14 0 17M12 3.5c-2.5 3-2.5 14 0 17" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  trash: (
    <>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  pencil: <path d="m4 20 1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 6H6a2 2 0 0 0-2 2v9" />
    </>
  ),
  grip: <path d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" />,
  more: <path d="M6 12h.01M12 12h.01M18 12h.01" />,
  'external-link': (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 6.3" />
      <path d="M20 4v7h-7" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M8 11l4 4 4-4" />
      <path d="M4 19h16" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="m8.5 10.8 7-3.6M8.5 13.2l7 3.6" />
    </>
  ),
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </>
  ),
  'alert-circle': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v5M12 16h.01" />
    </>
  ),
  'x-circle': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9.5 9.5 5 5M14.5 9.5l-5 5" />
    </>
  ),
  hexagon: <path d="M12 3 20 7.5v9L12 21 4 16.5v-9z" />,
  play: <path d="M8 5.5 18 12 8 18.5z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  dots: <path d="M7 12h.01M12 12h.01M17 12h.01" />,
  spinner: <path d="M12 3a9 9 0 1 0 9 9" />,
  dot: <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />,
} as const;

export type IconName = keyof typeof shapes;

export function Icon({
  name,
  size = 20,
  className,
  strokeWidth = 1.5,
  ...rest
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
} & Omit<SVGProps<SVGSVGElement>, 'name' | 'children' | 'viewBox' | 'width' | 'height'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {shapes[name]}
    </svg>
  );
}
