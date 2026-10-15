import type { ReactElement } from 'react';

const PATHS: Record<string, ReactElement> = {
  today: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" strokeLinecap="round" /></>,
  week: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" /></>,
  bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0" strokeLinejoin="round" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" strokeLinecap="round" /></>,
  plus: <path d="M12 5v14M5 12h14" strokeLinecap="round" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />,
  alarm: <><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 1.5M4.5 5.5l3-2.5M19.5 5.5l-3-2.5" strokeLinecap="round" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M10.5 18.5h3" strokeLinecap="round" /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3.5 7l8.5 6 8.5-6" strokeLinejoin="round" /></>,
  repeat: <path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3" strokeLinecap="round" strokeLinejoin="round" />,
  left: <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />,
  right: <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />,
  close: <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" strokeLinecap="round" />,
  pin: <path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8" strokeLinecap="round" strokeLinejoin="round" />,
  note: <><path d="M6 3h9l4 4v14H6z" strokeLinejoin="round" /><path d="M9 11h7M9 15h7M9 7h3" strokeLinecap="round" /></>,
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" strokeLinecap="round" strokeLinejoin="round" />,
};

export function Icon({ name, size = 24, width = 1.8, label }: { name: keyof typeof PATHS | string; size?: number; width?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {PATHS[name]}
    </svg>
  );
}

export function DoneCheck({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#17805A" />
      <path d="M7 12.5l3.2 3L17 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AppMark({ size = 20 }: { size?: number }) {
  // Same two-chevron mark as the app icon.
  return (
    <svg width={size} height={size} viewBox="96 132 320 244" aria-hidden="true">
      <path d="M104 292 256 140l152 152h-70l-82-82-82 82z" fill="#fff" />
      <path d="M178 368 256 290l78 78h-52l-26-26-26 26z" fill="#fff" fillOpacity=".72" />
    </svg>
  );
}
