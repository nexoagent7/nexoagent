import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Schema real da tabela companies (inspecionado via probe)
type CompanyRow = {
  id: string
  name: string
  slug: string
  email: string
  plan_status: string
}

async function seed() {
  console.log('🌱 Iniciando seed...\n')

  // ── 1. Empresa ────────────────────────────────────────────────────────────
  const { data: company, error: companyError } = await admin
    .from('companies')
    .insert({
      name:  'Empresa Teste',
      slug:  'empresa-teste',
      email: 'admin@teste.com',
    })
    .select('id, name, slug, plan_status')
    .single()

  if (companyError) {
    console.error('❌ Erro ao criar empresa:', companyError.message)
    process.exit(1)
  }

  const row = company as CompanyRow
  console.log('✅ Empresa criada')
  console.log(`   ID:     ${row.id}`)
  console.log(`   Nome:   ${row.name}`)
  console.log(`   Slug:   ${row.slug}`)
  console.log(`   Status: ${row.plan_status}\n`)

  // ── 2. Usuário no Supabase Auth ───────────────────────────────────────────
  const EMAIL = 'admin@teste.com'
  const PASSWORD = 'Admin123!'

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  })

  let userId: string

  if (authError) {
    if (authError.message.toLowerCase().includes('already been registered')) {
      console.log('⚠️  Usuário já existe — buscando ID...')
      const { data: list, error: listErr } = await admin.auth.admin.listUsers()
      if (listErr) { console.error('❌', listErr.message); process.exit(1) }
      const found = list.users.find((u) => u.email === EMAIL)
      if (!found) { console.error('❌ Usuário não encontrado.'); process.exit(1) }
      userId = found.id
      console.log(`   ID: ${userId}\n`)
    } else {
      console.error('❌ Erro ao criar usuário:', authError.message)
      process.exit(1)
    }
  } else {
    userId = authData.user.id
    console.log('✅ Usuário Auth criado')
    console.log(`   ID:    ${userId}`)
    console.log(`   Email: ${authData.user.email}\n`)
  }

  // ── 3. Perfil em user_profiles ────────────────────────────────────────────
  const { error: profileError } = await admin
    .from('user_profiles')
    .upsert(
      {
        id:         userId,
        full_name:  'Admin Teste',
        role:       'admin',
        company_id: row.id,
      },
      { onConflict: 'id' }
    )

  if (profileError) {
    console.error('❌ Erro ao criar perfil:', profileError.message)
    process.exit(1)
  }

  console.log('✅ Perfil criado em user_profiles')
  console.log(`   Role:       admin`)
  console.log(`   Company ID: ${row.id}\n`)

  console.log('─────────────────────────────────────')
  console.log('  Credenciais de acesso')
  console.log('─────────────────────────────────────')
  console.log(`  Email: ${EMAIL}`)
  console.log(`  Senha: ${PASSWORD}`)
  console.log('  Role:  admin  →  /dashboard')
  console.log('─────────────────────────────────────')
}

seed().catch((err: unknown) => {
  console.error('❌ Erro inesperado:', err)
  process.exit(1)
})
