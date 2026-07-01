'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export type RegisterState = { error?: string; success?: string }

export async function registerAction(
  _prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const name            = (formData.get('name') as string).trim()
  const companyName     = (formData.get('company_name') as string).trim()
  const email           = (formData.get('email') as string).trim()
  const password        = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!name || !companyName || !email || !password || !confirmPassword) {
    return { error: 'Preencha todos os campos.' }
  }

  if (password.length < 6) {
    return { error: 'A senha deve ter no mínimo 6 caracteres.' }
  }

  if (password !== confirmPassword) {
    return { error: 'As senhas não coincidem.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return { error: error.message }
  }

  if (!data.user) {
    return { error: 'Erro ao criar usuário. Tente novamente.' }
  }

  // Sem sessão = e-mail de confirmação está ativo no Supabase
  if (!data.session) {
    return { success: 'Conta criada! Verifique seu e-mail para confirmar o cadastro.' }
  }

  const admin = createAdminClient()

  // 1. Criar perfil do usuário
  const { error: profileError } = await admin
    .from('user_profiles')
    .insert({ id: data.user.id, full_name: name, role: 'admin' })

  if (profileError) {
    return { error: 'Usuário criado, mas houve um erro ao salvar o perfil. Contate o suporte.' }
  }

  // 2. Buscar plan_id do plano Free
  const { data: planData, error: planError } = await admin
    .from('plans')
    .select('id')
    .eq('slug', 'free')
    .single()

  if (planError || !planData) {
    return { error: 'Erro ao localizar plano padrão. Contate o suporte.' }
  }

  // 3. Criar empresa
  const { data: companyData, error: companyError } = await admin
    .from('companies')
    .insert({ name: companyName, plan_id: (planData as { id: string }).id })
    .select('id')
    .single()

  if (companyError || !companyData) {
    return { error: 'Erro ao criar empresa. Contate o suporte.' }
  }

  const companyId = (companyData as { id: string }).id

  // 4. Associar empresa ao perfil
  const { error: updateProfileError } = await admin
    .from('user_profiles')
    .update({ company_id: companyId })
    .eq('id', data.user.id)

  if (updateProfileError) {
    return { error: 'Erro ao associar empresa ao usuário. Contate o suporte.' }
  }

  // 5. Criar agent_configs padrão
  const { error: agentError } = await admin
    .from('agent_configs')
    .insert({
      company_id:               companyId,
      agent_name:               'Assistente',
      business_context:         '',
      escalation_instructions:  '',
    })

  if (agentError) {
    return { error: 'Erro ao criar configuração do agente. Contate o suporte.' }
  }

  redirect('/dashboard')
}
