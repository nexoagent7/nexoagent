'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { subscribeAction, type SubscribeState } from './actions'

const initialState: SubscribeState = {}

interface SubscribeButtonProps {
  planId: string
  label: string
  disabled?: boolean
}

export function SubscribeButton({ planId, label, disabled }: SubscribeButtonProps) {
  const [state, action, pending] = useActionState(subscribeAction, initialState)

  return (
    <form action={action} className="w-full">
      <input type="hidden" name="plan_id" value={planId} />
      {state.error && (
        <p className="mb-2 text-center text-xs text-danger">{state.error}</p>
      )}
      <Button
        type="submit"
        className="w-full font-semibold"
        disabled={disabled || pending}
      >
        {pending ? 'Aguarde...' : label}
      </Button>
    </form>
  )
}
