import { redirect } from 'next/navigation'
import { MessageSquare, TrendingUp, Zap, Wifi, Cpu } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type AgentConfig = {
  agent_name: string
}

type UserProfile = {
  company_id: string | null
}

type PlanInfo = {
  name: string
  conversations_limit: number | null
  features: { tokens_limit?: number | null } | null
}

type CompanyData = {
  plans: PlanInfo | PlanInfo[] | null
}

type ConversationRow = {
  id: string
  contact_name: string | null
  remote_jid: string
  status: string
  last_message_at: string | null
}

const statusConfig: Record<string, { label: string; className: string }> = {
  open:      { label: 'Aberto',   className: 'bg-success/10 text-success' },
  escalated: { label: 'Escalado', className: 'bg-warning/10 text-warning' },
  pending:   { label: 'Pendente', className: 'bg-purple-500/10 text-purple-500' },
  closed:    { label: 'Fechado',  className: 'bg-foreground-secondary/10 text-foreground-secondary' },
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes}min atrás`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h atrás`
  const days = Math.floor(hours / 24)
  return `${days}d atrás`
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data } = await admin
    .from('user_profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const profile = data as UserProfile | null

  let agentConfig: AgentConfig | null = null

  if (profile?.company_id) {
    const { data: agentData } = await admin
      .from('agent_configs')
      .select('agent_name')
      .eq('company_id', profile.company_id)
      .single()

    agentConfig = agentData as AgentConfig | null
  }

  const agentConfigured = agentConfig !== null

  let conversationsThisMonth = 0
  let conversationsLimit: number | null = null
  let planName = 'Free'
  let recentConversations: ConversationRow[] = []
  let groqTokensThisMonth = 0
  let groqCostBrl = 0
  let tokensLimit: number | null | undefined = undefined  // undefined = ainda não carregado; null = ilimitado

  if (profile?.company_id) {
    const startOfMonth = new Date()
    startOfMonth.setUTCDate(1)
    startOfMonth.setUTCHours(0, 0, 0, 0)

    const [{ count }, { data: companyData }, { data: convData }, { data: tokenData }] = await Promise.all([
      admin
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .gte('last_message_at', startOfMonth.toISOString()),
      admin
        .from('companies')
        .select('plans(name, conversations_limit, features)')
        .eq('id', profile.company_id)
        .single(),
      admin
        .from('conversations')
        .select('id, contact_name, remote_jid, status, last_message_at')
        .eq('company_id', profile.company_id)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(5),
      admin
        .from('token_usage')
        .select('total_tokens, cost_usd')
        .eq('company_id', profile.company_id)
        .gte('created_at', startOfMonth.toISOString()),
    ])

    const company = companyData as unknown as CompanyData | null
    const rawPlans = company?.plans
    const plan = rawPlans
      ? (Array.isArray(rawPlans) ? rawPlans[0] : rawPlans)
      : null

    conversationsLimit = plan?.conversations_limit ?? null
    planName           = plan?.name ?? 'Free'
    tokensLimit        = plan?.features?.tokens_limit  // undefined → não encontrado, null → ilimitado

    conversationsThisMonth = count ?? 0
    recentConversations   = (convData ?? []) as ConversationRow[]

    const rows = (tokenData ?? []) as { total_tokens: number; cost_usd: number }[]
    groqTokensThisMonth = rows.reduce((s, r) => s + r.total_tokens, 0)
    const totalCostUsd  = rows.reduce((s, r) => s + Number(r.cost_usd), 0)
    const BRL_PER_USD_WITH_MARGIN = 6.38
    groqCostBrl = totalCostUsd * BRL_PER_USD_WITH_MARGIN
  }

  const progressPct = conversationsLimit && conversationsLimit > 0
    ? Math.min(100, Math.round((conversationsThisMonth / conversationsLimit) * 100))
    : null

  // tokensLimit === null → ilimitado (Autoridade); undefined → plano sem features ainda
  const resolvedTokensLimit = tokensLimit === undefined ? null : tokensLimit
  const tokenProgressPct = resolvedTokensLimit !== null && resolvedTokensLimit > 0
    ? Math.min(100, Math.round((groqTokensThisMonth / resolvedTokensLimit) * 100))
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Início</h1>
        <p className="mt-1 text-sm text-foreground-secondary">
          Resumo da sua operação este mês
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Conversas este mês"
          value={conversationsLimit !== null ? `${conversationsThisMonth} / ${conversationsLimit}` : String(conversationsThisMonth)}
          subtitle={planName}
          icon={MessageSquare}
          variant="default"
        />
        <KpiCard
          title="Taxa de resposta"
          value="0%"
          subtitle="média mensal"
          icon={TrendingUp}
          variant="default"
        />
        <KpiCard
          title="Conversões"
          value="0"
          subtitle="leads convertidos"
          icon={Zap}
          variant="default"
        />
        <KpiCard
          title="Status do agente"
          value={agentConfigured ? 'Configurado' : 'Não configurado'}
          subtitle={agentConfig?.agent_name ?? 'Nenhum agente configurado'}
          icon={Wifi}
          variant={agentConfigured ? 'success' : 'warning'}
        />
        <KpiCard
          title="Tokens Groq este mês"
          value={groqTokensThisMonth.toLocaleString('pt-BR')}
          subtitle={`R$ ${groqCostBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} estimado`}
          icon={Cpu}
          variant="default"
        />
      </div>

      {/* Uso do plano */}
      <Card>
        <CardContent className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                Uso do plano — {planName}
              </p>
              {progressPct !== null ? (
                <p className="mt-0.5 text-xs text-foreground-secondary">
                  {conversationsThisMonth} de {conversationsLimit} conversas usadas ({progressPct}%)
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-foreground-secondary">Conversas ilimitadas</p>
              )}
            </div>
            {progressPct !== null && (
              <span className={cn(
                'text-sm font-semibold',
                progressPct >= 90 ? 'text-danger' : progressPct >= 70 ? 'text-warning' : 'text-success',
              )}>
                {progressPct}%
              </span>
            )}
          </div>
          {progressPct !== null ? (
            <div className="h-2 w-full overflow-hidden rounded-full bg-border">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  progressPct >= 90 ? 'bg-danger' : progressPct >= 70 ? 'bg-warning' : 'bg-success',
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          ) : (
            <div className="h-2 w-full overflow-hidden rounded-full bg-success/20">
              <div className="h-full w-full rounded-full bg-success/40" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uso de tokens Groq */}
      <Card>
        <CardContent className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                Tokens Groq este mês
              </p>
              {tokenProgressPct !== null ? (
                <p className="mt-0.5 text-xs text-foreground-secondary">
                  {groqTokensThisMonth.toLocaleString('pt-BR')} de {resolvedTokensLimit!.toLocaleString('pt-BR')} tokens usados ({tokenProgressPct}%)
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-foreground-secondary">Ilimitado</p>
              )}
            </div>
            {tokenProgressPct !== null && (
              <span className={cn(
                'text-sm font-semibold',
                tokenProgressPct >= 90 ? 'text-danger' : tokenProgressPct >= 70 ? 'text-warning' : 'text-success',
              )}>
                {tokenProgressPct}%
              </span>
            )}
          </div>
          {tokenProgressPct !== null ? (
            <div className="h-2 w-full overflow-hidden rounded-full bg-border">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  tokenProgressPct >= 90 ? 'bg-danger' : tokenProgressPct >= 70 ? 'bg-warning' : 'bg-success',
                )}
                style={{ width: `${tokenProgressPct}%` }}
              />
            </div>
          ) : (
            <div className="h-2 w-full overflow-hidden rounded-full bg-success/20">
              <div className="h-full w-full rounded-full bg-success/40" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Últimas conversas */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Últimas conversas</CardTitle>
        </CardHeader>
        <CardContent>
          {recentConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-10 w-10 text-foreground-secondary/30" />
              <p className="mt-3 text-sm font-medium text-foreground-secondary">
                Nenhuma conversa ainda
              </p>
              <p className="mt-1 text-xs text-foreground-secondary">
                As conversas aparecerão aqui quando seu agente começar a atender
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recentConversations.map((conv) => {
                const status = statusConfig[conv.status] ?? statusConfig['closed']
                const displayName = conv.contact_name ?? conv.remote_jid
                return (
                  <li key={conv.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                      <p className="truncate text-xs text-foreground-secondary">{conv.remote_jid}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', status.className)}>
                        {status.label}
                      </span>
                      <span className="whitespace-nowrap text-xs text-foreground-secondary">
                        {relativeTime(conv.last_message_at)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
