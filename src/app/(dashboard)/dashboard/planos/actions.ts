'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPreapproval } from '@/lib/mercadopago'

type PlanRow = {
  id: string
  name: string
  slug: string
  price_brl: number
}

export type SubscribeState = { error?: string }

export async function subscribeAction(
  _prevState: SubscribeState,
  formData: FormData
): Promise<SubscribeState> {
  const planId = formData.get('plan_id') as string
  if (!planId) return { error: 'Plano não identificado.' }

  // Sessão do usuário
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' }

  const admin = createAdminClient()

  // Busca company_id do usuário
  const { data: profileData } = await admin
    .from('user_profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const companyId = (profileData as { company_id: string | null } | null)?.company_id
  if (!companyId) return { error: 'Empresa não encontrada.' }

  // Busca dados do plano
  const { data: planData } = await admin
    .from('plans')
    .select('id, name, slug, price_brl')
    .eq('id', planId)
    .single()

  const plan = planData as PlanRow | null
  if (!plan) return { error: 'Plano não encontrado.' }

  // Plano Free: atualiza direto no banco, sem MP
  if (plan.price_brl === 0) {
    const { error: dbError } = await admin
      .from('companies')
      .update({ plan_id: plan.id, plan_status: 'active' })
      .eq('id', companyId)

    if (dbError) return { error: 'Erro ao ativar plano. Tente novamente.' }
    redirect('/dashboard/planos?status=sucesso')
  }

  // Planos pagos: cria Preapproval no Mercado Pago
  let initPoint: string
  let subscriptionId: string

  try {
    const result = await createPreapproval({
      reason:     `NexoAgent — Plano ${plan.name}`,
      payerEmail: user.email!,
      amountBrl:  plan.price_brl / 100,  // centavos → reais
      companyId,
      planId:     plan.id,
    })
    initPoint      = result.initPoint
    subscriptionId = result.id
  } catch {
    return { error: 'Erro ao conectar com o Mercado Pago. Tente novamente.' }
  }

  // Salva mp_subscription_id pendente no banco
  await admin
    .from('companies')
    .update({ mp_subscription_id: subscriptionId })
    .eq('id', companyId)

  redirect(initPoint)
}
