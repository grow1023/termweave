// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/agent/status/AgentWorkingSpinner.tsx; adapted for React 18 and TermWeave.
import React from 'react'
import { cn } from '../cn.ts'

// The `.agent-working-spinner` rule in orca.css rotates the ring in steps; callers provide size.
export function AgentWorkingSpinner({ className }: { className?: string }): React.JSX.Element {
  return (
    <span
      data-agent-spinner=""
      className={cn(
        // Fill the top under reduced motion so the frozen ring looks intentional (#9515).
        'agent-working-spinner block rounded-full border-2 border-agent-working border-t-transparent motion-reduce:border-t-agent-working',
        className
      )}
    />
  )
}
