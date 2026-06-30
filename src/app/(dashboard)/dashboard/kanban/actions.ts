'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type ActionResult = { error?: string; success?: boolean }

async function getAuthedCompanyId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('user_profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  return (data as { company_id: string | null } | null)?.company_id ?? null
}

export async function closeConversation(conversationId: string): Promise<ActionResult> {
  const companyId = await getAuthedCompanyId()
  if (!companyId) return { error: 'Não autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('conversations')
    .update({ status: 'closed' })
    .eq('id', conversationId)
    .eq('company_id', companyId)

  if (error) return { error: 'Erro ao finalizar conversa' }
  revalidatePath('/dashboard/kanban')
  return { success: true }
}

export async function escalateConversation(conversationId: string): Promise<ActionResult> {
  const companyId = await getAuthedCompanyId()
  if (!companyId) return { error: 'Não autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('conversations')
    .update({ status: 'escalated' })
    .eq('id', conversationId)
    .eq('company_id', companyId)

  if (error) return { error: 'Erro ao assumir conversa' }
  revalidatePath('/dashboard/kanban')
  return { success: true }
}

export async function returnToAI(conversationId: string): Promise<ActionResult> {
  const companyId = await getAuthedCompanyId()
  if (!companyId) return { error: 'Não autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('conversations')
    .update({ status: 'open' })
    .eq('id', conversationId)
    .eq('company_id', companyId)

  if (error) return { error: 'Erro ao devolver conversa para a IA' }
  revalidatePath('/dashboard/kanban')
  return { success: true }
}
