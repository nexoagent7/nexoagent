import { redirect } from 'next/navigation'
import { Check, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { SubscribeButton } from './subscribe-button'

type Plan = {
  id: string
  name: string
  slug: string
  price_brl: number
  conversations_limit: number | null
}

type CompanyRow = {
  plan_id: string | null
  plan_status: string | null
}

const PLAN_FEATURES: Record<string, string[]> = {
  free: [
    '10 conversas por mês',
    'Agente IA no WhatsApp',
    'Kanban 3 colunas (+ Com Humano)',
    'Handoff humano',
  ],
  semente: [
    '100 conversas por mês',
    'Agente IA no WhatsApp',
    'Kanban 3 colunas (+ Com Humano)',
    'Handoff humano',
    'Suporte por e-mail',
  ],
  crescimento: [
    '500 conversas por mês',
    'Agente IA avançado',
    'Kanban completo (4 colunas)',
    'Handoff humano',
    'Relatórios',
    'Suporte prioritário',
  ],
  autoridade: [
    'Conversas ilimitadas',
    'Agente IA avançado',
    'Kanban completo (4 colunas)',
    'Handoff humano',
    'Relatórios avançados',
    'Suporte VIP',
  ],
}

function formatPrice(priceBrl: number) {
  if (priceBrl === 0) return 'Grátis'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  }).format(priceBrl / 100)
}

export default async function PlanosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { status } = await searchParams
  const showSuccess = status === 'sucesso'

  const admin = createAdminClient()

  const [{ data: profileData }, { data: plansData }] = await Promise.all([
    admin
      .from('user_profiles')
      .select('company_id')
      .eq('id', user.id)
      .single(),
    admin
      .from('plans')
      .select('id, name, slug, price_brl, conversations_limit')
      .order('price_brl', { ascending: true }),
  ])

  const companyId = (profileData as { company_id: string | null } | null)?.company_id

  let currentPlanId: string | null = null
  let currentPlanStatus: string | null = null

  if (companyId) {
    const { data: companyData } = await admin
      .from('companies')
      .select('plan_id, plan_status')
      .eq('id', companyId)
      .single()

    const company = companyData as CompanyRow | null
    currentPlanId = company?.plan_id ?? null
    currentPlanStatus = company?.plan_status ?? null
  }

  const plans = (plansData ?? []) as Plan[]
  const isActivePlan = (planId: string) =>
    currentPlanId === planId && currentPlanStatus === 'active'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Planos</h1>
        <p className="mt-1 text-sm text-foreground-secondary">
          Escolha o plano ideal para o seu negócio
        </p>
      </div>

      {showSuccess && (
        <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3">
          <p className="text-sm font-medium text-success">
            Plano atualizado com sucesso!
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const active = isActivePlan(plan.id)
          const features = PLAN_FEATURES[plan.slug] ?? []
          const isHighlighted = plan.slug === 'crescimento'

          return (
            <Card
              key={plan.id}
              className={cn(
                'relative flex flex-col',
                isHighlighted && 'border-primary shadow-md',
                active && 'ring-2 ring-success',
              )}
            >
              {isHighlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                    <Zap className="h-3 w-3" /> Mais popular
                  </span>
                </div>
              )}

              <CardHeader className="pb-2 pt-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-display text-lg">{plan.name}</CardTitle>
                  {active && (
                    <Badge variant="success" className="text-xs">Atual</Badge>
                  )}
                </div>
                <div className="mt-2">
                  <span className="font-display text-3xl font-bold text-foreground">
                    {formatPrice(plan.price_brl)}
                  </span>
                  {plan.price_brl > 0 && (
                    <span className="ml-1 text-sm text-foreground-secondary">/mês</span>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col gap-6">
                <ul className="flex-1 space-y-2">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-foreground-secondary">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      {f}
                    </li>
                  ))}
                </ul>

                {active ? (
                  <button
                    disabled
                    className="w-full cursor-default rounded-xl border border-border py-2 text-sm font-medium text-foreground-secondary"
                  >
                    Plano atual
                  </button>
                ) : (
                  <SubscribeButton
                    planId={plan.id}
                    label={plan.price_brl === 0 ? 'Ativar grátis' : 'Assinar'}
                  />
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
