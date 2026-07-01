import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createAdminClient } from '@/lib/supabase/admin'

const PUBLIC_ROUTES = ['/', '/login', '/register']
const PUBLIC_PREFIXES = ['/api/whatsapp/webhook', '/api/cron']
const MASTER_PREFIX = '/master'
const DASHBOARD_PREFIX = '/dashboard'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rotas públicas passam direto sem sessão
  if (PUBLIC_ROUTES.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const { supabaseResponse, user, supabase } = await updateSession(request)

  // Sem sessão → redireciona para login
  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  console.log('[proxy] user.id:', user.id)

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  console.log('[proxy] profile:', profile)
  console.log('[proxy] profileError code:', profileError?.code)
  console.log('[proxy] profileError message:', profileError?.message)

  const role = profile?.role as string | undefined
  console.log('[proxy] role:', role, '| pathname:', pathname)

  // /master/* → apenas role = 'master'
  if (pathname.startsWith(MASTER_PREFIX)) {
    if (role !== 'master') {
      const forbidden = request.nextUrl.clone()
      forbidden.pathname = role === 'admin' || role === 'attendant'
        ? '/dashboard'
        : '/login'
      return NextResponse.redirect(forbidden)
    }
  }

  // /dashboard/* → role = 'admin' ou 'attendant'
  if (pathname.startsWith(DASHBOARD_PREFIX)) {
    if (role !== 'admin' && role !== 'attendant') {
      const forbidden = request.nextUrl.clone()
      forbidden.pathname = role === 'master' ? '/master' : '/login'
      return NextResponse.redirect(forbidden)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Ignora arquivos estáticos e internos do Next.js.
     * Processa apenas rotas de página e API.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
