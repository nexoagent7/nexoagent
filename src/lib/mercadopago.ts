const MP_API = 'https://api.mercadopago.com'

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
  }
}

export type PreapprovalParams = {
  reason: string
  payerEmail: string
  amountBrl: number   // valor em reais (ex: 49.00)
  companyId: string
  planId: string      // ambos codificados no external_reference
}

export type PreapprovalResult = {
  id: string
  initPoint: string
}

// Cria uma preferência de Checkout Pro (pagamento único)
export async function createPreapproval(params: PreapprovalParams): Promise<PreapprovalResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      items: [
        {
          title:      params.reason,
          quantity:   1,
          unit_price: params.amountBrl,
          currency_id: 'BRL',
        },
      ],
      external_reference: `${params.companyId}|${params.planId}`,
      back_urls: {
        success: `${appUrl}/dashboard/planos?status=sucesso`,
        failure: `${appUrl}/dashboard/planos?status=erro`,
        pending: `${appUrl}/dashboard/planos?status=pendente`,
      },
      auto_return:      'approved',
      notification_url: `${appUrl}/api/webhooks/mercadopago`,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('[MP createPreference] erro na API:', {
      status:  res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body,
      params:  { ...params, companyId: params.companyId.slice(0, 8) + '…' },
    })
    throw new Error(`MP createPreference error ${res.status}: ${body}`)
  }

  const data = await res.json()
  return { id: data.id, initPoint: data.init_point }
}

// ─── Payment (Checkout Pro webhook) ───────────────────────────────────────────

export type PaymentDetails = {
  id: string
  status: string               // approved | rejected | pending | refunded | ...
  externalReference: string | null
}

export async function fetchPayment(paymentId: string): Promise<PaymentDetails> {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: authHeaders(),
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`MP fetchPayment error ${res.status}: ${body}`)
  }

  const data = await res.json()
  return {
    id:                String(data.id),
    status:            data.status,
    externalReference: data.external_reference ?? null,
  }
}
