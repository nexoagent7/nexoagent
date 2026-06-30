import { Building2, TrendingUp, CheckCircle, MessageSquare } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Plan = {
  name: string
}

type Company = {
  id: string
  name: string
  plan_status: 'trial' | 'active' | 'inactive'
  conversations_used_this_month: number
  created_at: string
  plans: Plan[] | Plan | null
}

type PlanStatus = Company['plan_status']

const statusBadgeVariant: Record<PlanStatus, 'success' | 'warning' | 'destructive'> = {
  active:   'success',
  trial:    'warning',
  inactive: 'destructive',
}

const statusLabel: Record<PlanStatus, string> = {
  active:   'Ativo',
  trial:    'Trial',
  inactive: 'Inativo',
}

function isPlanStatus(value: string): value is PlanStatus {
  return value === 'active' || value === 'trial' || value === 'inactive'
}

export default async function MasterPage() {
  const admin = createAdminClient()

  const { data, count } = await admin
    .from('companies')
    .select(
      'id, name, plan_status, conversations_used_this_month, created_at, plans(name)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })

  const companies = (data ?? []) as unknown as Company[]
  const totalCompanies = count ?? 0

  const trialCount = companies.filter((c) => c.plan_status === 'trial').length
  const activeCount = companies.filter((c) => c.plan_status === 'active').length
  const totalConversations = companies.reduce(
    (sum, c) => sum + (c.conversations_used_this_month ?? 0),
    0
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-foreground-secondary">
          Visão geral de todas as empresas na plataforma
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total de empresas"
          value={String(totalCompanies)}
          subtitle="cadastradas na plataforma"
          icon={Building2}
          variant="default"
        />
        <KpiCard
          title="Em trial"
          value={String(trialCount)}
          subtitle="empresas em período de teste"
          icon={TrendingUp}
          variant="warning"
        />
        <KpiCard
          title="Plano ativo"
          value={String(activeCount)}
          subtitle="empresas pagantes"
          icon={CheckCircle}
          variant="success"
        />
        <KpiCard
          title="Conversas este mês"
          value={totalConversations.toLocaleString('pt-BR')}
          subtitle="em todas as empresas"
          icon={MessageSquare}
          variant="default"
        />
      </div>

      {/* Tabela de empresas */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Empresas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {companies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Building2 className="h-10 w-10 text-foreground-secondary/30" />
              <p className="mt-3 text-sm font-medium text-foreground-secondary">
                Nenhuma empresa cadastrada ainda
              </p>
              <p className="mt-1 text-xs text-foreground-secondary">
                As empresas aparecerão aqui assim que os primeiros clientes se registrarem
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead>
                  <tr className="bg-background-secondary">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                      Plano
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                      Cadastro
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                      Conversas usadas
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-background">
                  {companies.map((company) => {
                    const status = isPlanStatus(company.plan_status)
                      ? company.plan_status
                      : 'inactive'

                    return (
                      <tr key={company.id} className="transition-colors hover:bg-background-secondary">
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm font-medium text-foreground">
                            {company.name}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm text-foreground-secondary">
                            {Array.isArray(company.plans)
                              ? (company.plans[0]?.name ?? '—')
                              : (company.plans?.name ?? '—')}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <Badge variant={statusBadgeVariant[status]}>
                            {statusLabel[status]}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm text-foreground-secondary">
                            {new Date(company.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <span className="text-sm font-medium text-foreground">
                            {(company.conversations_used_this_month ?? 0).toLocaleString('pt-BR')}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
