import { createAdminClient } from '@/lib/supabase/admin'
import { sendEvolutionText } from '@/lib/evolution'

type AdminClient = ReturnType<typeof createAdminClient>

type DeliverAgentReplyParams = {
  admin: AdminClient
  conversationId: string
  instanceName: string
  remoteJid: string
  contactName: string | null
  managerWhatsapp: string | null
  reply: string
}

// Pós-processamento de uma resposta da IA bem-sucedida: detecta [TRANSFERIR],
// salva a mensagem, atualiza a conversa, envia ao cliente via Evolution API e
// notifica o gestor se transferiu. Reaproveitado pelo webhook e pelo cron de retry.
export async function deliverAgentReply({
  admin,
  conversationId,
  instanceName,
  remoteJid,
  contactName,
  managerWhatsapp,
  reply,
}: DeliverAgentReplyParams): Promise<void> {
  const shouldTransfer = reply.includes('[TRANSFERIR]')
  const cleanReply = reply.replace('[TRANSFERIR]', '').trimStart()

  await admin.from('messages').insert({
    conversation_id: conversationId,
    role:            'assistant',
    content:         cleanReply,
  })

  const conversationUpdate: Record<string, string> = { last_message_at: new Date().toISOString() }
  if (shouldTransfer) {
    conversationUpdate.status = 'escalated'
    console.log('[agent] transferindo para humano — status: escalated')
  }
  await admin
    .from('conversations')
    .update(conversationUpdate)
    .eq('id', conversationId)

  const phone = remoteJid.replace(/@s\.whatsapp\.net$/, '')
  await sendEvolutionText(instanceName, phone, cleanReply)

  if (shouldTransfer && managerWhatsapp) {
    const managerPhone = managerWhatsapp.replace(/\D/g, '')
    const contactLabel = contactName ?? phone
    const notificationText =
      `⚠️ Atendimento pendente: ${contactLabel} está aguardando resposta humana. ` +
      `Acesse o painel para responder: https://nexoagent-gold.vercel.app/dashboard/kanban`
    await sendEvolutionText(instanceName, managerPhone, notificationText)
    console.log('[agent] notificação enviada ao gestor:', managerPhone)
  }
}
