import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEvolutionText } from '@/lib/evolution'
import { buildSystemPrompt, callGroq } from '@/lib/groq'
import type { AgentConfigRow, GroqChatMessage } from '@/lib/groq'
import { deliverAgentReply } from '@/lib/agent-reply'

// ─── Evolution API v2 — messages.upsert payload ───────────────────────────────

type MessageKey = {
  remoteJid: string
  fromMe: boolean
  id: string
  participant?: string
}

type MessageContent = {
  conversation?: string
  extendedTextMessage?: { text: string }
  imageMessage?: { caption?: string; mimetype: string }
  audioMessage?: { mimetype: string; seconds: number }
  videoMessage?: { caption?: string; mimetype: string }
  documentMessage?: { title?: string; mimetype: string }
  stickerMessage?: { isAnimated: boolean }
  reactionMessage?: { text: string; key: MessageKey }
  listMessage?: { description?: string }
  buttonsMessage?: { contentText?: string }
}

type EvolutionMessage = {
  key: MessageKey
  pushName?: string
  message?: MessageContent
  messageType: string
  messageTimestamp: number
  instanceId: string
  source?: string
  status?: string
}

type EvolutionWebhookPayload = {
  event: string
  instance: string
  data: EvolutionMessage | EvolutionMessage[]
  destination?: string
  date_time?: string
  sender?: string
  server_url?: string
  apikey?: string
}

// ─── DB row types ─────────────────────────────────────────────────────────────

type WhatsAppInstanceRow = {
  company_id: string
}

type CompanyRow = {
  manager_whatsapp: string | null
  plans: { conversations_limit: number | null } | { conversations_limit: number | null }[] | null
}

type MessageRow = {
  role: 'user' | 'assistant'
  content: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractText(message?: MessageContent): string | null {
  if (!message) return null
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.title ??
    message.reactionMessage?.text ??
    message.listMessage?.description ??
    message.buttonsMessage?.contentText ??
    null
  )
}

function toArray(data: EvolutionMessage | EvolutionMessage[]): EvolutionMessage[] {
  return Array.isArray(data) ? data : [data]
}

type MediaType = 'image' | 'audio' | null

function detectMediaType(message?: MessageContent): MediaType {
  if (!message) return null
  if (message.imageMessage) return 'image'
  if (message.audioMessage) return 'audio'
  return null
}

// ─── Async message processor (fire-and-forget) ────────────────────────────────

async function handleMessage(
  instanceName: string,
  remoteJid: string,
  contactName: string | null,
  text: string,
  messageId: string,
  mediaType: MediaType
): Promise<void> {
  try {
    const admin = createAdminClient()

    // 1. Find company via whatsapp_instances
    const { data: instanceData, error: instanceErr } = await admin
      .from('whatsapp_instances')
      .select('company_id')
      .eq('instance_name', instanceName)
      .single()

    if (instanceErr || !instanceData) {
      console.error('[agent] instância não encontrada:', instanceName, instanceErr?.message)
      return
    }

    const { company_id } = instanceData as WhatsAppInstanceRow

    // 2. Fetch agent_configs and company manager_whatsapp in parallel
    const [{ data: agentData }, { data: companyData }] = await Promise.all([
      admin
        .from('agent_configs')
        .select('agent_name, business_context, escalation_instructions')
        .eq('company_id', company_id)
        .single(),
      admin
        .from('companies')
        .select('manager_whatsapp, plans(conversations_limit)')
        .eq('id', company_id)
        .single(),
    ])

    const agent = agentData as AgentConfigRow | null
    const company = companyData as CompanyRow | null
    const managerWhatsapp = company?.manager_whatsapp ?? null
    const rawPlans = company?.plans
    const conversationsLimit: number | null = rawPlans
      ? (Array.isArray(rawPlans) ? rawPlans[0]?.conversations_limit : rawPlans.conversations_limit) ?? null
      : null

    // 3. Reutiliza a conversa mais recente deste remote_jid, exceto se ela estiver
    //    'closed' — nesse caso, uma nova mensagem inicia um NOVO atendimento em vez
    //    de reabrir o antigo (uma conversa encerrada não deve bloquear a próxima).
    const now = new Date().toISOString()

    const { data: recentConvData } = await admin
      .from('conversations')
      .select('id, status')
      .eq('company_id', company_id)
      .eq('remote_jid', remoteJid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const recentConv = recentConvData as { id: string; status: string } | null

    let conversationId: string
    let convStatus: string

    if (recentConv && recentConv.status !== 'closed') {
      // Conversa ativa (open/escalated) — reaproveita, preservando o status
      const { data: updated, error: updateErr } = await admin
        .from('conversations')
        .update({ contact_name: contactName, last_message_at: now })
        .eq('id', recentConv.id)
        .select('id, status')
        .single()

      if (updateErr || !updated) {
        console.error('[agent] erro ao atualizar conversation:', updateErr?.message)
        return
      }

      const u = updated as { id: string; status: string }
      conversationId = u.id
      convStatus = u.status
    } else {
      // Nenhuma conversa ainda, ou a última está 'closed' — inicia um novo atendimento
      const { data: created, error: insertErr } = await admin
        .from('conversations')
        .insert({
          company_id,
          remote_jid:      remoteJid,
          contact_name:    contactName,
          status:          'open',
          last_message_at: now,
        })
        .select('id, status')
        .single()

      if (insertErr || !created) {
        console.error('[agent] erro ao criar conversation:', insertErr?.message)
        return
      }

      const c = created as { id: string; status: string }
      conversationId = c.id
      convStatus = c.status
    }

    // 4. Deduplicate: ignora se já processamos este messageId
    const { data: existing } = await admin
      .from('messages')
      .select('id')
      .eq('whatsapp_message_id', messageId)
      .maybeSingle()

    if (existing) {
      console.log('[agent] duplicata ignorada:', messageId)
      return
    }

    // 5. Save user message with whatsapp_message_id
    const { error: msgErr } = await admin.from('messages').insert({
      conversation_id:      conversationId,
      role:                 'user',
      content:              text,
      whatsapp_message_id:  messageId,
    })

    if (msgErr) {
      console.error('[agent] erro ao salvar mensagem do usuário:', msgErr.message)
      return
    }

    // 5a. Cliente enviou imagem ou áudio — provável comprovante. O Groq não enxerga
    //     mídia, então marcamos 'pending' automaticamente (alguém precisa conferir
    //     manualmente) em vez de tentar responder com a IA.
    if (mediaType) {
      await admin
        .from('conversations')
        .update({ status: 'pending', last_message_at: new Date().toISOString() })
        .eq('id', conversationId)

      console.log('[agent] mídia recebida (', mediaType, ') — conversa marcada como pending')

      const phone = remoteJid.replace(/@s\.whatsapp\.net$/, '')
      await sendEvolutionText(instanceName, phone, 'Recebemos! Vamos confirmar e te avisamos em breve. 🙏')
      return
    }

    // 5b. Conversa escalada ou aguardando ação: mensagem do cliente já foi salva
    //     acima, mas a IA fica bloqueada de responder até o gestor mudar o status.
    if (convStatus === 'escalated' || convStatus === 'pending') {
      console.log('[agent] conversa', convStatus, '— IA bloqueada, sem resposta automática')
      return
    }

    // 6. Fetch last 20 messages for history (mais recentes primeiro, depois reordena
    //    para cronológica — .order(asc).limit() pegaria as mais ANTIGAS, não as últimas)
    const { data: historyData } = await admin
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(20)

    const history = ((historyData ?? []) as MessageRow[]).reverse()

    // 7. Check plan conversation limit before calling Groq
    if (conversationsLimit !== null) {
      const startOfMonth = new Date()
      startOfMonth.setUTCDate(1)
      startOfMonth.setUTCHours(0, 0, 0, 0)

      const { count: convCount } = await admin
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', company_id)
        .gte('created_at', startOfMonth.toISOString())

      if ((convCount ?? 0) >= conversationsLimit) {
        console.warn('[agent] limite de conversas atingido:', convCount, '/', conversationsLimit)
        const phone = remoteJid.replace(/@s\.whatsapp\.net$/, '')
        await sendEvolutionText(
          instanceName,
          phone,
          'Nosso atendimento está temporariamente indisponível. Entre em contato diretamente com a empresa.'
        )
        return
      }
    }

    // 8. Build system prompt
    const systemPrompt = buildSystemPrompt(agent)

    // 9. Call Groq
    const groqMessages: GroqChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ]

    console.log('[agent] system prompt:\n', systemPrompt)
    console.log('[agent] system prompt chars:', systemPrompt.length)
    console.log('[agent] chamando Groq com', groqMessages.length, 'mensagens')
    const { content: reply, rateLimited } = await callGroq(groqMessages)

    if (rateLimited) {
      console.warn('[agent] Groq rate limit (429) — enfileirando retry e enviando fallback')
      const phone = remoteJid.replace(/@s\.whatsapp\.net$/, '')
      await sendEvolutionText(instanceName, phone, 'Nosso assistente está com alta demanda agora. Em alguns minutos retornamos, tudo bem? 🙏')
      await admin.from('retry_queue').insert({
        conversation_id: conversationId,
        company_id,
        retry_after:     new Date(Date.now() + 60_000).toISOString(),
      })
      return
    }

    if (!reply) {
      console.error('[agent] Groq não retornou resposta')
      return
    }

    console.log('[agent] resposta Groq:', reply.slice(0, 120))

    await deliverAgentReply({
      admin,
      conversationId,
      instanceName,
      remoteJid,
      contactName,
      managerWhatsapp,
      reply,
    })
  } catch (err) {
    console.error('[agent] erro não tratado:', err)
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const payload = body as EvolutionWebhookPayload

  console.log('[webhook] event:', payload.event, '| instance:', payload.instance)

  if (payload.event !== 'messages.upsert') {
    return NextResponse.json({ ok: true })
  }

  const msgs = toArray(payload.data)

  for (const msg of msgs) {
    // Ignora mensagens próprias e mensagens de grupo
    if (msg.key.fromMe) continue
    if (!msg.key.remoteJid.endsWith('@s.whatsapp.net')) continue

    const text = extractText(msg.message)
    const mediaType = detectMediaType(msg.message)
    if (!text && !mediaType) continue

    const mediaLabel = mediaType === 'image' ? '[Imagem recebida]' : mediaType === 'audio' ? '[Áudio recebido]' : null
    const contentToSave = text ?? mediaLabel ?? ''

    console.log('[webhook] remoteJid:', msg.key.remoteJid)
    console.log('[webhook] pushName:', msg.pushName ?? '—')
    console.log('[webhook] messageType:', msg.messageType)
    console.log('[webhook] text:', contentToSave)
    console.log('[webhook] timestamp:', new Date(msg.messageTimestamp * 1000).toISOString())
    console.log('─────────────────────────────────')

    // waitUntil mantém a função viva na Vercel até a Promise resolver
    waitUntil(handleMessage(
      payload.instance,
      msg.key.remoteJid,
      msg.pushName ?? null,
      contentToSave,
      msg.key.id,
      mediaType
    ))
  }

  return NextResponse.json({ ok: true })
}
