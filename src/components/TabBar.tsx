import { Link } from "./Link";

const icon = (d: string) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const TABS = [
  { href: "/", label: "Feed", icon: icon("M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z") },
  { href: "/boards", label: "Boards", icon: icon("M4 20V12h4v8M10 20V6h4v14M16 20v-5h4v5") },
  { href: "/checkin", label: "Check in", icon: null },
  {
    href: "/groups",
    label: "Groups",
    icon: icon("M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c1-3.5 3.6-5.5 6.5-5.5s5.5 2 6.5 5.5M17 11.8a2.8 2.8 0 1 0 0-5.6M16 14.6c2.6-.3 4.6 1.4 5.5 4.4"),
  },
  { href: "/me", label: "Profile", icon: icon("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6") },
];

/** The bottom navigation bar, like the prototype's. */
export function TabBar({ active }: { active: string }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={t.href === active ? "tab active" : "tab"} aria-current={t.href === active ? "page" : undefined}>
          {t.icon ?? (
            <span className="tab-plus">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          )}
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
