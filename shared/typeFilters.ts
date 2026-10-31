// The snack-type pills on The Table (Boards) and The Hunt (Explore). Both
// screens use this list, so the order always matches. Lad mode uses short
// names and lumps the less common types together as "Rest".

import { CATEGORIES, getCategory } from "./catalogue";
import type { Voice } from "./voice";

export interface TypeFilter {
  id: string; // "" for all snacks, a category id, or REST
  label: string;
}

export const REST = "rest";

// Most-logged types first. Anything not listed goes in Rest.
const ORDER = ["crisps", "chocolate", "chews", "biscuits", "nuts"];
const REST_TYPES = CATEGORIES.map((c) => c.id).filter((id) => !ORDER.includes(id));
/** Every snack type, in pill order. */
export const TYPE_ORDER = [...ORDER, ...REST_TYPES];

const LAD_LABELS: Record<string, string> = {
  crisps: "Crisps",
  chocolate: "Choc",
  chews: "Chews",
  biscuits: "Biscuits",
  nuts: "Nuts",
};

export function typeFilters(voice: Voice): TypeFilter[] {
  if (voice === "lad") {
    return [
      { id: "", label: "All" },
      ...ORDER.map((id) => ({ id, label: LAD_LABELS[id] })),
      { id: REST, label: "Rest" },
    ];
  }
  return [
    { id: "", label: "All snacks" },
    ...TYPE_ORDER.map((id) => ({ id, label: getCategory(id)!.name })),
  ];
}

/**
 * The snack types a filter covers, or null for all of them. Unknown ids
 * count as all snacks, so an old saved filter never empties a screen.
 */
export function filterTypes(id: string | undefined | null): string[] | null {
  if (id === REST) return REST_TYPES;
  return id && getCategory(id) ? [id] : null;
}

/** A filter that makes sense in this voice ("Rest" only exists in lad mode). */
export function filterFor(voice: Voice, id: string): string {
  return typeFilters(voice).some((f) => f.id === id) ? id : "";
}

/** "crisps", "sweets", or "the rest" for captions. */
export function filterShort(id: string): string | null {
  if (id === REST) return "the rest";
  return getCategory(id)?.short ?? null;
}
