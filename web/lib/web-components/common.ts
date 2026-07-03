import { twJoin } from "tailwind-merge";

/**
 * Shared focus-ring tokens. Keep this file for styles used by *multiple*
 * components — component-specific styles belong next to their component.
 */
export const focusWithinClass = twJoin(
  "focus-within:ring-1 focus-within:outline-none",
  "focus-within:border-primary-400 focus-within:ring-primary-400",
);

export const focusClass = twJoin(
  "focus:ring-1 focus:outline-none",
  "focus:border-primary-400 focus:ring-primary-400",
);
