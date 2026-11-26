// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/sidebar/workspace-card/surface/StatusIndicator.tsx; adapted for React 18 and TermWeave.
import React from 'react'
import { Activity, CircleDashed, MessageCircleQuestion } from 'lucide-react'
import { cn } from '../cn.ts'
import { AgentWorkingSpinner } from './AgentWorkingSpinner.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip.tsx'

export type Status =
  | 'active'
  | 'working'
  | 'monitoring'
  | 'permission'
  | 'failed'
  | 'interrupted'
  | 'unconfirmed'
  | 'done'
  | 'inactive'

type TooltipSide = React.ComponentProps<typeof TooltipContent>['side']

type StatusIndicatorProps = Omit<React.ComponentProps<'span'>, 'title'> & {
  status: Status
  showTooltip?: boolean
  tooltipSide?: TooltipSide
}

// Orca's labels come from its i18n; these are the English defaults.
const STATUS_LABELS: Record<Status, string> = {
  active: 'Active',
  working: 'Working',
  monitoring: 'Monitoring background tasks',
  permission: 'Needs permission',
  failed: 'Failed',
  interrupted: 'Interrupted',
  unconfirmed: 'Couldn’t confirm',
  done: 'Done',
  inactive: 'Inactive'
}

const AGENT_STATUS_TOOLTIP_STATUSES = new Set<Status>([
  'working',
  'monitoring',
  'permission',
  'failed',
  'interrupted',
  'unconfirmed',
  'done'
])

const STATE_INDICATOR_TOOLTIP_DELAY_MS = 600

const StatusIndicator = React.memo(function StatusIndicator({
  status,
  className,
  showTooltip = true,
  tooltipSide = 'top',
  ...rest
}: StatusIndicatorProps) {
  const tooltipLabel =
    showTooltip && AGENT_STATUS_TOOLTIP_STATUSES.has(status) ? STATUS_LABELS[status] : null
  let indicator: React.JSX.Element

  if (status === 'working') {
    indicator = (
      <span
        className={cn('inline-flex h-3 w-3 shrink-0 items-center justify-center', className)}
        {...rest}
      >
        <AgentWorkingSpinner className="size-2" />
      </span>
    )
  } else if (status === 'monitoring') {
    indicator = (
      <span
        className={cn('inline-flex h-3 w-3 shrink-0 items-center justify-center', className)}
        {...rest}
      >
        <Activity className="size-3 text-agent-working" aria-hidden="true" />
      </span>
    )
  } else if (status === 'failed') {
    indicator = (
      <span
        className={cn('inline-flex h-3 w-3 shrink-0 items-center justify-center', className)}
        {...rest}
      >
        <span className="block size-1.5 rounded-full bg-red-500" />
      </span>
    )
  } else if (status === 'interrupted') {
    // User-requested Stop is neutral rather than failure or completion.
    indicator = (
      <span
        className={cn('inline-flex h-3 w-3 shrink-0 items-center justify-center', className)}
        {...rest}
      >
        <span className="block size-1.5 rounded-full bg-muted-foreground" />
      </span>
    )
  } else if (status === 'unconfirmed') {
    // Orca's AgentStateDot "unconfirmed" at size md: a dashed amber ring, no nested tooltip.
    indicator = (
      <span
        className={cn('inline-flex h-3 w-3 shrink-0 items-center justify-center', className)}
        {...rest}
      >
        <span
          className="inline-flex h-3 w-3 shrink-0 items-center justify-center"
          aria-label={STATUS_LABELS.unconfirmed}
        >
          <CircleDashed className="size-3 text-amber-500" aria-hidden="true" />
        </span>
      </span>
    )
  } else if (status === 'permission') {
    indicator = (
      <span
        className={cn('inline-flex h-3 w-3 shrink-0 items-center justify-center', className)}
        {...rest}
      >
        <MessageCircleQuestion className="size-3 text-agent-question" aria-hidden="true" />
      </span>
    )
  } else {
    indicator = (
      <span
        className={cn('inline-flex h-3 w-3 shrink-0 items-center justify-center', className)}
        {...rest}
      >
        <span
          className={cn(
            'block size-2 rounded-full',
            status === 'done' || status === 'active'
              ? // Quiet active terminals share the completed-session dot.
                'bg-emerald-500'
              : 'bg-neutral-500/40'
          )}
        />
      </span>
    )
  }

  if (tooltipLabel === null) {
    return indicator
  }
  return (
    <Tooltip delayDuration={STATE_INDICATOR_TOOLTIP_DELAY_MS}>
      <TooltipTrigger asChild>{indicator}</TooltipTrigger>
      <TooltipContent side={tooltipSide} sideOffset={6}>
        {tooltipLabel}
      </TooltipContent>
    </Tooltip>
  )
})

export default StatusIndicator
