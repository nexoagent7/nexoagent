'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export type RegisterState = { error?: string; success?: string }

export async function registerAction(
  _prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const name = (formData.get('name') as string).trim()
  const email = (formData.get('email') as string).trim()
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!name || !email || !password || !confirmPassword) {
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
  const { error: profileError } = await admin
    .from('user_profiles')
    .insert({ id: data.user.id, full_name: name, role: 'admin' })

  if (profileError) {
    return { error: 'Usuário criado, mas houve um erro ao salvar o perfil. Contate o suporte.' }
  }

  redirect('/dashboard')
}
