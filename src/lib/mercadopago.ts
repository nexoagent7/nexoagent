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

export async function createPreapproval(params: PreapprovalParams): Promise<PreapprovalResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const res = await fetch(`${MP_API}/preapproval`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      reason:               params.reason,
      payer_email:          params.payerEmail,
      external_reference:   `${params.companyId}|${params.planId}`,
      back_url:             `${appUrl}/dashboard/planos?status=sucesso`,
      notification_url:     `${appUrl}/api/webhooks/mercadopago`,
      status:               'pending',
      auto_recurring: {
        frequency:          1,
        frequency_type:     'months',
        transaction_amount: params.amountBrl,
        currency_id:        'BRL',
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`MP createPreapproval error ${res.status}: ${body}`)
  }

  const data = await res.json()
  return { id: data.id, initPoint: data.init_point }
}

export type PreapprovalStatus =
  | 'pending'
  | 'authorized'
  | 'paused'
  | 'cancelled'

export type PreapprovalDetails = {
  id: string
  status: PreapprovalStatus
  externalReference: string | null
  planId: string | null       // id do plano no banco (external_reference)
  payerEmail: string | null
}

export async function fetchPreapproval(preapprovalId: string): Promise<PreapprovalDetails> {
  const res = await fetch(`${MP_API}/preapproval/${preapprovalId}`, {
    headers: authHeaders(),
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`MP fetchPreapproval error ${res.status}: ${body}`)
  }

  const data = await res.json()
  return {
    id:                data.id,
    status:            data.status,
    externalReference: data.external_reference ?? null,
    planId:            data.external_reference ?? null,
    payerEmail:        data.payer_email ?? null,
  }
}
