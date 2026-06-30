/**
 * Configura o webhook da instância na Evolution API.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/setup-webhook.ts <URL_PUBLICA>
 *
 * Exemplo com ngrok:
 *   npx tsx --env-file=.env.local scripts/setup-webhook.ts https://abc123.ngrok-free.app
 */

import { createClient } from '@supabase/supabase-js'

const publicUrl = process.argv[2]

if (!publicUrl) {
  console.error('❌ Informe a URL pública como argumento.')
  console.error('   Exemplo: npx tsx --env-file=.env.local scripts/setup-webhook.ts https://abc123.ngrok-free.app')
  process.exit(1)
}

const webhookUrl = `${publicUrl.replace(/\/$/, '')}/api/whatsapp/webhook`

const evolutionUrl  = process.env.EVOLUTION_API_URL ?? ''
const evolutionKey  = process.env.EVOLUTION_API_KEY ?? ''
const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!evolutionUrl || !evolutionKey || !supabaseUrl || !serviceKey) {
  console.error('❌ Variáveis de ambiente ausentes. Rode com --env-file=.env.local')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type InstanceRow = { instance_name: string }

async function setup() {
  // Busca todas as instâncias ativas no banco
  const { data, error } = await admin
    .from('whatsapp_instances')
    .select('instance_name')
    .in('status', ['connecting', 'connected'])

  if (error) {
    console.error('❌ Erro ao buscar instâncias:', error.message)
    process.exit(1)
  }

  const instances = (data ?? []) as InstanceRow[]

  if (instances.length === 0) {
    console.log('⚠️  Nenhuma instância ativa (connecting/connected) encontrada.')
    process.exit(0)
  }

  console.log(`🔗 Webhook URL: ${webhookUrl}\n`)

  for (const { instance_name } of instances) {
    const res = await fetch(`${evolutionUrl}/webhook/set/${instance_name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionKey,
      },
      body: JSON.stringify({
        webhook: {
          url: webhookUrl,
          events: ['MESSAGES_UPSERT'],
          enabled: true,
        },
      }),
    })

    const body = await res.json() as Record<string, unknown>

    if (res.ok) {
      console.log(`✅ ${instance_name} — webhook configurado`)
      console.log(`   Resposta:`, JSON.stringify(body))
    } else {
      console.error(`❌ ${instance_name} — erro ${res.status}:`, JSON.stringify(body))
    }
  }
}

setup().catch((err: unknown) => {
  console.error('❌ Erro inesperado:', err)
  process.exit(1)
})
