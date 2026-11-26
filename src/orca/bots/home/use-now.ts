// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/lib/window-activity/use-now.ts; adapted for TermWeave.
import { useEffect, useState } from "react";

/** The clock, read again every `every` ms: "next 9:00" and ages roll over with it. */
export function useNow(every = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(timer);
  }, [every]);
  return now;
}
