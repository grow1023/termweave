// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/ui/LoadingSpinner.tsx; adapted for React 18 and TermWeave.
import React from 'react'
import { Hourglass, Loader2 } from 'lucide-react'
import { cn } from '../cn.ts'

// Rotate this span, not the svg inside: Chromium can't composite an SVG transform animation, so a spinning svg forces a renderer frame every refresh.
// The `.loading-spinner` rule in orca.css steps the rotation instead of turning smoothly.
export function SpinnerFrame({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <span aria-hidden="true" className={cn('loading-spinner inline-flex shrink-0', className)}>
      {children}
    </span>
  )
}

// Reduced motion uses an hourglass rather than a stuck spinner. Hide it only when motion is allowed; hidden plus motion-reduce:block left it hidden.
export function LoadingSpinner({ className }: { className?: string }): React.JSX.Element {
  // Without a caller size the svg keeps its parent's svg sizing (e.g. Button's [&_svg]) and the span wraps it.
  const sized = className?.split(/\s+/).some((name) => /(^|:)(size|h|w)-/.test(name)) ?? false
  return (
    <>
      <SpinnerFrame className={cn('motion-reduce:hidden', className)}>
        <Loader2 className={sized ? 'block size-full' : 'block'} />
      </SpinnerFrame>
      <Hourglass aria-hidden="true" className={cn('motion-safe:hidden', className)} />
    </>
  )
}
