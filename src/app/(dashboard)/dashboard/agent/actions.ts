'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type AgentFormState = { error?: string; success?: string }

export type AgentConfigData = {
  id: string
  company_id: string
  name: string
  avatar_url: string | null
  business_context: string
  escalation_instructions: string
  is_active: boolean
}

export async function saveAgentConfigAction(
  _prevState: AgentFormState,
  formData: FormData
): Promise<AgentFormState> {
  const companyId = formData.get('company_id') as string
  const name = (formData.get('name') as string).trim()
  const avatarUrl = (formData.get('avatar_url') as string).trim() || null
  const businessContext = (formData.get('business_context') as string).trim()
  const escalationInstructions = (formData.get('escalation_instructions') as string).trim()

  if (!companyId) return { error: 'Empresa não identificada.' }
  if (!name)      return { error: 'O nome do agente é obrigatório.' }

  // Verifica que o usuário logado pertence à empresa informada
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Sessão expirada. Faça login novamente.' }

  const { data } = await supabase
    .from('user_profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const profile = data as { company_id: string | null } | null

  if (profile?.company_id !== companyId) {
    return { error: 'Acesso negado.' }
  }

  const admin = createAdminClient()

  const { error } = await admin.from('agent_configs').upsert(
    {
      company_id: companyId,
      name,
      avatar_url: avatarUrl,
      business_context: businessContext,
      escalation_instructions: escalationInstructions,
    },
    { onConflict: 'company_id' }
  )

  if (error) {
    return { error: 'Erro ao salvar configurações. Tente novamente.' }
  }

  return { success: 'Configurações salvas com sucesso!' }
}
