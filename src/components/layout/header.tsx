import { cn } from '@/lib/utils'
import { HTMLAttributes } from 'react'

function Header({ className, children }: HTMLAttributes<HTMLElement>) {
  return (
    <header className={cn('flex h-16 items-center border-b border-gray-200 bg-white px-6', className)}>
      {children}
    </header>
  )
}

export { Header }
