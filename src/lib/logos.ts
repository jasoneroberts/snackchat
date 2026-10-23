import { useEffect, useState } from "react";
import { brandKey } from "../../shared/brands";
import { api } from "../api";

// Which brands have a maker logo, loaded once and shared by every SnackTile.
// After an admin uploads one, refreshLogos() makes it show straight away.

type LogoMap = Record<string, string>; // brand key -> logo id
let logos: LogoMap = {};
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function fetchLogos(): Promise<void> {
  loading = api<{ logos: LogoMap }>("/logos")
    .then((data) => {
      logos = data.logos;
      listeners.forEach((fn) => fn());
    })
    .catch(() => {
      loading = null; // try again next time a tile appears
    });
  return loading;
}

export const refreshLogos = () => fetchLogos();

/** The logo id for a brand, or null. Re-renders when the logos arrive or change. */
export function useLogo(brand: string | null | undefined): string | null {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const update = () => setVersion((v) => v + 1);
    listeners.add(update);
    if (!loading) void fetchLogos();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return brand ? logos[brandKey(brand)] ?? null : null;
}
