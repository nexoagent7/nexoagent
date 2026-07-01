import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchPayment } from '@/lib/mercadopago'

export async function POST(req: NextRequest) {
  let body: { type?: string; data?: { id?: string | number } }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Só processa eventos de pagamento do Checkout Pro
  if (body.type !== 'payment') {
    return NextResponse.json({ ok: true })
  }

  const paymentId = body.data?.id
  if (!paymentId) return NextResponse.json({ ok: true })

  try {
    const payment = await fetchPayment(String(paymentId))

    // external_reference = "companyId|planId"
    const [companyId, planId] = (payment.externalReference ?? '').split('|')
    if (!companyId || !planId) return NextResponse.json({ ok: true })

    if (payment.status === 'approved') {
      const admin = createAdminClient()
      await admin
        .from('companies')
        .update({
          plan_id:     planId,
          plan_status: 'active',
        })
        .eq('id', companyId)
    }
  } catch (err) {
    // Retorna 200 para o MP não retentar indefinidamente
    console.error('[MP webhook] erro ao processar payment:', err)
  }

  return NextResponse.json({ ok: true })
}
