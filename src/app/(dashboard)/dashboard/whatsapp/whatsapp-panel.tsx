'use client'

import { useEffect, useState, useTransition, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { Smartphone, CheckCircle2, XCircle, RefreshCw, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  createInstance,
  disconnectInstance,
  syncStatus,
  type WhatsAppStatus,
  type WhatsAppActionResult,
} from './actions'

const initialResult: WhatsAppActionResult = {}

interface WhatsAppInstance {
  id: string
  instance_name: string
  status: WhatsAppStatus
  phone_number: string | null
}

interface WhatsAppPanelProps {
  instance: WhatsAppInstance | null
  initialQrBase64: string | null
}

export function WhatsAppPanel({ instance, initialQrBase64 }: WhatsAppPanelProps) {
  const router = useRouter()
  const [isSyncing, startSync] = useTransition()
  const [qrBase64, setQrBase64] = useState<string | null>(initialQrBase64)
  const [currentStatus, setCurrentStatus] = useState<WhatsAppStatus>(
    instance?.status ?? 'disconnected'
  )
  const [phoneNumber, setPhoneNumber] = useState<string | null>(
    instance?.phone_number ?? null
  )

  const [createState, createAction, createPending] = useActionState(createInstance, initialResult)
  const [disconnectState, disconnectAction, disconnectPending] = useActionState(disconnectInstance, initialResult)

  // Polling automático a cada 20s enquanto status = connecting
  useEffect(() => {
    if (currentStatus !== 'connecting') return

    const poll = () => {
      startSync(async () => {
        const result = await syncStatus()
        setCurrentStatus(result.status)
        if (result.qrBase64) setQrBase64(result.qrBase64)
        if (result.phoneNumber) setPhoneNumber(result.phoneNumber)
        if (result.status !== 'connecting') router.refresh()
      })
    }

    const interval = setInterval(poll, 20_000)
    return () => clearInterval(interval)
  }, [currentStatus, router])

  // Atualiza estado local após server actions
  useEffect(() => {
    if (createState.success) router.refresh()
  }, [createState.success, router])

  useEffect(() => {
    if (disconnectState.success) {
      setCurrentStatus('disconnected')
      setQrBase64(null)
      setPhoneNumber(null)
    }
  }, [disconnectState.success])

  const isLoading = createPending || disconnectPending || isSyncing

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">WhatsApp</h1>
        <p className="mt-1 text-sm text-foreground-secondary">
          Conecte o WhatsApp da sua empresa ao NexoAgent
        </p>
      </div>

      <div className="flex justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-6 p-8">

            {/* ── Sem instância ── */}
            {!instance && currentStatus === 'disconnected' && (
              <>
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
                  <Smartphone className="h-10 w-10 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-display text-lg font-semibold text-foreground">
                    Conectar WhatsApp
                  </p>
                  <p className="mt-1 text-sm text-foreground-secondary">
                    Escaneie o QR Code com seu WhatsApp para ativar o agente
                  </p>
                </div>
                {createState.error && (
                  <p className="text-sm text-danger">{createState.error}</p>
                )}
                <form action={createAction} className="w-full">
                  <Button type="submit" size="lg" className="w-full font-semibold" disabled={isLoading}>
                    {createPending ? 'Iniciando...' : 'Conectar WhatsApp'}
                  </Button>
                </form>
              </>
            )}

            {/* ── Connecting — exibe QR Code ── */}
            {currentStatus === 'connecting' && (
              <>
                <Badge variant="warning">Aguardando leitura do QR Code</Badge>

                {qrBase64 ? (
                  <div className="overflow-hidden rounded-2xl border-4 border-primary p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrBase64}
                      alt="QR Code WhatsApp"
                      className="h-56 w-56 object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-56 w-56 items-center justify-center rounded-2xl border-2 border-dashed border-border">
                    <RefreshCw className={`h-8 w-8 text-foreground-secondary/50 ${isSyncing ? 'animate-spin' : ''}`} />
                  </div>
                )}

                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo
                  </p>
                  <p className="mt-1 text-xs text-foreground-secondary">
                    O QR Code atualiza automaticamente a cada 20 segundos
                  </p>
                </div>

                <form action={disconnectAction} className="w-full">
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={isLoading}
                  >
                    Cancelar
                  </Button>
                </form>
              </>
            )}

            {/* ── Conectado ── */}
            {currentStatus === 'connected' && (
              <>
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-success/10">
                  <CheckCircle2 className="h-10 w-10 text-success" />
                </div>
                <div className="text-center">
                  <Badge variant="success" className="mb-3">Conectado</Badge>
                  <p className="font-display text-lg font-semibold text-foreground">
                    WhatsApp ativo
                  </p>
                  {phoneNumber && (
                    <p className="mt-1 text-sm text-foreground-secondary">
                      <Wifi className="mr-1 inline-block h-3.5 w-3.5" />
                      +{phoneNumber}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-foreground-secondary">
                    Seu agente está pronto para atender mensagens
                  </p>
                </div>
                {disconnectState.error && (
                  <p className="text-sm text-danger">{disconnectState.error}</p>
                )}
                <form action={disconnectAction} className="w-full">
                  <Button
                    type="submit"
                    variant="outline"
                    size="md"
                    className="w-full"
                    disabled={isLoading}
                  >
                    <XCircle className="mr-1.5 h-4 w-4" />
                    {disconnectPending ? 'Desconectando...' : 'Desconectar'}
                  </Button>
                </form>
              </>
            )}

            {/* ── Desconectado (instância existe) ── */}
            {instance && currentStatus === 'disconnected' && (
              <>
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-danger/10">
                  <XCircle className="h-10 w-10 text-danger" />
                </div>
                <div className="text-center">
                  <Badge variant="destructive" className="mb-3">Desconectado</Badge>
                  <p className="font-display text-lg font-semibold text-foreground">
                    Conexão encerrada
                  </p>
                  <p className="mt-1 text-sm text-foreground-secondary">
                    Reconecte para retomar o atendimento
                  </p>
                </div>
                {createState.error && (
                  <p className="text-sm text-danger">{createState.error}</p>
                )}
                <form action={createAction} className="w-full">
                  <Button type="submit" size="lg" className="w-full font-semibold" disabled={isLoading}>
                    {createPending ? 'Reconectando...' : 'Reconectar WhatsApp'}
                  </Button>
                </form>
              </>
            )}

          </CardContent>
        </Card>
      </div>
    </div>
  )
}
