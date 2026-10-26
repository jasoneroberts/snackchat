import { useState } from "react";

// Screen settings (tabs, filters) that last while the app is open. Moving to
// another screen and back keeps them; opening the app fresh starts from each
// screen's defaults. They live in memory only, so nothing is saved to the device.
const memory = new Map<string, unknown>();

export function useViewState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (memory.has(key) ? (memory.get(key) as T) : initial));
  const update = (next: T | ((prev: T) => T)) =>
    setValue((prev) => {
      const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      memory.set(key, v);
      return v;
    });
  return [value, update];
}
