'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type AgentFormState = { error?: string; success?: string }

export type AgentConfigData = {
  id: string
  company_id: string
  agent_name: string
  agent_avatar_url: string | null
  business_context: string
  escalation_instructions: string
}

export async function saveAgentConfigAction(
  _prevState: AgentFormState,
  formData: FormData
): Promise<AgentFormState> {
  const companyId          = formData.get('company_id') as string
  const agentName              = (formData.get('agent_name') as string).trim()
  const agentAvatarUrl         = (formData.get('agent_avatar_url') as string).trim() || null
  const businessContext        = (formData.get('business_context') as string).trim()
  const escalationInstructions = (formData.get('escalation_instructions') as string).trim()

  if (!companyId) return { error: 'Empresa não identificada.' }
  if (!agentName) return { error: 'O nome do agente é obrigatório.' }

  // Verifica que o usuário logado pertence à empresa informada
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

  const profileRow = profile as { company_id: string | null } | null

  if (profileRow?.company_id !== companyId) {
    return { error: 'Acesso negado.' }
  }

  const { error } = await admin.from('agent_configs').upsert(
    {
      company_id:               companyId,
      agent_name:               agentName,
      agent_avatar_url:         agentAvatarUrl,
      business_context:         businessContext,
      escalation_instructions:  escalationInstructions,
    },
    { onConflict: 'company_id' }
  )

  if (error) {
    return { error: 'Erro ao salvar configurações. Tente novamente.' }
  }

  return { success: 'Configurações salvas com sucesso!' }
}
