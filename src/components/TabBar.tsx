import type { ReactNode } from "react";
import type { LineKey } from "../../shared/voice";
import { useVoice } from "../lib/voice";
import { Link } from "./Link";

const icon = (d: string) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const TABS: { href: string; label: LineKey; icon: ReactNode }[] = [
  { href: "/", label: "tab.feed", icon: icon("M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z") },
  { href: "/boards", label: "tab.boards", icon: icon("M4 20V12h4v8M10 20V6h4v14M16 20v-5h4v5") },
  { href: "/checkin", label: "tab.checkin", icon: null },
  {
    href: "/explore",
    label: "tab.explore",
    icon: icon("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z"),
  },
  {
    href: "/groups",
    label: "tab.groups",
    icon: icon("M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c1-3.5 3.6-5.5 6.5-5.5s5.5 2 6.5 5.5M17 11.8a2.8 2.8 0 1 0 0-5.6M16 14.6c2.6-.3 4.6 1.4 5.5 4.4"),
  },
  { href: "/me", label: "tab.profile", icon: icon("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6") },
];

/** The bottom navigation bar, like the prototype's. */
export function TabBar({ active, meBadge = 0 }: { active: string; meBadge?: number }) {
  const { t } = useVoice();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={tab.href === active ? "tab active" : "tab"} aria-current={tab.href === active ? "page" : undefined}>
          {tab.icon ? (
            <span className="tab-icon">
              {tab.icon}
              {tab.href === "/me" && meBadge > 0 && <span className="tab-badge">{meBadge > 99 ? "99+" : meBadge}</span>}
            </span>
          ) : (
            <span className="tab-plus">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          )}
          <span>{t(tab.label)}</span>
        </Link>
      ))}
    </nav>
  );
}
