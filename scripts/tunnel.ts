/**
 * Abre um túnel ngrok na porta 3002 e configura o webhook na Evolution API.
 *
 * Uso:
 *   NGROK_AUTHTOKEN=seu_token npx tsx --env-file=.env.local scripts/tunnel.ts
 *
 * Ou coloque NGROK_AUTHTOKEN no .env.local e rode:
 *   npx tsx --env-file=.env.local scripts/tunnel.ts
 */

import ngrok from '@ngrok/ngrok'
import { createClient } from '@supabase/supabase-js'

const authtoken = process.env.NGROK_AUTHTOKEN
if (!authtoken) {
  console.error('❌ NGROK_AUTHTOKEN não definido.')
  console.error('   Crie uma conta gratuita em https://ngrok.com, copie seu authtoken e')
  console.error('   adicione ao .env.local: NGROK_AUTHTOKEN=seu_token')
  process.exit(1)
}

const evolutionUrl = process.env.EVOLUTION_API_URL ?? ''
const evolutionKey = process.env.EVOLUTION_API_KEY ?? ''
const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type InstanceRow = { instance_name: string }

async function configureWebhook(publicUrl: string) {
  const webhookUrl = `${publicUrl}/api/whatsapp/webhook`

  const { data, error } = await admin
    .from('whatsapp_instances')
    .select('instance_name')
    .in('status', ['connecting', 'connected'])

  if (error) { console.error('❌ Supabase:', error.message); return }

  const instances = (data ?? []) as InstanceRow[]
  if (instances.length === 0) {
    console.log('⚠️  Nenhuma instância ativa — webhook não configurado.')
    return
  }

  for (const { instance_name } of instances) {
    const res = await fetch(`${evolutionUrl}/webhook/set/${instance_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
      body: JSON.stringify({
        webhook: { url: webhookUrl, events: ['MESSAGES_UPSERT'], enabled: true },
      }),
    })

    if (res.ok) {
      console.log(`✅ Webhook configurado para ${instance_name}`)
      console.log(`   URL: ${webhookUrl}`)
    } else {
      const body = await res.json() as Record<string, unknown>
      console.error(`❌ ${instance_name}:`, JSON.stringify(body))
    }
  }
}

async function main() {
  console.log('🚇 Abrindo túnel ngrok na porta 3002...\n')

  const listener = await ngrok.forward({
    addr: 3002,
    authtoken,
  })

  const url = listener.url()
  if (!url) { console.error('❌ URL do túnel não disponível.'); process.exit(1) }

  console.log(`🌐 URL pública: ${url}\n`)
  await configureWebhook(url)

  console.log('\n⏳ Túnel ativo. Pressione Ctrl+C para encerrar.')

  // Mantém o event loop ativo (sem isso o Node encerra ao esvaziar a fila)
  const keepAlive = setInterval(() => {}, 1 << 30)

  await new Promise<void>((resolve) => {
    const shutdown = async () => {
      clearInterval(keepAlive)
      console.log('\n🛑 Encerrando túnel...')
      await listener.close()
      resolve()
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })
}

main().catch((err: unknown) => {
  console.error('❌ Erro:', err)
  process.exit(1)
})
