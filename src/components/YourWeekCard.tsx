import { useEffect, useState } from "react";
import type { YourWeek } from "../../shared/types";
import { api } from "../api";
import { weekLines } from "../lib/yourWeek";
import { isUkMonday } from "./ChampionsCard";
import { useVoice } from "../lib/voice";
import { Link } from "./Link";

/**
 * "Your week": at the top of the feed on Mondays, what happened for you last
 * week (worker/lib/yourWeek.ts). Quiet weeks show nothing, and so does every
 * other day, so the feed stays about check-ins.
 */
export function YourWeekCard() {
  const { voice } = useVoice();
  const [week, setWeek] = useState<YourWeek | null>(null);
  const monday = isUkMonday();

  useEffect(() => {
    if (monday) api<YourWeek>("/week").then(setWeek).catch(() => setWeek(null));
  }, [monday]);

  const lad = voice === "lad";
  const lines = monday && week ? weekLines(week, lad) : [];
  if (!lines.length) return null;
  return (
    <section className="card-plain stack-sm">
      <h2 className="section-title no-margin">{lad ? "Your week, lad" : "Your week"}</h2>
      {lines.map((line) => {
        const row = (
          <>
            <span className="week-icon" aria-hidden="true">
              {line.icon}
            </span>
            <span>{line.text}</span>
          </>
        );
        return line.href ? (
          <Link key={line.icon} href={line.href} className="week-row">
            {row}
          </Link>
        ) : (
          <div key={line.icon} className="week-row">
            {row}
          </div>
        );
      })}
    </section>
  );
}
