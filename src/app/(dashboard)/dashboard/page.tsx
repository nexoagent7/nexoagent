import { redirect } from 'next/navigation'
import { MessageSquare, TrendingUp, Zap, Wifi } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type AgentConfig = {
  agent_name: string
}

type UserProfile = {
  company_id: string | null
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
          value="0 / 100"
          subtitle="do limite do plano"
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
      </div>

      {/* Últimas conversas */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Últimas conversas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-10 w-10 text-foreground-secondary/30" />
            <p className="mt-3 text-sm font-medium text-foreground-secondary">
              Nenhuma conversa ainda
            </p>
            <p className="mt-1 text-xs text-foreground-secondary">
              As conversas aparecerão aqui quando seu agente começar a atender
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
