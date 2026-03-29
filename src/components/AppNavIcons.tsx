/** SVG-иконки для нижней навигации приложения и поднавигаций модулей (как на мокапах v2). */

const svgBase = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export type ShellNavId = "hub" | "finance" | "body" | "todo" | "actions";

export function ShellNavIcon({ id }: { id: ShellNavId }) {
  const s = svgBase;
  switch (id) {
    case "hub":
      return (
        <svg {...s}>
          <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6L12 2z" />
        </svg>
      );
    case "finance":
      return (
        <svg {...s}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M7 10h4M7 14h10" />
          <circle cx="15" cy="10" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "body":
      return (
        <svg {...s}>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      );
    case "todo":
      return (
        <svg {...s}>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v6a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      );
    case "actions":
      return (
        <svg {...s}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    default:
      return null;
  }
}

export type BodySubnavId = "home" | "nutrition" | "training";

export function BodySubnavIcon({ id }: { id: BodySubnavId }) {
  const s = { ...svgBase, width: 20, height: 20 };
  switch (id) {
    case "home":
      return (
        <svg {...s}>
          <path d="M3 9.5 12 3l9 6.5V20a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1V9.5z" />
        </svg>
      );
    case "nutrition":
      return (
        <svg {...s}>
          <path d="M12 3c-2 3-4 4.5-4 8a4 4 0 108 0c0-3.5-2-5-4-8z" />
          <path d="M12 11v2" />
        </svg>
      );
    case "training":
      return (
        <svg {...s}>
          <path d="M6.5 6.5l11 11M17 7l-3 3M10 14l-3 3M6 6l3 3M14 14l4 4" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}

export type TodoSubnavId = "today" | "inbox" | "all";

export function TodoSubnavIcon({ id }: { id: TodoSubnavId }) {
  const s = { ...svgBase, width: 20, height: 20 };
  switch (id) {
    case "today":
      return (
        <svg {...s}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...s}>
          <path d="M22 12h-6l-2 3H10l-2-3H2" />
          <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
        </svg>
      );
    case "all":
      return (
        <svg {...s}>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      );
    default:
      return null;
  }
}
