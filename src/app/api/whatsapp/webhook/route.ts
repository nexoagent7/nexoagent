import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEvolutionText } from '@/lib/evolution'

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

type AgentConfigRow = {
  agent_name: string
  business_context: string | null
  escalation_instructions: string | null
}

type CompanyRow = {
  manager_whatsapp: string | null
  plans: { conversations_limit: number | null } | { conversations_limit: number | null }[] | null
}

type MessageRow = {
  role: 'user' | 'assistant'
  content: string
}

// ─── Groq types ───────────────────────────────────────────────────────────────

type GroqChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type GroqApiResponse = {
  choices: Array<{
    message: { role: string; content: string }
    finish_reason: string
  }>
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

function buildSystemPrompt(agent: AgentConfigRow | null): string {
  const styleRules = [
    'PRIORIDADE MÁXIMA: sempre responda diretamente a pergunta que o cliente acabou de fazer. Se ele perguntar o preço, responda o preço. Nunca substitua a resposta direta por uma reapresentação geral do produto ou da lista de livros — isso é uma falha grave.',
    'Exemplo do que NÃO fazer: cliente pergunta "Quanto custa?" e você responde reapresentando os 3 livros sem dizer o preço — isso está ERRADO. Exemplo do que fazer: cliente pergunta "Quanto custa?" e você responde "O Kit completo sai por R$ 55,00." — isso está CERTO.',
    'Responda sempre em português brasileiro, de forma natural e conversacional, como alguém digitando no celular.',
    'Limite cada resposta a no máximo 2 a 4 frases curtas. Isso é WhatsApp, não e-mail.',
    'Nunca use markdown: sem **negrito**, sem #, sem listas com - ou *. Se precisar listar algo, use frase corrida ou números seguidos de ponto.',
    'Releia o histórico da conversa antes de responder. Nunca repita uma resposta já dada literalmente. Se o cliente repetir a mesma pergunta, responda de novo com gentileza e paciência, sem soar irritado, seco ou como se estivesse repreendendo — nunca diga frases como "já falei" ou "como eu disse". Trate como se fosse a primeira vez, só reforçando a informação com calma.',
    'Faça apenas uma pergunta por mensagem.',
    'Use saudação ("Oi") apenas na primeira mensagem da conversa. Nas demais, vá direto ao ponto.',
    'Nunca invente preço, frete, prazo, estoque ou forma de pagamento que não esteja explícito no contexto do negócio. Se não souber, diga com transparência que vai confirmar.',
    'Quando decidir transferir para um humano, inclua exatamente [TRANSFERIR] no início da mensagem — essa tag será removida antes de chegar ao cliente.',
  ]

  if (!agent) {
    return [
      'Você é um assistente de atendimento ao cliente prestativo e cordial.',
      ...styleRules,
    ].join('\n')
  }

  const parts = [
    `Você é ${agent.agent_name}, um assistente de atendimento ao cliente.`,
    ...styleRules,
  ]

  if (agent.business_context?.trim()) {
    parts.push(`\nCONTEXTO DO NEGÓCIO:\n${agent.business_context.trim()}`)
  }

  if (agent.escalation_instructions?.trim()) {
    parts.push(`\nINSTRUÇÕES DE ESCALADA:\n${agent.escalation_instructions.trim()}`)
  }

  return parts.join('\n')
}

type GroqResult = { content: string | null; rateLimited: boolean }

async function callGroq(messages: GroqChatMessage[]): Promise<GroqResult> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.error('[agent] GROQ_API_KEY não configurada')
    return { content: null, rateLimited: false }
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 1024,
      temperature: 0.3,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[agent] Groq error', res.status, err)
    return { content: null, rateLimited: res.status === 429 }
  }

  const json = (await res.json()) as GroqApiResponse
  return { content: json.choices[0]?.message?.content?.trim() ?? null, rateLimited: false }
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
      console.warn('[agent] Groq rate limit (429) — enviando mensagem de fallback ao cliente')
      const phone = remoteJid.replace(/@s\.whatsapp\.net$/, '')
      await sendEvolutionText(instanceName, phone, 'Nosso assistente está com alta demanda agora. Em alguns minutos retornamos, tudo bem? 🙏')
      return
    }

    if (!reply) {
      console.error('[agent] Groq não retornou resposta')
      return
    }

    console.log('[agent] resposta Groq:', reply.slice(0, 120))

    // 9. Detect [TRANSFERIR] tag and clean reply
    const shouldTransfer = reply.includes('[TRANSFERIR]')
    const cleanReply = reply.replace('[TRANSFERIR]', '').trimStart()

    // 9a. Save assistant message (without tag)
    await admin.from('messages').insert({
      conversation_id: conversationId,
      role:            'assistant',
      content:         cleanReply,
    })

    // Update last_message_at + status if transferring
    const conversationUpdate: Record<string, string> = { last_message_at: new Date().toISOString() }
    if (shouldTransfer) {
      conversationUpdate.status = 'escalated'
      console.log('[agent] transferindo para humano — status: escalated')
    }
    await admin
      .from('conversations')
      .update(conversationUpdate)
      .eq('id', conversationId)

    // 10. Send via Evolution API (strip @s.whatsapp.net)
    const phone = remoteJid.replace(/@s\.whatsapp\.net$/, '')
    await sendEvolutionText(instanceName, phone, cleanReply)

    // 11. Notify manager if transferring
    if (shouldTransfer && managerWhatsapp) {
      const managerPhone = managerWhatsapp.replace(/\D/g, '')
      const contactLabel = contactName ?? phone
      const notificationText =
        `⚠️ Atendimento pendente: ${contactLabel} está aguardando resposta humana. ` +
        `Acesse o painel para responder: https://nexoagent-gold.vercel.app/dashboard/kanban`
      await sendEvolutionText(instanceName, managerPhone, notificationText)
      console.log('[agent] notificação enviada ao gestor:', managerPhone)
    }
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
