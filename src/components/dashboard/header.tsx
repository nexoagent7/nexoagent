import { Badge } from '@/components/ui/badge'
import { LogoutButton } from '@/components/dashboard/logout-button'

interface DashboardHeaderProps {
  companyName: string
  planName: string
  userName: string
}

export function DashboardHeader({ companyName, planName, userName }: DashboardHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-foreground">{companyName}</span>
        <Badge variant="success">{planName}</Badge>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-foreground-secondary">{userName}</span>
        <LogoutButton />
      </div>
    </header>
  )
}
