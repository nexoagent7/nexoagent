'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Bot, MessageSquare, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Início',        href: '/dashboard',          icon: LayoutDashboard },
  { label: 'Meu Agente',    href: '/dashboard/agent',    icon: Bot },
  { label: 'Atendimentos',  href: '/dashboard/kanban',   icon: MessageSquare },
  { label: 'Configurações', href: '/dashboard/settings', icon: Settings },
]

export function DashboardSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Bot className="h-4 w-4 text-primary-foreground" strokeWidth={2} />
        </div>
        <span className="font-display text-lg font-bold text-foreground">NexoAgent</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-4">
        {navItems.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground-secondary hover:bg-background hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border p-4">
        <p className="text-center text-xs text-foreground-secondary">NexoAgent v1.0</p>
      </div>
    </aside>
  )
}
