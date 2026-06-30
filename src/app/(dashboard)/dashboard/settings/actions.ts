'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type SettingsFormState = { error?: string; success?: string }

export type SettingsData = {
  name: string
  segmento: string | null
  logo_url: string | null
  manager_whatsapp: string | null
}

export async function saveSettingsAction(
  _prevState: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('user_profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const companyId = (profile as { company_id: string | null } | null)?.company_id
  if (!companyId) return { error: 'Empresa não encontrada.' }

  const name             = (formData.get('name') as string).trim()
  const segmento         = (formData.get('segmento') as string).trim() || null
  const logoUrl          = (formData.get('logo_url') as string).trim() || null
  const managerWhatsapp  = (formData.get('manager_whatsapp') as string).trim() || null

  if (!name) return { error: 'O nome da empresa é obrigatório.' }

  const { error } = await admin
    .from('companies')
    .update({
      name,
      segmento,
      logo_url:          logoUrl,
      manager_whatsapp:  managerWhatsapp,
    })
    .eq('id', companyId)

  if (error) {
    console.error('[settings] erro ao salvar:', error.message)
    return { error: 'Erro ao salvar configurações. Tente novamente.' }
  }

  return { success: 'Configurações salvas com sucesso!' }
}
