'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Bot, MessageSquare, Settings, Smartphone, CreditCard, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIDEBAR_COLLAPSED_KEY = 'nexoagent_sidebar_collapsed'

const navItems = [
  { label: 'Início',        href: '/dashboard',          icon: LayoutDashboard },
  { label: 'Meu Agente',    href: '/dashboard/agent',    icon: Bot },
  { label: 'WhatsApp',      href: '/dashboard/whatsapp', icon: Smartphone },
  { label: 'Planos',        href: '/dashboard/planos',   icon: CreditCard },
  { label: 'Atendimentos',  href: '/dashboard/kanban',   icon: MessageSquare },
  { label: 'Configurações', href: '/dashboard/settings', icon: Settings },
]

export function DashboardSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true') {
      setCollapsed(true)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
  }, [collapsed])

  return (
    <aside
      style={{ width: collapsed ? 72 : 256, transition: 'width 200ms ease' }}
      className="flex shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar"
    >
      {/* Logo + toggle */}
      <div
        className={cn(
          'flex h-16 items-center border-b border-border',
          collapsed ? 'justify-center px-2' : 'justify-between px-6'
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Bot className="h-4 w-4 text-primary-foreground" strokeWidth={2} />
          </div>
          {!collapsed && (
            <span className="truncate font-display text-lg font-bold text-foreground">NexoAgent</span>
          )}
        </div>
        {!collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="shrink-0 rounded-lg p-1.5 text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
            aria-label="Recolher menu"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="mx-auto mt-2 rounded-lg p-1.5 text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
          aria-label="Expandir menu"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-4">
        {navItems.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground-secondary hover:bg-background hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border p-4">
        {!collapsed && (
          <p className="text-center text-xs text-foreground-secondary">NexoAgent v1.0</p>
        )}
      </div>
    </aside>
  )
}
