import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminClient } from '@/lib/supabase/admin'

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
  manager_whatsapp: string | null
}

type ConversationRow = {
  id: string
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

async function callGroq(messages: GroqChatMessage[]): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.error('[agent] GROQ_API_KEY não configurada')
    return null
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
    return null
  }

  const json = (await res.json()) as GroqApiResponse
  return json.choices[0]?.message?.content?.trim() ?? null
}

async function sendEvolutionText(
  instanceName: string,
  phone: string,
  text: string
): Promise<void> {
  const baseUrl = process.env.EVOLUTION_API_URL
  const apiKey  = process.env.EVOLUTION_API_KEY

  if (!baseUrl || !apiKey) {
    console.error('[agent] Evolution API não configurada')
    return
  }

  const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({ number: phone, text }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[agent] Evolution sendText error', res.status, err)
  } else {
    console.log('[agent] mensagem enviada para', phone)
  }
}

// ─── Async message processor (fire-and-forget) ────────────────────────────────

async function handleMessage(
  instanceName: string,
  remoteJid: string,
  contactName: string | null,
  text: string,
  messageId: string
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

    // 2. Fetch agent_configs
    const { data: agentData } = await admin
      .from('agent_configs')
      .select('agent_name, business_context, escalation_instructions, manager_whatsapp')
      .eq('company_id', company_id)
      .single()

    const agent = agentData as AgentConfigRow | null

    // 3. Upsert conversation (unique on company_id + remote_jid)
    const now = new Date().toISOString()
    const { data: convData, error: convErr } = await admin
      .from('conversations')
      .upsert(
        {
          company_id,
          remote_jid:      remoteJid,
          contact_name:    contactName,
          status:          'open',
          last_message_at: now,
        },
        { onConflict: 'company_id,remote_jid' }
      )
      .select('id')
      .single()

    if (convErr || !convData) {
      console.error('[agent] erro ao upsert conversation:', convErr?.message)
      return
    }

    const { id: conversationId } = convData as ConversationRow

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

    // 6. Fetch last 20 messages for history
    const { data: historyData } = await admin
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(10)

    const history = (historyData ?? []) as MessageRow[]

    // 7. Build system prompt
    const systemPrompt = buildSystemPrompt(agent)

    // 8. Call Groq
    const groqMessages: GroqChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ]

    console.log('[agent] system prompt:\n', systemPrompt)
    console.log('[agent] system prompt chars:', systemPrompt.length)
    console.log('[agent] chamando Groq com', groqMessages.length, 'mensagens')
    const reply = await callGroq(groqMessages)

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
      conversationUpdate.status = 'waiting_human'
      console.log('[agent] transferindo para humano — status: waiting_human')
    }
    await admin
      .from('conversations')
      .update(conversationUpdate)
      .eq('id', conversationId)

    // 10. Send via Evolution API (strip @s.whatsapp.net)
    const phone = remoteJid.replace(/@s\.whatsapp\.net$/, '')
    await sendEvolutionText(instanceName, phone, cleanReply)

    // 11. Notify manager if transferring
    if (shouldTransfer && agent?.manager_whatsapp) {
      const managerPhone = agent.manager_whatsapp.replace(/\D/g, '')
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
    if (!text) continue

    console.log('[webhook] remoteJid:', msg.key.remoteJid)
    console.log('[webhook] pushName:', msg.pushName ?? '—')
    console.log('[webhook] messageType:', msg.messageType)
    console.log('[webhook] text:', text)
    console.log('[webhook] timestamp:', new Date(msg.messageTimestamp * 1000).toISOString())
    console.log('─────────────────────────────────')

    // waitUntil mantém a função viva na Vercel até a Promise resolver
    waitUntil(handleMessage(
      payload.instance,
      msg.key.remoteJid,
      msg.pushName ?? null,
      text,
      msg.key.id
    ))
  }

  return NextResponse.json({ ok: true })
}
