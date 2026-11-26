// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/ui/context-menu.tsx; adapted for React 18 and TermWeave.
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronRightIcon, CircleIcon } from 'lucide-react'
import * as ContextMenuPrimitive from 'radix-ui/context-menu'

import { cn } from '../cn.ts'
import { OrcaPortalScope } from './portal.tsx'
import { MENU_SURFACE_CLASS } from './menu-surface.ts'
import {
  MENU_ITEM_INDICATOR_CLASS,
  MENU_LABEL_CLASS,
  MENU_SHORTCUT_CLASS,
  MENU_SUB_TRIGGER_CHEVRON_CLASS,
  MenuDensityProvider,
  menuIndicatorItemVariants,
  menuItemVariants,
  menuSeparatorVariants,
  menuSubTriggerVariants,
  useMenuDensity,
  type MenuDensity
} from './menu-item.ts'

function ContextMenu({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" modal={false} {...props} />
}

const ContextMenuTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Trigger>
>(function ContextMenuTrigger(props, ref) {
  return <ContextMenuPrimitive.Trigger ref={ref} data-slot="context-menu-trigger" {...props} />
})

function ContextMenuSub({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />
}

function ContextMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
  return <ContextMenuPrimitive.RadioGroup data-slot="context-menu-radio-group" {...props} />
}

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean
    density?: MenuDensity
  }
>(function ContextMenuSubTrigger({ className, inset, children, density, ...props }, ref) {
  const rowDensity = useMenuDensity(density)
  return (
    <ContextMenuPrimitive.SubTrigger
      ref={ref}
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(menuSubTriggerVariants({ density: rowDensity, menu: 'context' }), className)}
      {...props}
    >
      {children}
      <ChevronRightIcon className={MENU_SUB_TRIGGER_CHEVRON_CLASS} />
    </ContextMenuPrimitive.SubTrigger>
  )
})

const contentAnimationVariants = cva('', {
  variants: {
    animation: {
      default:
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-150 data-[state=open]:zoom-in-[0.98]',
      none: 'data-[state=closed]:pointer-events-none'
    }
  },
  defaultVariants: { animation: 'default' }
})

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent> &
    VariantProps<typeof contentAnimationVariants> & {
      portalContainer?: HTMLElement | null
      /** Defaults to the parent menu's density. */
      density?: MenuDensity
    }
>(function ContextMenuSubContent(
  { className, animation, alignOffset = -5, density, portalContainer, ...props },
  ref
) {
  const subDensity = useMenuDensity(density)
  return (
    <ContextMenuPrimitive.Portal container={portalContainer ?? undefined}>
      <MenuDensityProvider.Provider value={subDensity}>
        <ContextMenuPrimitive.SubContent
          ref={ref}
          data-slot="context-menu-sub-content"
          // Level the first submenu row with its trigger (border + padding).
          alignOffset={alignOffset}
          className={OrcaPortalScope(
            'z-[70] min-w-[11rem] origin-(--radix-context-menu-content-transform-origin) overflow-hidden',
            MENU_SURFACE_CLASS,
            contentAnimationVariants({ animation }),
            className
          )}
          {...props}
        />
      </MenuDensityProvider.Provider>
    </ContextMenuPrimitive.Portal>
  )
})

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content> &
    VariantProps<typeof contentAnimationVariants> & {
      portalContainer?: HTMLElement | null
      /** Row density for every row in this menu; a row's own `density` overrides it. */
      density?: MenuDensity
    }
>(function ContextMenuContent(
  { className, animation, density = 'default', portalContainer, ...props },
  ref
) {
  return (
    <ContextMenuPrimitive.Portal container={portalContainer ?? undefined}>
      <MenuDensityProvider.Provider value={density}>
        <ContextMenuPrimitive.Content
          ref={ref}
          data-slot="context-menu-content"
          className={OrcaPortalScope(
            'z-[70] max-h-(--radix-context-menu-content-available-height) min-w-[11rem] origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto scrollbar-sleek',
            MENU_SURFACE_CLASS,
            contentAnimationVariants({ animation }),
            className
          )}
          {...props}
        />
      </MenuDensityProvider.Provider>
    </ContextMenuPrimitive.Portal>
  )
})

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean
    variant?: 'default' | 'destructive'
    density?: MenuDensity
  }
>(function ContextMenuItem({ className, inset, variant = 'default', density, ...props }, ref) {
  const rowDensity = useMenuDensity(density)
  return (
    <ContextMenuPrimitive.Item
      ref={ref}
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(menuItemVariants({ density: rowDensity, menu: 'context' }), className)}
      {...props}
    />
  )
})

const ContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem> & {
    density?: MenuDensity
  }
>(function ContextMenuRadioItem({ className, children, density, ...props }, ref) {
  const rowDensity = useMenuDensity(density)
  return (
    <ContextMenuPrimitive.RadioItem
      ref={ref}
      data-slot="context-menu-radio-item"
      className={cn(menuIndicatorItemVariants({ density: rowDensity }), className)}
      {...props}
    >
      <span className={MENU_ITEM_INDICATOR_CLASS}>
        <ContextMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  )
})

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
    inset?: boolean
  }
>(function ContextMenuLabel({ className, inset, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Label
      ref={ref}
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(MENU_LABEL_CLASS, className)}
      {...props}
    />
  )
})

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator> & {
    density?: MenuDensity
  }
>(function ContextMenuSeparator({ className, density, ...props }, ref) {
  const rowDensity = useMenuDensity(density)
  return (
    <ContextMenuPrimitive.Separator
      ref={ref}
      data-slot="context-menu-separator"
      className={cn(menuSeparatorVariants({ density: rowDensity }), className)}
      {...props}
    />
  )
})

function ContextMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(MENU_SHORTCUT_CLASS, className)}
      {...props}
    />
  )
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup
}
