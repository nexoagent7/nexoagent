'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEvolutionText } from '@/lib/evolution'

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

export async function markPending(conversationId: string): Promise<ActionResult> {
  const companyId = await getAuthedCompanyId()
  if (!companyId) return { error: 'Não autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('conversations')
    .update({ status: 'pending' })
    .eq('id', conversationId)
    .eq('company_id', companyId)

  if (error) return { error: 'Erro ao marcar como aguardando ação' }
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

export async function sendManagerMessage(conversationId: string, text: string): Promise<ActionResult> {
  const companyId = await getAuthedCompanyId()
  if (!companyId) return { error: 'Não autenticado' }

  const trimmed = text.trim()
  if (!trimmed) return { error: 'Mensagem vazia' }

  const admin = createAdminClient()

  const { data: convData, error: convErr } = await admin
    .from('conversations')
    .select('remote_jid')
    .eq('id', conversationId)
    .eq('company_id', companyId)
    .single()

  if (convErr || !convData) return { error: 'Conversa não encontrada' }

  const { remote_jid: remoteJid } = convData as { remote_jid: string }

  const { data: instanceData, error: instanceErr } = await admin
    .from('whatsapp_instances')
    .select('instance_name')
    .eq('company_id', companyId)
    .single()

  if (instanceErr || !instanceData) return { error: 'Instância do WhatsApp não encontrada' }

  const { instance_name: instanceName } = instanceData as { instance_name: string }

  const phone = remoteJid.replace(/@s\.whatsapp\.net$/, '')
  await sendEvolutionText(instanceName, phone, trimmed)

  const { error: msgErr } = await admin.from('messages').insert({
    conversation_id: conversationId,
    role:            'assistant',
    content:         trimmed,
  })

  if (msgErr) return { error: 'Erro ao salvar mensagem' }

  await admin
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  revalidatePath('/dashboard/kanban')
  return { success: true }
}
