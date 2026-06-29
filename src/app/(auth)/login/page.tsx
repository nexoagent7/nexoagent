'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { loginAction, type LoginState } from './actions'

const initialState: LoginState = {}

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initialState)

  return (
    <main className="flex min-h-screen items-center justify-center bg-background-secondary px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary shadow-sm">
              <Bot className="h-6 w-6 text-primary-foreground" strokeWidth={2} />
            </div>
            <span className="font-display text-[2rem] font-bold tracking-tight text-foreground">
              NexoAgent
            </span>
          </div>
          <p className="text-sm text-foreground-secondary">
            Faça login para acessar sua conta
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-background p-8 shadow-sm">
          <form action={action} className="space-y-5" noValidate>

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-foreground">
                E-mail
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="seu@email.com"
                disabled={pending}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Senha
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                disabled={pending}
              />
            </div>

            {state.error && (
              <div className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3">
                <p className="text-sm text-danger">{state.error}</p>
              </div>
            )}

            <Button type="submit" size="lg" className="w-full font-semibold" disabled={pending}>
              {pending ? 'Entrando...' : 'Entrar'}
            </Button>

          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-foreground-secondary">
          Não tem conta?{' '}
          <Link
            href="/register"
            className="font-semibold text-primary hover:text-primary-hover transition-colors"
          >
            Criar conta
          </Link>
        </p>

      </div>
    </main>
  )
}
