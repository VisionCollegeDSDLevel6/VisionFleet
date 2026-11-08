const iconPaths = {
  dashboard: "M3 3h8v8H3z M15 3h6v6h-6z M15 13h6v8h-6z M3 15h8v6H3z",
  booking: "M8 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3 M9 3h6v4H9z M7 12h10 M7 17h7",
  van: "M3 7h12v11H3z M15 10h3l3 4v4h-6z M5 18v2h4v-2 M16 18v2h4v-2 M6 11h6",
  driver: "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8 M4 21v-2a8 8 0 0 1 16 0v2",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  chevron: "M9 18l6-6-6-6",
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18 M12 7v5l3 2",
  check: "M4 12l5 5L20 6",
  logout: "M10 17l5-5-5-5 M15 12H3 M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6",
  info: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18 M12 11v5 M12 8h.01",
  
calendar:
  "M8 2v4 M16 2v4 M3 10h18 " +
  "M5 4h14a2 2 0 0 1 2 2v14" +
  "a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6" +
  "a2 2 0 0 1 2-2z",

users:
  "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 " +
  "M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8 " +
  "M22 21v-2a4 4 0 0 0-3-3.87 " +
  "M16 3.13a4 4 0 0 1 0 7.75",

};

export default function Icon({ name, size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={iconPaths[name] || iconPaths.dashboard} />
    </svg>
  );
}

