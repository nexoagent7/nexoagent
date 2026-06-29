'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type LoginState = { error?: string }

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = (formData.get('email') as string).trim()
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Preencha todos os campos.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'E-mail ou senha inválidos.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Erro ao obter sessão. Tente novamente.' }
  }

  console.log('[login] user.id:', user.id)
  console.log('[login] user.email:', user.email)

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  console.log('[login] profile:', profile)
  console.log('[login] profileError code:', profileError?.code)
  console.log('[login] profileError message:', profileError?.message)
  console.log('[login] profileError details:', profileError?.details)
  console.log('[login] profileError hint:', profileError?.hint)
  console.log('[login] role encontrado:', profile?.role)

  if (profile?.role === 'master') {
    console.log('[login] redirecionando para /master')
    redirect('/master')
  }

  console.log('[login] redirecionando para /dashboard')
  redirect('/dashboard')
}
