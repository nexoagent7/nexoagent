'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { saveAgentConfigAction, type AgentConfigData, type AgentFormState } from './actions'
import { SectionCard } from './section-card'
import { parseBusinessContext } from './section-utils'

const MAX_CONTEXT_CHARS = 10_000
const initialState: AgentFormState = {}

interface AgentFormProps {
  companyId: string
  initialData: AgentConfigData | null
}

export function AgentForm({ companyId, initialData }: AgentFormProps) {
  const [mainState, mainAction, mainPending] = useActionState(saveAgentConfigAction, initialState)
  const [ctxState,  ctxAction,  ctxPending]  = useActionState(saveAgentConfigAction, initialState)

  const [contextLength, setContextLength] = useState(
    initialData?.business_context?.length ?? 0
  )
  const [avatarPreview, setAvatarPreview] = useState(
    initialData?.agent_avatar_url ?? ''
  )
  const [activeTab, setActiveTab] = useState<'sections' | 'advanced'>('sections')

  const sections = parseBusinessContext(initialData?.business_context ?? '')
  const hasSections = sections.length > 0

  return (
    <div className="space-y-6">

      {/* ── Identidade + Escalada (form principal) ────────────────────── */}
      <form action={mainAction} className="space-y-6">
        <input type="hidden" name="company_id"        value={companyId} />
        {/* Garante que o business_context não seja apagado ao salvar identidade/escalada */}
        <input type="hidden" name="business_context"  value={initialData?.business_context ?? ''} />

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
                disabled={mainPending}
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
                  disabled={mainPending}
                  onChange={(e) => setAvatarPreview(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Instruções de escalada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <p className="text-xs text-foreground-secondary">
              Quando o agente deve transferir o atendimento para um humano?
            </p>
            <textarea
              id="escalation_instructions"
              name="escalation_instructions"
              rows={4}
              placeholder="Transfira para um humano quando o cliente pedir para falar com um atendente, quando houver reclamação grave, ou quando a negociação envolver valores acima de R$..."
              defaultValue={initialData?.escalation_instructions ?? ''}
              disabled={mainPending}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-secondary transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
          </CardContent>
        </Card>

        {mainState.error && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3">
            <p className="text-sm text-danger">{mainState.error}</p>
          </div>
        )}
        {mainState.success && (
          <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3">
            <p className="text-sm text-success">{mainState.success}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={mainPending} className="min-w-40 font-semibold">
            {mainPending ? 'Salvando...' : 'Salvar configurações'}
          </Button>
        </div>
      </form>

      {/* ── Contexto do negócio (separado, com tabs) ──────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="font-display text-base">Contexto do negócio</CardTitle>
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setActiveTab('sections')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                activeTab === 'sections'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground-secondary hover:text-foreground',
              )}
            >
              Por seção
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('advanced')}
              className={cn(
                'border-l border-border px-3 py-1.5 text-xs font-medium transition-colors',
                activeTab === 'advanced'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground-secondary hover:text-foreground',
              )}
            >
              Avançado
            </button>
          </div>
        </CardHeader>

        <CardContent>
          {activeTab === 'sections' ? (
            hasSections ? (
              <div className="space-y-4">
                {sections.map((s) => (
                  <SectionCard key={s.title} companyId={companyId} section={s} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm font-medium text-foreground-secondary">
                  Nenhuma seção detectada
                </p>
                <p className="mt-1 text-xs text-foreground-secondary">
                  Use a aba{' '}
                  <strong>Avançado</strong> e separe o conteúdo com marcadores{' '}
                  <code className="rounded bg-border px-1 py-0.5 font-mono">## Título da seção</code>
                </p>
              </div>
            )
          ) : (
            <form action={ctxAction} className="space-y-3">
              <input type="hidden" name="company_id"               value={companyId} />
              <input type="hidden" name="agent_name"               value={initialData?.agent_name ?? ''} />
              <input type="hidden" name="agent_avatar_url"         value={initialData?.agent_avatar_url ?? ''} />
              <input type="hidden" name="escalation_instructions"  value={initialData?.escalation_instructions ?? ''} />

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-foreground-secondary">
                    Separe seções com{' '}
                    <code className="rounded bg-border px-1 font-mono">## Título da seção</code>
                  </p>
                  <span className={cn(
                    'text-xs',
                    contextLength > MAX_CONTEXT_CHARS ? 'text-danger' : 'text-foreground-secondary',
                  )}>
                    {contextLength.toLocaleString('pt-BR')} / {MAX_CONTEXT_CHARS.toLocaleString('pt-BR')}
                  </span>
                </div>
                <textarea
                  name="business_context"
                  rows={14}
                  maxLength={MAX_CONTEXT_CHARS}
                  required
                  placeholder={'## Empresa\nSomos a [empresa], especializada em...\n\n## Produtos\nTemos os seguintes produtos...'}
                  defaultValue={initialData?.business_context ?? ''}
                  disabled={ctxPending}
                  onChange={(e) => setContextLength(e.target.value.length)}
                  className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-secondary transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {ctxState.error && (
                <div className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3">
                  <p className="text-sm text-danger">{ctxState.error}</p>
                </div>
              )}
              {ctxState.success && (
                <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3">
                  <p className="text-sm text-success">{ctxState.success}</p>
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={ctxPending} className="font-semibold">
                  {ctxPending ? 'Salvando...' : 'Salvar contexto'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
