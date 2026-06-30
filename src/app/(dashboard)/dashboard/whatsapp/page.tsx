import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { WhatsAppPanel } from './whatsapp-panel'
import type { WhatsAppStatus } from './actions'

type UserProfile = { company_id: string | null }

type WhatsAppInstanceRow = {
  id: string
  company_id: string
  instance_name: string
  status: WhatsAppStatus
  phone_number: string | null
}

// Evolution API v2 — GET /instance/fetchInstances item shape
type EvolutionFetchItem = {
  name: string
  connectionStatus: string  // "open" | "close" | "connecting"
  ownerJid: string | null
}

// Evolution API v2 — GET /instance/connect/:name response (base64 na raiz)
type EvolutionConnectResponse = {
  base64: string
  code: string
  pairingCode: string | null
}

function mapState(connectionStatus: string): WhatsAppStatus {
  if (connectionStatus === 'open')        return 'connected'
  if (connectionStatus === 'connecting')  return 'connecting'
  return 'disconnected'
}

function evolutionHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: process.env.EVOLUTION_API_KEY ?? '',
  }
}

export default async function WhatsAppPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Admin client bypasses RLS recursion on user_profiles
  const admin = createAdminClient()
  const { data: profileData } = await admin
    .from('user_profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const profile = profileData as UserProfile | null
  const companyId = profile?.company_id ?? null

  console.log('[WhatsAppPage] user.id:', user.id, '| companyId:', companyId)

  if (!companyId) {
    return <WhatsAppPanel instance={null} initialQrBase64={null} />
  }

  const { data: instanceData } = await admin
    .from('whatsapp_instances')
    .select('id, company_id, instance_name, status, phone_number')
    .eq('company_id', companyId)
    .single()

  const instance = instanceData as WhatsAppInstanceRow | null

  console.log('[WhatsAppPage] instance:', JSON.stringify(instance))

  let initialQrBase64: string | null = null

  if (instance) {
    try {
      if (instance.status === 'connecting') {
        // Quando aguardando QR: chama /connect para obter QR Code
        // Não sincroniza via fetchInstances para não reverter para 'disconnected'
        // antes do usuário escanear (Evolution mostra "close" até a leitura)
        const connectRes = await fetch(
          `${process.env.EVOLUTION_API_URL}/instance/connect/${instance.instance_name}`,
          { headers: evolutionHeaders(), cache: 'no-store' }
        )

        const connectRaw = await connectRes.text()
        console.log('[WhatsAppPage] connect status:', connectRes.status)
        console.log('[WhatsAppPage] connect body:', connectRaw.slice(0, 500))

        if (connectRes.ok) {
          const connectData = JSON.parse(connectRaw) as EvolutionConnectResponse
          initialQrBase64 = connectData.base64 ?? null
          console.log('[WhatsAppPage] qrBase64 present:', initialQrBase64 !== null)
        }
      } else {
        // Para connected/disconnected: sincroniza status real via fetchInstances
        const fetchRes = await fetch(
          `${process.env.EVOLUTION_API_URL}/instance/fetchInstances?instanceName=${instance.instance_name}`,
          { headers: evolutionHeaders(), cache: 'no-store' }
        )

        if (fetchRes.ok) {
          const items = await fetchRes.json() as EvolutionFetchItem[]
          const item = items.find((i) => i.name === instance.instance_name)

          console.log('[WhatsAppPage] fetchInstances item connectionStatus:', item?.connectionStatus)

          if (item) {
            const liveStatus = mapState(item.connectionStatus)

            if (liveStatus !== instance.status) {
              const phoneNumber = item.ownerJid
                ? item.ownerJid.replace(/@.+$/, '')
                : null

              await admin
                .from('whatsapp_instances')
                .update({
                  status: liveStatus,
                  ...(phoneNumber ? { phone_number: phoneNumber } : {}),
                  ...(liveStatus === 'disconnected' ? { phone_number: null } : {}),
                })
                .eq('id', instance.id)

              instance.status = liveStatus
              instance.phone_number = phoneNumber
            }
          }
        }
      }
    } catch (err) {
      console.log('[WhatsAppPage] error:', err)
    }
  }

  return <WhatsAppPanel instance={instance} initialQrBase64={initialQrBase64} />
}
