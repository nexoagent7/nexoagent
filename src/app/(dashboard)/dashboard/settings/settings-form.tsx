'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { saveSettingsAction, type SettingsData, type SettingsFormState } from './actions'

const SEGMENTO_OPTIONS = [
  'Educação',
  'Saúde',
  'Varejo',
  'Ministério/Igreja',
  'Prestador de serviço',
  'Outro',
]

const initialState: SettingsFormState = {}

const selectClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50'

interface SettingsFormProps {
  initialData: SettingsData | null
}

export function SettingsForm({ initialData }: SettingsFormProps) {
  const [state, action, pending] = useActionState(saveSettingsAction, initialState)

  return (
    <form action={action} className="space-y-6">
      {/* Dados da empresa */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Dados da empresa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="name" className="block text-sm font-medium text-foreground">
              Nome da empresa
            </label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Ex: Livraria Esperança"
              defaultValue={initialData?.name ?? ''}
              disabled={pending}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="segmento" className="block text-sm font-medium text-foreground">
              Segmento
            </label>
            <select
              id="segmento"
              name="segmento"
              defaultValue={initialData?.segmento ?? ''}
              disabled={pending}
              className={selectClass}
            >
              <option value="">Selecione um segmento...</option>
              {SEGMENTO_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="logo_url" className="block text-sm font-medium text-foreground">
              Logo da empresa{' '}
              <span className="font-normal text-foreground-secondary">(URL da imagem)</span>
            </label>
            <Input
              id="logo_url"
              name="logo_url"
              type="url"
              placeholder="https://exemplo.com/logo.png"
              defaultValue={initialData?.logo_url ?? ''}
              disabled={pending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notificações */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Notificações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="manager_whatsapp" className="block text-sm font-medium text-foreground">
              WhatsApp do gestor
            </label>
            <p className="text-xs text-foreground-secondary">
              Número que receberá aviso quando o agente transferir um atendimento para humano.
            </p>
            <Input
              id="manager_whatsapp"
              name="manager_whatsapp"
              type="text"
              placeholder="+5511999999999"
              defaultValue={initialData?.manager_whatsapp ?? ''}
              disabled={pending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Integrações */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Integrações</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground-secondary">
            Em breve: conecte seu Google Calendar, chave de API própria e outros serviços.
          </p>
        </CardContent>
      </Card>

      {/* Feedback */}
      {state.error && (
        <div className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3">
          <p className="text-sm text-danger">{state.error}</p>
        </div>
      )}
      {state.success && (
        <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3">
          <p className="text-sm text-success">{state.success}</p>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending} className="min-w-40 font-semibold">
          {pending ? 'Salvando...' : 'Salvar configurações'}
        </Button>
      </div>
    </form>
  )
}
