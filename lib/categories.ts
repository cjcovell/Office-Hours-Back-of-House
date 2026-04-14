/**
 * Canonical gear categories. The schema stores `category` as free text so
 * admins can introduce new ones without a migration, but the UI uses this
 * list as the default set of filter chips and the "create gear" dropdown.
 */
export const GEAR_CATEGORIES = [
  "camera",
  "lens",
  "microphone",
  "audio interface",
  "headphones",
  "light",
  "switcher",
  "multiviewer",
  "computer",
  "monitor",
  "intercom",
  "router",
  "rack gear",
  "accessory",
] as const;

export type GearCategory = (typeof GEAR_CATEGORIES)[number];

export function formatCategory(category: string): string {
  return category
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
