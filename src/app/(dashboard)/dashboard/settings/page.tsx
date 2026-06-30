import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SettingsForm } from './settings-form'
import type { SettingsData } from './actions'

type CompanyRow = {
  name: string
  segmento: string | null
  logo_url: string | null
  manager_whatsapp: string | null
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('user_profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const companyId = (profile as { company_id: string | null } | null)?.company_id

  let settingsData: SettingsData | null = null

  if (companyId) {
    const { data: company } = await admin
      .from('companies')
      .select('name, segmento, logo_url, manager_whatsapp')
      .eq('id', companyId)
      .single()

    settingsData = company as CompanyRow | null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-foreground-secondary">
          Gerencie os dados e preferências da sua empresa
        </p>
      </div>

      <SettingsForm initialData={settingsData} />
    </div>
  )
}
