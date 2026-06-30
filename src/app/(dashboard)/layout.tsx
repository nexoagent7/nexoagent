import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'

type UserProfile = {
  full_name: string
  role: string
  company_id: string | null
}

type Company = {
  name: string
  plans: { name: string }[] | { name: string } | null
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Admin client para evitar recursão RLS em user_profiles
  const admin = createAdminClient()

  const { data } = await admin
    .from('user_profiles')
    .select('full_name, role, company_id')
    .eq('id', user.id)
    .single()

  const profile = data as UserProfile | null

  let companyName = 'Minha Empresa'
  let planName = 'Free'

  if (profile?.company_id) {
    const { data: companyData } = await admin
      .from('companies')
      .select('name, plans(name)')
      .eq('id', profile.company_id)
      .single()

    const company = companyData as unknown as Company | null
    if (company) {
      companyName = company.name
      const plans = company.plans
      planName = Array.isArray(plans)
        ? (plans[0]?.name ?? 'Free')
        : (plans?.name ?? 'Free')
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background-secondary">
      <DashboardSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader
          companyName={companyName}
          planName={planName}
          userName={profile?.full_name ?? ''}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
