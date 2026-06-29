'use client'

import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { logoutAction } from '@/app/(auth)/actions'

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost" size="sm">
        <LogOut className="mr-1.5 h-4 w-4" />
        Sair
      </Button>
    </form>
  )
}
