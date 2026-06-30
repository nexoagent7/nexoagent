'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Domain types ─────────────────────────────────────────────────────────────

export type WhatsAppStatus = 'connecting' | 'connected' | 'disconnected'

export type WhatsAppActionResult = {
  error?: string
  success?: boolean
}

export type SyncResult = {
  status: WhatsAppStatus
  qrBase64?: string
  phoneNumber?: string
  error?: string
}

// ─── Evolution API types ───────────────────────────────────────────────────────

// Evolution API v2 flat response shape
type EvolutionFetchItem = {
  name: string
  connectionStatus: string  // "open" | "close" | "connecting"
  ownerJid: string | null
}

// Evolution API v2 — GET /instance/connect/:name (base64 na raiz)
type EvolutionConnectResponse = {
  base64: string
  code: string
  pairingCode: string | null
}

type EvolutionErrorBody = {
  message?: string
  error?: string
  response?: { message?: string[] }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function evolutionHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: process.env.EVOLUTION_API_KEY ?? '',
  }
}

function evolutionUrl(path: string): string {
  return `${process.env.EVOLUTION_API_URL ?? ''}${path}`
}

function mapEvolutionState(connectionStatus: string): WhatsAppStatus {
  if (connectionStatus === 'open')        return 'connected'
  if (connectionStatus === 'connecting')  return 'connecting'
  return 'disconnected'
}

async function getCompanyId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Admin client bypasses RLS recursion on user_profiles
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  return (data as { company_id: string | null } | null)?.company_id ?? null
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function createInstance(): Promise<WhatsAppActionResult> {
  const companyId = await getCompanyId()
  if (!companyId) return { error: 'Empresa não identificada.' }

  const instanceName = `nexo-${companyId.slice(0, 8)}`

  const payload = { instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true }
  console.log('[createInstance] payload:', JSON.stringify(payload))

  let res: Response
  try {
    res = await fetch(evolutionUrl('/instance/create'), {
      method: 'POST',
      headers: evolutionHeaders(),
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.log('[createInstance] fetch error:', err)
    return { error: 'Não foi possível conectar à Evolution API.' }
  }

  const rawBody = await res.text()
  console.log('[createInstance] status:', res.status)
  console.log('[createInstance] body:', rawBody)

  if (!res.ok) {
    const body = JSON.parse(rawBody || '{}') as EvolutionErrorBody
    const msg = Array.isArray(body.response?.message)
      ? body.response.message[0]
      : (body.message ?? body.error ?? '')
    const alreadyExists = res.status === 403 && msg.includes('already in use')
    if (!alreadyExists) {
      return { error: msg || 'Erro ao criar instância.' }
    }
    // Instância já existe — chama /connect para iniciar geração de QR Code
    try {
      const connectRes = await fetch(evolutionUrl(`/instance/connect/${instanceName}`), {
        headers: evolutionHeaders(),
      })
      const connectRaw = await connectRes.text()
      console.log('[createInstance] connect status:', connectRes.status)
      console.log('[createInstance] connect body:', connectRaw.slice(0, 300))
    } catch (err) {
      console.log('[createInstance] connect error:', err)
    }
  }

  const admin = createAdminClient()
  const { error: dbError } = await admin.from('whatsapp_instances').upsert(
    {
      company_id: companyId,
      instance_name: instanceName,
      status: 'connecting' satisfies WhatsAppStatus,
      phone_number: null,
    },
    { onConflict: 'company_id' }
  )

  if (dbError) {
    console.log('[createInstance] dbError code:', dbError.code)
    console.log('[createInstance] dbError message:', dbError.message)
    console.log('[createInstance] dbError details:', dbError.details)
    return { error: 'Instância criada, mas erro ao salvar no banco.' }
  }

  revalidatePath('/dashboard/whatsapp')
  return { success: true }
}

export async function disconnectInstance(): Promise<WhatsAppActionResult> {
  const companyId = await getCompanyId()
  if (!companyId) return { error: 'Empresa não identificada.' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('whatsapp_instances')
    .select('instance_name')
    .eq('company_id', companyId)
    .single()

  const row = data as { instance_name: string } | null
  if (!row) return { error: 'Nenhuma instância encontrada.' }

  try {
    await fetch(evolutionUrl(`/instance/logout/${row.instance_name}`), {
      method: 'DELETE',
      headers: evolutionHeaders(),
    })
  } catch {
    // Best-effort: atualiza o banco mesmo que a API falhe
  }

  await admin
    .from('whatsapp_instances')
    .update({ status: 'disconnected' satisfies WhatsAppStatus, phone_number: null })
    .eq('company_id', companyId)

  revalidatePath('/dashboard/whatsapp')
  return { success: true }
}

export async function syncStatus(): Promise<SyncResult> {
  const companyId = await getCompanyId()
  if (!companyId) return { status: 'disconnected', error: 'Empresa não identificada.' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('whatsapp_instances')
    .select('instance_name, status')
    .eq('company_id', companyId)
    .single()

  const row = data as { instance_name: string; status: WhatsAppStatus } | null
  if (!row) return { status: 'disconnected', error: 'Instância não encontrada.' }

  let res: Response
  try {
    res = await fetch(
      evolutionUrl(`/instance/fetchInstances?instanceName=${row.instance_name}`),
      { headers: evolutionHeaders() }
    )
  } catch {
    return { status: row.status }
  }

  if (!res.ok) return { status: row.status }

  const items = await res.json() as EvolutionFetchItem[]
  const item = items.find((i) => i.name === row.instance_name)

  if (!item) return { status: 'disconnected' }

  const newStatus = mapEvolutionState(item.connectionStatus)

  const phoneNumber = item.ownerJid
    ? item.ownerJid.replace(/@.+$/, '')
    : undefined

  if (newStatus !== row.status) {
    await admin
      .from('whatsapp_instances')
      .update({
        status: newStatus,
        ...(phoneNumber ? { phone_number: phoneNumber } : {}),
        ...(newStatus === 'disconnected' ? { phone_number: null } : {}),
      })
      .eq('company_id', companyId)
  }

  // Para status connecting, busca QR via /instance/connect
  let qrBase64: string | undefined
  if (newStatus === 'connecting') {
    try {
      const connectRes = await fetch(
        evolutionUrl(`/instance/connect/${row.instance_name}`),
        { headers: evolutionHeaders() }
      )
      if (connectRes.ok) {
        const connectData = await connectRes.json() as EvolutionConnectResponse
        qrBase64 = connectData.base64
      }
    } catch {
      // falha silenciosa
    }
  }

  return { status: newStatus, qrBase64, phoneNumber }
}
