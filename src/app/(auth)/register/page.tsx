'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { registerAction, type RegisterState } from './actions'

const initialState: RegisterState = {}

export default function RegisterPage() {
  const [state, action, pending] = useActionState(registerAction, initialState)

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">NexoAgent</h1>
          <p className="mt-2 text-sm text-gray-500">Crie sua conta para começar</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          {state.success ? (
            <div className="space-y-4 text-center">
              <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3">
                <p className="text-sm text-green-700">{state.success}</p>
              </div>
              <Link href="/login" className="text-sm font-semibold text-blue-600 hover:underline">
                Ir para o login
              </Link>
            </div>
          ) : (
            <form action={action} className="space-y-5" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Nome completo
                </label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  placeholder="João Silva"
                  disabled={pending}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
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
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Senha
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="Mínimo 6 caracteres"
                  disabled={pending}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirmar senha
                </label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="••••••••"
                  disabled={pending}
                />
              </div>

              {state.error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm text-red-700">{state.error}</p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Criando conta...' : 'Criar conta'}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Já tem conta?{' '}
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            Fazer login
          </Link>
        </p>
      </div>
    </main>
  )
}
