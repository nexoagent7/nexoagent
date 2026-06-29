import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

const iconVariants = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger:  'bg-danger/10 text-danger',
} as const

interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
  icon: LucideIcon
  variant?: keyof typeof iconVariants
}

export function KpiCard({ title, value, subtitle, icon: Icon, variant = 'default' }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-6">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground-secondary">{title}</p>
          <p className="font-display text-2xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="text-xs text-foreground-secondary">{subtitle}</p>
          )}
        </div>
        <div className={cn('shrink-0 rounded-xl p-2.5', iconVariants[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}
