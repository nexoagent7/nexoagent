'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { saveAgentConfigAction, type AgentConfigData, type AgentFormState } from './actions'

const MAX_CONTEXT_CHARS = 10_000
const initialState: AgentFormState = {}

interface AgentFormProps {
  companyId: string
  initialData: AgentConfigData | null
}

export function AgentForm({ companyId, initialData }: AgentFormProps) {
  const [state, action, pending] = useActionState(saveAgentConfigAction, initialState)
  const [contextLength, setContextLength] = useState(
    initialData?.business_context?.length ?? 0
  )
  const [avatarPreview, setAvatarPreview] = useState(
    initialData?.agent_avatar_url ?? ''
  )

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="company_id" value={companyId} />

      {/* Identidade */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Identidade do agente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="agent_name" className="block text-sm font-medium text-foreground">
              Nome do agente
            </label>
            <Input
              id="agent_name"
              name="agent_name"
              type="text"
              required
              placeholder="Ex: Sofia, Max, Atendente Virtual..."
              defaultValue={initialData?.agent_name ?? ''}
              disabled={pending}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="agent_avatar_url" className="block text-sm font-medium text-foreground">
              Foto do agente{' '}
              <span className="font-normal text-foreground-secondary">(URL da imagem)</span>
            </label>
            <div className="flex items-center gap-4">
              {avatarPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarPreview}
                  alt="Preview do agente"
                  className="h-16 w-16 shrink-0 rounded-xl border border-border object-cover"
                />
              )}
              <Input
                id="agent_avatar_url"
                name="agent_avatar_url"
                type="url"
                placeholder="https://exemplo.com/foto.png"
                defaultValue={initialData?.agent_avatar_url ?? ''}
                disabled={pending}
                onChange={(e) => setAvatarPreview(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contexto */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Treinamento do agente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="business_context" className="block text-sm font-medium text-foreground">
                Contexto do negócio
              </label>
              <span
                className={
                  contextLength > MAX_CONTEXT_CHARS
                    ? 'text-xs text-danger'
                    : 'text-xs text-foreground-secondary'
                }
              >
                {contextLength.toLocaleString('pt-BR')} / {MAX_CONTEXT_CHARS.toLocaleString('pt-BR')}
              </span>
            </div>
            <p className="text-xs text-foreground-secondary">
              Descreva sua empresa, produtos, serviços, público-alvo, horários e diferenciais.
            </p>
            <textarea
              id="business_context"
              name="business_context"
              rows={12}
              maxLength={MAX_CONTEXT_CHARS}
              required
              placeholder="Somos a [empresa], especializada em... Nossos produtos são... Atendemos clientes que... Funcionamos de segunda a sexta das..."
              defaultValue={initialData?.business_context ?? ''}
              disabled={pending}
              onChange={(e) => setContextLength(e.target.value.length)}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-secondary transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="escalation_instructions" className="block text-sm font-medium text-foreground">
              Instruções de escalada
            </label>
            <p className="text-xs text-foreground-secondary">
              Quando o agente deve transferir o atendimento para um humano?
            </p>
            <textarea
              id="escalation_instructions"
              name="escalation_instructions"
              rows={4}
              placeholder="Transfira para um humano quando o cliente pedir para falar com um atendente, quando houver reclamação grave, ou quando a negociação envolver valores acima de R$..."
              defaultValue={initialData?.escalation_instructions ?? ''}
              disabled={pending}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-secondary transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
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
