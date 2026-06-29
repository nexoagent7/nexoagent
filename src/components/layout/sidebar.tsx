import { cn } from '@/lib/utils'
import { HTMLAttributes } from 'react'

function Sidebar({ className, children }: HTMLAttributes<HTMLElement>) {
  return (
    <aside className={cn('flex h-screen w-64 flex-col border-r border-gray-200 bg-white', className)}>
      {children}
    </aside>
  )
}

function SidebarHeader({ className, children }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex h-16 items-center border-b border-gray-200 px-6', className)}>
      {children}
    </div>
  )
}

function SidebarContent({ className, children }: HTMLAttributes<HTMLDivElement>) {
  return (
    <nav className={cn('flex-1 overflow-y-auto p-4', className)}>
      {children}
    </nav>
  )
}

export { Sidebar, SidebarHeader, SidebarContent }
