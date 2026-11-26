// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/ui/dropdown-menu.tsx; adapted for React 18 and TermWeave.
import * as React from 'react'
import { cva } from 'class-variance-authority'
import { CheckIcon, ChevronRightIcon, CircleIcon } from 'lucide-react'
import * as DropdownMenuPrimitive from 'radix-ui/dropdown-menu'
import { useControllableState } from 'radix-ui/internal'

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

const DropdownMenuCloseContext = React.createContext<() => void>(() => {})

function useDropdownMenuClose() {
  return React.useContext(DropdownMenuCloseContext)
}

function DropdownMenu({
  open: controlledOpen,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const [open, setOpen] = useControllableState({
    prop: controlledOpen,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
    caller: 'DropdownMenu'
  })
  const close = React.useCallback(() => setOpen(false), [setOpen])
  return (
    <DropdownMenuCloseContext.Provider value={close}>
      <DropdownMenuPrimitive.Root
        data-slot="dropdown-menu"
        {...props}
        open={open}
        onOpenChange={setOpen}
      />
    </DropdownMenuCloseContext.Provider>
  )
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

const DropdownMenuTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger>
>(function DropdownMenuTrigger(props, ref) {
  return <DropdownMenuPrimitive.Trigger ref={ref} data-slot="dropdown-menu-trigger" {...props} />
})

const dropdownMenuContentVariants = cva('', {
  variants: { variant: { default: '', picker: 'p-0' } },
  defaultVariants: { variant: 'default' }
})

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & {
    portalContainer?: HTMLElement | null
    /** Row density for every row in this menu; a row's own `density` overrides it. */
    density?: MenuDensity
    /** `picker`: flush content whose own rows run edge to edge. */
    variant?: 'default' | 'picker'
  }
>(function DropdownMenuContent(
  { className, sideOffset = 4, portalContainer, density = 'default', variant = 'default', ...props },
  ref
) {
  return (
    <DropdownMenuPrimitive.Portal container={portalContainer ?? undefined}>
      <MenuDensityProvider.Provider value={density}>
        <DropdownMenuPrimitive.Content
          ref={ref}
          data-slot="dropdown-menu-content"
          sideOffset={sideOffset}
          className={OrcaPortalScope(
            'z-[70] max-h-(--radix-dropdown-menu-content-available-height) min-w-[11rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto scrollbar-sleek',
            MENU_SURFACE_CLASS,
            dropdownMenuContentVariants({ variant }),
            'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none data-[state=open]:fade-in-0 data-[state=open]:duration-150 data-[state=open]:zoom-in-[0.98]',
            className
          )}
          {...props}
        />
      </MenuDensityProvider.Provider>
    </DropdownMenuPrimitive.Portal>
  )
})

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
    /** `launch`: rows in the shared agent menu; at least 36px tall in either density.
     *  `sortable`: compact drag-handle rows that lift while `data-dragging` is set. */
    variant?: 'default' | 'destructive' | 'launch' | 'sortable' | 'create'
    density?: MenuDensity
  }
>(function DropdownMenuItem({ className, inset, variant = 'default', density, ...props }, ref) {
  const rowDensity = useMenuDensity(density)
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        menuItemVariants({ density: rowDensity, menu: 'dropdown' }),
        'data-[variant=create]:rounded-[7px] data-[variant=create]:px-2 data-[variant=create]:py-1.5 data-[variant=create]:text-[12px] data-[variant=create]:leading-5 data-[variant=create]:font-medium',
        className
      )}
      {...props}
    />
  )
})

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem> & {
    density?: MenuDensity
  }
>(function DropdownMenuCheckboxItem({ className, children, checked, density, ...props }, ref) {
  const rowDensity = useMenuDensity(density)
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      data-slot="dropdown-menu-checkbox-item"
      className={cn(menuIndicatorItemVariants({ density: rowDensity }), className)}
      checked={checked}
      {...props}
    >
      <span className={MENU_ITEM_INDICATOR_CLASS}>
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-3.5" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
})

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem> & {
    density?: MenuDensity
  }
>(function DropdownMenuRadioItem({ className, children, density, ...props }, ref) {
  const rowDensity = useMenuDensity(density)
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      data-slot="dropdown-menu-radio-item"
      className={cn(menuIndicatorItemVariants({ density: rowDensity }), className)}
      {...props}
    >
      <span className={MENU_ITEM_INDICATOR_CLASS}>
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
})

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean
    variant?: 'title'
  }
>(function DropdownMenuLabel({ className, inset, variant, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        MENU_LABEL_CLASS,
        variant === 'title' && 'pb-0 text-sm text-foreground',
        className
      )}
      {...props}
    />
  )
})

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator> & {
    density?: MenuDensity
  }
>(function DropdownMenuSeparator({ className, density, ...props }, ref) {
  const rowDensity = useMenuDensity(density)
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      data-slot="dropdown-menu-separator"
      className={cn(menuSeparatorVariants({ density: rowDensity }), className)}
      {...props}
    />
  )
})

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(MENU_SHORTCUT_CLASS, className)}
      {...props}
    />
  )
}

function DropdownMenuSub({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean
    density?: MenuDensity
    // Why: collision-flipped submenus open leftward, where a right-pointing chevron misleads.
    hideChevron?: boolean
    variant?: 'default' | 'launch-row' | 'header-chip' | 'icon-row'
  }
>(function DropdownMenuSubTrigger(
  { className, inset, children, hideChevron, variant = 'default', density, ...props },
  ref
) {
  const rowDensity = useMenuDensity(density)
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      data-slot="dropdown-menu-sub-trigger"
      data-variant={variant}
      data-inset={inset}
      className={cn(
        menuSubTriggerVariants({
          density: rowDensity,
          variant,
          menu: 'dropdown'
        }),
        className
      )}
      {...props}
    >
      {hideChevron ? (
        children
      ) : (
        <>
          {children}
          <ChevronRightIcon className={MENU_SUB_TRIGGER_CHEVRON_CLASS} />
        </>
      )}
    </DropdownMenuPrimitive.SubTrigger>
  )
})

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent> & {
    portalContainer?: HTMLElement | null
    /** Defaults to the parent menu's density. */
    density?: MenuDensity
    scrollable?: boolean
    variant?: 'default' | 'picker'
  }
>(function DropdownMenuSubContent(
  {
    className,
    portalContainer,
    alignOffset = -5,
    scrollable = false,
    variant = 'default',
    density,
    ...props
  },
  ref
) {
  const subDensity = useMenuDensity(density)
  return (
    <DropdownMenuPrimitive.Portal container={portalContainer ?? undefined}>
      <MenuDensityProvider.Provider value={subDensity}>
        <DropdownMenuPrimitive.SubContent
          ref={ref}
          data-slot="dropdown-menu-sub-content"
          data-variant={variant}
          // Level the first submenu row with its trigger (border + padding).
          alignOffset={alignOffset}
          className={OrcaPortalScope(
            'z-[70] min-w-[11rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden',
            MENU_SURFACE_CLASS,
            'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none data-[state=open]:fade-in-0 data-[state=open]:duration-150 data-[state=open]:zoom-in-[0.98]',
            dropdownMenuContentVariants({ variant }),
            scrollable &&
              'max-h-(--radix-dropdown-menu-content-available-height) overflow-x-hidden overflow-y-auto scrollbar-sleek',
            className
          )}
          {...props}
        />
      </MenuDensityProvider.Provider>
    </DropdownMenuPrimitive.Portal>
  )
})

export {
  DropdownMenu,
  useDropdownMenuClose,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent
}
