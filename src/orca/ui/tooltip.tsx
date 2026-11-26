// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/ui/tooltip.tsx; adapted for React 18 and TermWeave.
import * as React from 'react'
import * as TooltipPrimitive from 'radix-ui/tooltip'

import { cva, type VariantProps } from 'class-variance-authority'
import { OrcaPortalScope } from './portal.tsx'

function TooltipProvider({
  delayDuration = 600,
  skipDelayDuration = 0,
  disableHoverableContent = true,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  // Labels must not stay open through pointer hover and block the controls they describe.
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      disableHoverableContent={disableHoverableContent}
      {...props}
    />
  )
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(function TooltipTrigger({ onFocus, ...props }, ref) {
  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      data-slot="tooltip-trigger"
      onFocus={(event) => {
        onFocus?.(event)
        // Why: focus restored to the trigger after a mouse-closed dialog/menu/panel must not pop the
        // label; preventDefault skips Radix's open-on-focus unless the focus is keyboard focus.
        // TermWeave: `:focus-visible` replaces Orca's keyboard-input-modality tracker.
        if (!(event.target instanceof Element && event.target.matches(':focus-visible'))) {
          event.preventDefault()
        }
      }}
      {...props}
    />
  )
})

const TAB_PREVIEW_CLASSES =
  'w-64 max-w-[calc(100vw-1rem)] border border-border bg-popover p-3 text-popover-foreground shadow-floating motion-safe:animate-in motion-safe:fade-in-0 data-[state=closed]:animate-none'

const tooltipContentVariants = cva('z-[90] rounded-md text-xs', {
  variants: {
    variant: {
      default:
        'pointer-events-none w-fit origin-(--radix-tooltip-content-transform-origin) animate-in bg-foreground px-3 py-1.5 text-balance text-background fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
      'tab-preview': ['pointer-events-none', TAB_PREVIEW_CLASSES],
      // Why: a preview with its own controls takes the pointer; pair it with hoverable content.
      'tab-preview-interactive': TAB_PREVIEW_CLASSES
    }
  },
  defaultVariants: { variant: 'default' }
})

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> &
    VariantProps<typeof tooltipContentVariants> & {
      showArrow?: boolean
      portalContainer?: HTMLElement | null
    }
>(function TooltipContent(
  { className, sideOffset = 0, showArrow = true, portalContainer, variant, children, ...props },
  ref
) {
  return (
    <TooltipPrimitive.Portal container={portalContainer ?? undefined}>
      <TooltipPrimitive.Content
        ref={ref}
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        // Tooltip portals must layer above the menus/popovers that trigger them.
        className={OrcaPortalScope(tooltipContentVariants({ variant }), className)}
        {...props}
      >
        {children}
        {showArrow ? (
          <TooltipPrimitive.Arrow className="size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
        ) : null}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
})

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
