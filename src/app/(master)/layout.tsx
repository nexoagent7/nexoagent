import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MasterSidebar } from '@/components/master/sidebar'
import { MasterHeader } from '@/components/master/header'

export default async function MasterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden bg-background-secondary">
      <MasterSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MasterHeader />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
