import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEvolutionText } from '@/lib/evolution'
import { buildSystemPrompt, callGroq } from '@/lib/groq'
import type { AgentConfigRow, GroqChatMessage } from '@/lib/groq'
import { deliverAgentReply } from '@/lib/agent-reply'

const BATCH_SIZE = 20

type RetryQueueRow = {
  id: string
  conversation_id: string
  company_id: string
  attempts: number
  max_attempts: number
}

type ConversationRow = {
  status: string
  remote_jid: string
  contact_name: string | null
}

type WhatsAppInstanceRow = {
  instance_name: string
}

type CompanyRow = {
  manager_whatsapp: string | null
}

type MessageRow = {
  role: 'user' | 'assistant'
  content: string
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: dueRows, error: fetchErr } = await admin
    .from('retry_queue')
    .select('id, conversation_id, company_id, attempts, max_attempts')
    .lte('retry_after', new Date().toISOString())
    .order('retry_after', { ascending: true })
    .limit(BATCH_SIZE)

  if (fetchErr) {
    console.error('[cron/retry-groq] erro ao buscar retry_queue:', fetchErr.message)
    return NextResponse.json({ error: 'Erro ao buscar fila' }, { status: 500 })
  }

  const rows = ((dueRows ?? []) as RetryQueueRow[]).filter(r => r.attempts < r.max_attempts)

  let succeeded = 0
  let requeued = 0
  let dropped = 0

  for (const row of rows) {
    try {
      // 1. Conversa precisa continuar 'open' — se um humano já assumiu
      //    (escalated/pending/closed) enquanto esperava o retry, a IA não deve
      //    responder por cima.
      const { data: convData, error: convErr } = await admin
        .from('conversations')
        .select('status, remote_jid, contact_name')
        .eq('id', row.conversation_id)
        .single()

      if (convErr || !convData) {
        console.error('[cron/retry-groq] conversa não encontrada:', row.conversation_id, convErr?.message)
        await admin.from('retry_queue').delete().eq('id', row.id)
        dropped++
        continue
      }

      const conv = convData as ConversationRow

      if (conv.status !== 'open') {
        console.log('[cron/retry-groq] conversa não está mais "open" (', conv.status, ') — descartando retry')
        await admin.from('retry_queue').delete().eq('id', row.id)
        dropped++
        continue
      }

      // 2. Dados da empresa (instância WhatsApp, agente, gestor)
      const [{ data: instanceData }, { data: agentData }, { data: companyData }] = await Promise.all([
        admin.from('whatsapp_instances').select('instance_name').eq('company_id', row.company_id).single(),
        admin.from('agent_configs').select('agent_name, business_context, escalation_instructions').eq('company_id', row.company_id).single(),
        admin.from('companies').select('manager_whatsapp').eq('id', row.company_id).single(),
      ])

      const instance = instanceData as WhatsAppInstanceRow | null
      const agent = agentData as AgentConfigRow | null
      const company = companyData as CompanyRow | null

      if (!instance) {
        console.error('[cron/retry-groq] instância não encontrada para company_id:', row.company_id)
        await admin.from('retry_queue').delete().eq('id', row.id)
        dropped++
        continue
      }

      // 3. Histórico (mais recentes primeiro, depois reordena pra cronológica)
      const { data: historyData } = await admin
        .from('messages')
        .select('role, content')
        .eq('conversation_id', row.conversation_id)
        .order('created_at', { ascending: false })
        .limit(20)

      const history = ((historyData ?? []) as MessageRow[]).reverse()

      const systemPrompt = buildSystemPrompt(agent)
      const groqMessages: GroqChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history.map(m => ({ role: m.role, content: m.content })),
      ]

      const { content: reply, rateLimited } = await callGroq(groqMessages)

      if (reply) {
        console.log('[cron/retry-groq] sucesso no retry, conversa:', row.conversation_id)
        await deliverAgentReply({
          admin,
          conversationId:  row.conversation_id,
          instanceName:    instance.instance_name,
          remoteJid:       conv.remote_jid,
          contactName:     conv.contact_name,
          managerWhatsapp: company?.manager_whatsapp ?? null,
          reply,
        })
        await admin.from('retry_queue').delete().eq('id', row.id)
        succeeded++
        continue
      }

      // Rate limit de novo, ou Groq não retornou conteúdo por outro motivo
      const newAttempts = row.attempts + 1
      console.warn(
        '[cron/retry-groq] falha no retry (rateLimited:', rateLimited, ') — tentativa', newAttempts, '/', row.max_attempts
      )

      if (newAttempts >= row.max_attempts) {
        await admin.from('retry_queue').delete().eq('id', row.id)
        await admin.from('conversations').update({ status: 'escalated' }).eq('id', row.conversation_id)

        if (company?.manager_whatsapp) {
          const managerPhone = company.manager_whatsapp.replace(/\D/g, '')
          const contactLabel = conv.contact_name ?? conv.remote_jid.replace(/@s\.whatsapp\.net$/, '')
          await sendEvolutionText(
            instance.instance_name,
            managerPhone,
            `⚠️ Não conseguimos responder ${contactLabel} automaticamente após ${row.max_attempts} tentativas (alta demanda da IA). ` +
              `Acesse o painel para responder: https://nexoagent-gold.vercel.app/dashboard/kanban`
          )
        }
        dropped++
      } else {
        await admin
          .from('retry_queue')
          .update({ attempts: newAttempts, retry_after: new Date(Date.now() + 60_000).toISOString() })
          .eq('id', row.id)
        requeued++
      }
    } catch (err) {
      console.error('[cron/retry-groq] erro não tratado processando registro', row.id, ':', err)
    }
  }

  return NextResponse.json({ processed: rows.length, succeeded, requeued, dropped })
}
