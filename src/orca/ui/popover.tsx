// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/ui/popover.tsx; adapted for React 18 and TermWeave.
import * as React from 'react'
import * as PopoverPrimitive from 'radix-ui/popover'
import { cva } from 'class-variance-authority'

import { cn } from '../cn.ts'
import { OrcaPortalScope } from './portal.tsx'
import { MENU_SURFACE_CLASS } from './menu-surface.ts'

// React delegates wheel passively, so native defaultPrevented may not reflect synthetic cancellation.
const consumerPreventedWheelEvents = new WeakSet<WheelEvent>()

type PopoverTone = 'default' | 'inverted' | 'menu'

const popoverToneVariants = cva('', {
  variants: {
    tone: {
      default:
        'overflow-hidden rounded-md border border-black/14 bg-floating-surface text-popover-foreground shadow-[0_16px_36px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl dark:border-white/14 dark:shadow-[0_20px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.04)]',
      // The callout arrow sits outside the box.
      inverted:
        'overflow-visible rounded-lg bg-foreground p-2.5 text-xs text-background shadow-floating',
      menu: cn('overflow-hidden backdrop-blur-2xl', MENU_SURFACE_CLASS)
    }
  }
})

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

const PopoverTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>
>(function PopoverTrigger(props, ref) {
  return <PopoverPrimitive.Trigger ref={ref} data-slot="popover-trigger" {...props} />
})

const PopoverAnchor = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Anchor>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Anchor>
>(function PopoverAnchor(props, ref) {
  return <PopoverPrimitive.Anchor ref={ref} data-slot="popover-anchor" {...props} />
})

// From Orca's lib/wheel-scroll-delta.ts.
function getWheelScrollDeltaY(
  event: Pick<WheelEvent, 'deltaMode' | 'deltaY'>,
  pageHeight: number
): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * 16
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * pageHeight
  }
  return event.deltaY
}

/** Find the nearest scrollable element from the wheel target through popover content, inclusive. */
function resolvePopoverScroller(
  target: EventTarget | null,
  content: HTMLElement
): HTMLElement | null {
  let node = target instanceof Node ? target : null
  while (node && node !== content.parentNode) {
    if (node instanceof HTMLElement && node.scrollHeight > node.clientHeight) {
      const overflowY = getComputedStyle(node).overflowY
      if (overflowY === 'auto' || overflowY === 'scroll') {
        return node
      }
    }
    node = node.parentNode
  }
  return null
}

function handlePopoverWheel(event: WheelEvent, content: HTMLDivElement): void {
  if (
    event.defaultPrevented ||
    consumerPreventedWheelEvents.has(event) ||
    !(event.target instanceof Node) ||
    !content.contains(event.target)
  ) {
    return
  }

  // Keep shim opt-in separate from popover-scroll-content, which also imposes overflow and max-height.
  if (
    !content.classList.contains('popover-scroll-content') &&
    !content.classList.contains('popover-wheel-scroll')
  ) {
    return
  }

  const el = resolvePopoverScroller(event.target, content)
  if (!el) {
    return
  }

  const delta = getWheelScrollDeltaY(event, el.clientHeight)
  const maxScrollTop = el.scrollHeight - el.clientHeight
  const nextScrollTop = Math.max(0, Math.min(maxScrollTop, el.scrollTop + delta))

  // Why: Radix dialog scroll-lock swallows native wheel scrolling in portaled popovers.
  if (nextScrollTop !== el.scrollTop) {
    event.preventDefault()
    el.scrollTop = nextScrollTop
  }
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    portalContainer?: HTMLElement | null
    wheelScroll?: boolean
    /** `inverted` styles callouts. `menu` matches dropdown menus for search pickers. */
    tone?: PopoverTone
  }
>(function PopoverContent(
  {
    className,
    align = 'center',
    sideOffset = 4,
    wheelScroll = false,
    portalContainer,
    onWheel,
    onWheelCapture,
    tone = 'default',
    ...props
  },
  forwardedRef
) {
  const handleConsumerWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>): void => {
      onWheel?.(event)
      if (event.defaultPrevented) {
        consumerPreventedWheelEvents.add(event.nativeEvent)
      }
    },
    [onWheel]
  )
  const handleConsumerWheelCapture = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>): void => {
      onWheelCapture?.(event)
      if (event.defaultPrevented) {
        consumerPreventedWheelEvents.add(event.nativeEvent)
      }
    },
    [onWheelCapture]
  )

  // React 18 has no ref cleanup, so the node goes into state and an effect owns the listener.
  const [node, setNode] = React.useState<HTMLDivElement | null>(null)
  const setContentRef = React.useCallback(
    (next: HTMLDivElement | null) => {
      setNode(next)
      if (typeof forwardedRef === 'function') {
        forwardedRef(next)
      } else if (forwardedRef) {
        forwardedRef.current = next
      }
    },
    [forwardedRef]
  )
  React.useEffect(() => {
    if (!node) {
      return undefined
    }
    // React delegates portal events here first, preserving onWheel-before-shim ordering.
    const wheelTarget = portalContainer ?? node.ownerDocument.body
    const handleWheel = (event: WheelEvent): void => handlePopoverWheel(event, node)
    wheelTarget.addEventListener('wheel', handleWheel, { passive: false })
    return () => wheelTarget.removeEventListener('wheel', handleWheel)
  }, [node, portalContainer])

  return (
    <PopoverPrimitive.Portal container={portalContainer ?? undefined}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        // Match dropdown surface/border/shadow tokens so popovers remain distinct from the dark canvas.
        className={OrcaPortalScope(
          'z-[60] outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          popoverToneVariants({ tone }),
          wheelScroll && 'popover-wheel-scroll',
          className
        )}
        onWheel={handleConsumerWheel}
        onWheelCapture={handleConsumerWheelCapture}
        {...props}
        ref={setContentRef}
      />
    </PopoverPrimitive.Portal>
  )
})

const PopoverArrow = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Arrow>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Arrow> & { tone?: PopoverTone }
>(function PopoverArrow({ className, style, tone = 'default', ...props }, ref) {
  return (
    <PopoverPrimitive.Arrow
      ref={ref}
      data-slot="popover-arrow"
      className={cn(
        tone === 'inverted' ? 'fill-foreground' : 'fill-popover',
        '!visible block overflow-visible',
        className
      )}
      style={{ visibility: 'visible', ...style }}
      {...props}
    />
  )
})

export { Popover, PopoverAnchor, PopoverArrow, PopoverContent, PopoverTrigger }
