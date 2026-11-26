// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/AttentionDot.tsx; adapted for TermWeave.
/** The small dot that marks something waiting on the owner; never a tinted row. It takes the color of the
 *  picture's "needs you" badge and of the Home panel, so one state has one color (BOT-31). */
export function AttentionDot(): JSX.Element {
  return <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-agent-question" />;
}
