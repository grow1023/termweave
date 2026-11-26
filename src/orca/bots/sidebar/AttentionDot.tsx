// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/AttentionDot.tsx; adapted for TermWeave.
/** The small yellow dot that marks something waiting on the owner; never a tinted row. */
export function AttentionDot(): JSX.Element {
  return <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-status-warning" />;
}
