import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchPreapproval } from '@/lib/mercadopago'

export async function POST(req: NextRequest) {
  let body: { type?: string; data?: { id?: string } }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Ignora eventos que não são de assinatura
  if (body.type !== 'subscription_preapproval') {
    return NextResponse.json({ ok: true })
  }

  const preapprovalId = body.data?.id
  if (!preapprovalId) return NextResponse.json({ ok: true })

  try {
    const preapproval = await fetchPreapproval(preapprovalId)

    // external_reference = "companyId|planId"
    const [companyId, planId] = (preapproval.externalReference ?? '').split('|')
    if (!companyId || !planId) return NextResponse.json({ ok: true })

    const admin = createAdminClient()

    if (preapproval.status === 'authorized') {
      await admin
        .from('companies')
        .update({
          plan_id:            planId,
          plan_status:        'active',
          mp_subscription_id: preapprovalId,
        })
        .eq('id', companyId)
    } else if (preapproval.status === 'cancelled') {
      await admin
        .from('companies')
        .update({ plan_status: 'inactive' })
        .eq('id', companyId)
    }
  } catch (err) {
    // Loga mas retorna 200 para o MP não retentar indefinidamente
    console.error('[MP webhook] erro ao processar preapproval:', err)
  }

  return NextResponse.json({ ok: true })
}
