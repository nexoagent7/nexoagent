import { redirect } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent } from '@/components/ui/card'
import { KanbanBoard } from './kanban-board'
import type { ConversationData, MessageData } from './kanban-board'

type UserProfile = {
  company_id: string | null
}

type PlanFeatures = {
  kanban_columns: number
  human_handoff: boolean
}

type CompanyRow = {
  plans: { features: PlanFeatures } | { features: PlanFeatures }[] | null
}

type ConversationRow = {
  id: string
  remote_jid: string
  contact_name: string | null
  status: string
  last_message_at: string | null
  created_at: string
}

type MessageRow = {
  id: string
  conversation_id: string
  role: string
  content: string
  media_url: string | null
  created_at: string
}

export default async function KanbanPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: profileData } = await admin
    .from('user_profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const profile = profileData as UserProfile | null
  const companyId = profile?.company_id ?? null

  if (!companyId) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-foreground">Atendimentos</h1>
          <p className="mt-1 text-sm text-foreground-secondary">
            Gerencie todas as conversas em andamento
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="h-10 w-10 text-foreground-secondary/30" />
            <p className="mt-3 text-sm font-medium text-foreground-secondary">
              Conta não vinculada a uma empresa
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const [{ data: companyData }, { data: convData }] = await Promise.all([
    admin
      .from('companies')
      .select('plans(features)')
      .eq('id', companyId)
      .single(),
    admin
      .from('conversations')
      .select('id, remote_jid, contact_name, status, last_message_at, created_at')
      .eq('company_id', companyId)
      .order('last_message_at', { ascending: false, nullsFirst: false }),
  ])

  // Extract plan features with safe fallbacks
  const company = companyData as unknown as CompanyRow | null
  const rawPlan = company?.plans
  const planFeatures = rawPlan
    ? (Array.isArray(rawPlan) ? rawPlan[0]?.features : rawPlan.features)
    : null

  const kanbanColumns: number   = planFeatures?.kanban_columns ?? 4
  const humanHandoff: boolean   = planFeatures?.human_handoff  ?? true

  const convRows = (convData ?? []) as ConversationRow[]
  const convIds = convRows.map(c => c.id)

  let msgRows: MessageRow[] = []
  if (convIds.length > 0) {
    const { data: msgData } = await admin
      .from('messages')
      .select('id, conversation_id, role, content, media_url, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: true })

    msgRows = (msgData ?? []) as MessageRow[]
  }

  const msgsByConv = new Map<string, MessageRow[]>()
  for (const msg of msgRows) {
    const bucket = msgsByConv.get(msg.conversation_id) ?? []
    bucket.push(msg)
    msgsByConv.set(msg.conversation_id, bucket)
  }

  const conversations: ConversationData[] = convRows.map(conv => {
    const msgs = msgsByConv.get(conv.id) ?? []
    const typedMsgs: MessageData[] = msgs.map(m => ({
      id:              m.id,
      conversation_id: m.conversation_id,
      role:            m.role === 'assistant' ? 'assistant' : 'user',
      content:         m.content,
      media_url:       m.media_url ?? null,
      created_at:      m.created_at,
    }))
    return {
      id:              conv.id,
      remote_jid:      conv.remote_jid,
      contact_name:    conv.contact_name,
      status:          conv.status,
      last_message_at: conv.last_message_at,
      created_at:      conv.created_at,
      messages:        typedMsgs,
    }
  })

  const ia:        ConversationData[] = []
  const escalated: ConversationData[] = []
  const pending:   ConversationData[] = []
  const closed:    ConversationData[] = []

  for (const conv of conversations) {
    if (conv.status === 'closed') {
      closed.push(conv)
    } else if (conv.status === 'escalated') {
      escalated.push(conv)
    } else if (conv.status === 'pending') {
      pending.push(conv)
    } else {
      ia.push(conv)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 shrink-0">
        <h1 className="font-display text-2xl font-bold text-foreground">Atendimentos</h1>
        <p className="mt-1 text-sm text-foreground-secondary">
          Gerencie todas as conversas em andamento
        </p>
      </div>

      <div className="min-h-0 flex-1">
        <KanbanBoard
          ia={ia}
          escalated={escalated}
          pending={pending}
          closed={closed}
          kanbanColumns={kanbanColumns}
          humanHandoff={humanHandoff}
        />
      </div>
    </div>
  )
}
