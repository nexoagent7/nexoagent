import { Badge } from '@/components/ui/badge'
import { LogoutButton } from '@/components/dashboard/logout-button'

export function MasterHeader() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-foreground">Painel Master</span>
        <Badge variant="success">Master</Badge>
      </div>
      <LogoutButton />
    </header>
  )
}
