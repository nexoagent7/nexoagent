'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { saveSectionAction, type SectionFormState } from './actions'
import type { Section } from './section-utils'

const initialState: SectionFormState = {}

interface SectionCardProps {
  companyId: string
  section: Section
}

export function SectionCard({ companyId, section }: SectionCardProps) {
  const [state, action, pending] = useActionState(saveSectionAction, initialState)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-base">{section.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-3">
          <input type="hidden" name="company_id" value={companyId} />
          <input type="hidden" name="section_title" value={section.title} />
          <textarea
            name="section_content"
            rows={5}
            defaultValue={section.content}
            disabled={pending}
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-secondary transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
          {state.error && (
            <p className="text-xs text-danger">{state.error}</p>
          )}
          {state.success && (
            <p className="text-xs text-success">{state.success}</p>
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
