const PATHS = {
  dashboard: "M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-4H4v4ZM14 8h6V4h-6v4Z",
  bell: "M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4.3 10.5a2 2 0 0 0 3.4 0",
  sales: "M4 4h16v13l-2.7-2-2.6 2-2.7-2-2.7 2-2.6-2L4 17V4Zm4 4h8M8 11.5h5",
  purchases: "M3 4h2.5l2 10.5h10L20 7H6.2M9 19.5h.01M16 19.5h.01",
  payments: "M3 6h18v12H3V6Zm0 4h18M7 14.5h3",
  items: "M12 3 4 7v10l8 4 8-4V7l-8-4Zm0 9L4 7m8 5 8-5m-8 5v9",
  documents: "M13.5 3H6v18h12V7.5L13.5 3Zm0 0v4.5H18M9 13h6M9 16.5h4",
  hr: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0m1-9.2a3.2 3.2 0 0 0 0-6.2M17 14.4a6 6 0 0 1 4 5.6",
  reports: "M4 20V4m0 16h16M8 16v-4m4 4V8m4 8v-6",
  integrations: "M9 7 6.5 9.5a4 4 0 0 0 5.6 5.6M15 17l2.5-2.5a4 4 0 0 0-5.6-5.6M9.5 14.5l5-5",
  developers: "m8 8-4 4 4 4m8-8 4 4-4 4M13.5 6l-3 12",
  support: "M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v5H5.5A1.5 1.5 0 0 1 4 16.5V13Zm16 0h-3v5h1.5a1.5 1.5 0 0 0 1.5-1.5V13Zm-2.5 5c0 1.7-2 2.5-4 2.5",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 16.8h.01",
  admin: "M12 3 5 6v5.5c0 4.3 2.9 7.7 7 9.5 4.1-1.8 7-5.2 7-9.5V6l-7-3Zm-2.5 8.5 2 2 3.5-3.5",
  settings: "M5 7h8m4 0h2M5 17h2m4 0h8M13 4.5v5M7 14.5v5",
  requests: "M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M18.5 8v6m-3-3h6",
} as const;

export type NavIconName = keyof typeof PATHS;

export function NavIcon({ name, className = "h-[18px] w-[18px]" }: { name: NavIconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
