// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/lib/class-names.ts.
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Unregistered, tailwind-merge reads the theme's extra text steps as colors and drops them.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["2xs", "3xs", "chat-code"] } } });

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
