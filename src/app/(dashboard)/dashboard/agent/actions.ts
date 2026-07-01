'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseBusinessContext, reconstructBusinessContext } from './section-utils'

export type AgentFormState = { error?: string; success?: string }
export type SectionFormState = { error?: string; success?: string }

export type AgentConfigData = {
  id: string
  company_id: string
  agent_name: string
  agent_avatar_url: string | null
  business_context: string
  escalation_instructions: string
}

async function getVerifiedCompanyId(requestedCompanyId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('user_profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const row = profile as { company_id: string | null } | null
  return row?.company_id === requestedCompanyId ? requestedCompanyId : null
}

export async function saveAgentConfigAction(
  _prevState: AgentFormState,
  formData: FormData
): Promise<AgentFormState> {
  const companyId               = formData.get('company_id') as string
  const agentName               = (formData.get('agent_name') as string).trim()
  const agentAvatarUrl          = (formData.get('agent_avatar_url') as string).trim() || null
  const businessContext         = (formData.get('business_context') as string).trim()
  const escalationInstructions  = (formData.get('escalation_instructions') as string).trim()

  if (!companyId) return { error: 'Empresa não identificada.' }
  if (!agentName) return { error: 'O nome do agente é obrigatório.' }

  const verified = await getVerifiedCompanyId(companyId)
  if (!verified) return { error: 'Acesso negado.' }

  const admin = createAdminClient()
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

  if (error) return { error: 'Erro ao salvar configurações. Tente novamente.' }

  revalidatePath('/dashboard/agent')
  return { success: 'Configurações salvas com sucesso!' }
}

export async function saveSectionAction(
  _prevState: SectionFormState,
  formData: FormData
): Promise<SectionFormState> {
  const companyId      = formData.get('company_id') as string
  const sectionTitle   = formData.get('section_title') as string
  const sectionContent = (formData.get('section_content') as string).trim()

  if (!companyId) return { error: 'Empresa não identificada.' }

  const verified = await getVerifiedCompanyId(companyId)
  if (!verified) return { error: 'Acesso negado.' }

  const admin = createAdminClient()

  const { data: agentData } = await admin
    .from('agent_configs')
    .select('business_context')
    .eq('company_id', companyId)
    .single()

  const currentContext = (agentData as { business_context: string } | null)?.business_context ?? ''
  const sections = parseBusinessContext(currentContext)

  const idx = sections.findIndex(s => s.title === sectionTitle)
  if (idx === -1) return { error: 'Seção não encontrada. Recarregue a página.' }

  sections[idx] = { title: sectionTitle, content: sectionContent }

  const { error } = await admin
    .from('agent_configs')
    .update({ business_context: reconstructBusinessContext(sections) })
    .eq('company_id', companyId)

  if (error) return { error: 'Erro ao salvar seção. Tente novamente.' }

  revalidatePath('/dashboard/agent')
  return { success: 'Seção salva!' }
}
