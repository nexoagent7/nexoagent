import { redirect } from 'next/navigation'
import { Bot } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { AgentForm } from './agent-form'
import type { AgentConfigData } from './actions'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type UserProfile = {
  company_id: string | null
}

export default async function AgentPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data } = await supabase
    .from('user_profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const profile = data as UserProfile | null
  const companyId = profile?.company_id ?? null

  if (!companyId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Meu Agente</h1>
          <p className="mt-1 text-sm text-foreground-secondary">
            Configure a identidade e comportamento do seu agente IA
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Bot className="h-10 w-10 text-foreground-secondary/30" />
            <p className="mt-3 text-sm font-medium text-foreground-secondary">
              Conta não vinculada a uma empresa
            </p>
            <p className="mt-1 text-xs text-foreground-secondary">
              Entre em contato com o suporte para configurar sua empresa
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { data: agentData } = await supabase
    .from('agent_configs')
    .select('id, company_id, name, avatar_url, business_context, escalation_instructions, is_active')
    .eq('company_id', companyId)
    .single()

  const agentConfig = agentData as AgentConfigData | null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Meu Agente</h1>
          <p className="mt-1 text-sm text-foreground-secondary">
            Configure a identidade e comportamento do seu agente IA
          </p>
        </div>
        {!agentConfig && (
          <div className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-2">
            <p className="text-sm text-warning font-medium">Agente não configurado</p>
          </div>
        )}
      </div>

      <AgentForm companyId={companyId} initialData={agentConfig} />
    </div>
  )
}
