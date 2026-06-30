'use client'

import { useState, useEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent, UniqueIdentifier } from '@dnd-kit/core'
import { X, UserCircle, Bot, PhoneCall, CheckCircle, AlertCircle, GripVertical, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { closeConversation, escalateConversation, returnToAI } from './actions'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessageData = {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export type ConversationData = {
  id: string
  remote_jid: string
  contact_name: string | null
  status: string
  last_message_at: string | null
  created_at: string
  messages: MessageData[]
}

const COLUMN_KEYS = ['novo', 'ia', 'escalated', 'closed'] as const
type ColumnKey = typeof COLUMN_KEYS[number]

type ColumnsState = Record<ColumnKey, ConversationData[]>

interface KanbanBoardProps {
  novo: ConversationData[]
  ia: ConversationData[]
  escalated: ConversationData[]
  closed: ConversationData[]
}

// ─── Column config ────────────────────────────────────────────────────────────

type ColumnDef = {
  key: ColumnKey
  title: string
  borderColor: string
  badgeBg: string
  badgeText: string
  dotColor: string
  emptyText: string
  blocked: boolean
}

const COLUMNS: ColumnDef[] = [
  {
    key:         'novo',
    title:       'Novo',
    borderColor: '#3B82F6',
    badgeBg:     '#EFF6FF',
    badgeText:   '#1D4ED8',
    dotColor:    '#3B82F6',
    emptyText:   'Nenhuma conversa nova',
    blocked:     true,
  },
  {
    key:         'ia',
    title:       'IA Atendendo',
    borderColor: '#7BC81E',
    badgeBg:     '#F0FDF4',
    badgeText:   '#166534',
    dotColor:    '#7BC81E',
    emptyText:   'Nenhuma conversa em atendimento',
    blocked:     false,
  },
  {
    key:         'escalated',
    title:       'Aguardando Humano',
    borderColor: '#F59E0B',
    badgeBg:     '#FFFBEB',
    badgeText:   '#92400E',
    dotColor:    '#F59E0B',
    emptyText:   'Nenhuma conversa aguardando',
    blocked:     false,
  },
  {
    key:         'closed',
    title:       'Finalizado',
    borderColor: '#9CA3AF',
    badgeBg:     '#F9FAFB',
    badgeText:   '#6B7280',
    dotColor:    '#9CA3AF',
    emptyText:   'Nenhuma conversa finalizada',
    blocked:     false,
  },
]

const COL_BY_KEY = Object.fromEntries(
  COLUMNS.map(c => [c.key, c])
) as Record<ColumnKey, ColumnDef>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayName(conv: ConversationData): string {
  return conv.contact_name ?? conv.remote_jid.replace(/@s\.whatsapp\.net$/, '')
}

function lastPreview(conv: ConversationData): string {
  if (conv.messages.length === 0) return 'Sem mensagens'
  const last = conv.messages[conv.messages.length - 1]
  const prefix = last.role === 'assistant' ? 'IA: ' : ''
  const text = last.content.length > 58 ? last.content.slice(0, 55) + '…' : last.content
  return prefix + text
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'agora'
  const m = Math.floor(diff / 60)
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

function msgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ─── ConvCard (pure display) ──────────────────────────────────────────────────

function ConvCard({
  conv,
  dot,
  onClick,
  muted = false,
}: {
  conv: ConversationData
  dot: string
  onClick: () => void
  muted?: boolean
}) {
  return (
    <div
      className={`w-full rounded-xl border border-border bg-background p-3 shadow-sm transition-shadow hover:shadow-md ${muted ? 'opacity-30' : ''}`}
    >
      {/* Drag handle row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
          <span className="truncate text-sm font-semibold text-foreground">
            {displayName(conv)}
          </span>
        </div>
        <span
          className="shrink-0 text-[11px] text-foreground-secondary"
          suppressHydrationWarning
        >
          {relativeTime(conv.last_message_at ?? conv.created_at)}
        </span>
      </div>
      {/* Preview */}
      <p className="mt-1.5 line-clamp-2 text-xs text-foreground-secondary">
        {lastPreview(conv)}
      </p>
      {/* Click target (invisible, covers full card) */}
      <button
        type="button"
        aria-label={`Abrir conversa de ${displayName(conv)}`}
        onClick={e => { e.stopPropagation(); onClick() }}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
    </div>
  )
}

// ─── DraggableCard ────────────────────────────────────────────────────────────

function DraggableCard({
  conv,
  dot,
  onClick,
}: {
  conv: ConversationData
  dot: string
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: conv.id })

  return (
    <div
      ref={setNodeRef}
      className="relative touch-none"
      {...attributes}
      {...listeners}
    >
      <ConvCard conv={conv} dot={dot} onClick={onClick} muted={isDragging} />
      {/* Grab icon overlay */}
      <GripVertical className="pointer-events-none absolute right-3 top-3 h-3.5 w-3.5 text-foreground-secondary/40" />
    </div>
  )
}

// ─── DroppableColumn ──────────────────────────────────────────────────────────

function DroppableColumn({
  columnKey,
  blocked,
  children,
}: {
  columnKey: ColumnKey
  blocked: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey })

  const highlight =
    isOver && !blocked
      ? 'bg-primary/5 ring-2 ring-inset ring-primary/20'
      : isOver && blocked
      ? 'bg-red-50 ring-2 ring-inset ring-red-200'
      : ''

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto space-y-2.5 pr-0.5 min-h-20 rounded-xl transition-colors duration-150 ${highlight}`}
    >
      {children}
    </div>
  )
}

// ─── Conversation Panel ───────────────────────────────────────────────────────

function statusLabel(conv: ConversationData): { text: string; cls: string } {
  if (conv.status === 'closed')    return { text: 'Finalizado',         cls: 'bg-gray-100 text-gray-500' }
  if (conv.status === 'escalated') return { text: 'Aguardando Humano',  cls: 'bg-amber-100 text-amber-700' }
  if (conv.messages.some(m => m.role === 'assistant'))
                                   return { text: 'IA Atendendo',       cls: 'bg-green-100 text-green-700' }
  return                                  { text: 'Novo',               cls: 'bg-blue-100 text-blue-700' }
}

function ConvPanel({
  conv,
  onClose,
}: {
  conv: ConversationData | null
  onClose: () => void
}) {
  const [isPending, setIsPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const isOpen = conv !== null

  useEffect(() => {
    setActionError(null)
    if (conv && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [conv?.id])

  async function runAction(fn: (id: string) => Promise<{ error?: string; success?: boolean }>) {
    if (!conv || isPending) return
    setActionError(null)
    setIsPending(true)
    const result = await fn(conv.id)
    setIsPending(false)
    if (result.error) {
      setActionError(result.error)
    } else {
      onClose()
    }
  }

  const isClosed    = conv?.status === 'closed'
  const isEscalated = conv?.status === 'escalated'
  const label       = conv ? statusLabel(conv) : null

  return (
    <div
      className={`fixed inset-0 z-50 ${isOpen ? '' : 'pointer-events-none'}`}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col bg-background shadow-2xl transition-transform duration-200 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {conv && (
          <>
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <UserCircle className="h-5 w-5 shrink-0 text-foreground-secondary" />
                  <h2 className="truncate font-display text-base font-semibold text-foreground">
                    {displayName(conv)}
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-foreground-secondary">
                  {conv.remote_jid.replace(/@s\.whatsapp\.net$/, '')}
                </p>
                {label && (
                  <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${label.cls}`}>
                    {label.text}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-foreground-secondary transition-colors hover:bg-background-secondary hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Messages */}
            <div ref={chatRef} className="flex-1 overflow-y-auto space-y-3 px-4 py-4">
              {conv.messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                  <Bot className="h-8 w-8 text-foreground-secondary/30" />
                  <p className="mt-2 text-sm text-foreground-secondary">Nenhuma mensagem ainda</p>
                </div>
              ) : (
                conv.messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'assistant' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[78%] rounded-2xl px-3 py-2 ${
                        msg.role === 'assistant'
                          ? 'rounded-br-sm bg-[#7BC81E]/10'
                          : 'rounded-bl-sm bg-background-secondary'
                      }`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="mb-1 flex items-center gap-1">
                          <Bot className="h-3 w-3 text-[#7BC81E]" />
                          <span className="text-[10px] font-medium text-[#7BC81E]">IA</span>
                        </div>
                      )}
                      <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                      <span className="mt-1 block text-right text-[10px] text-foreground-secondary">
                        {msgTime(msg.created_at)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-border px-4 py-3 space-y-2">
              {actionError && (
                <div className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
                  <p className="text-xs text-danger">{actionError}</p>
                </div>
              )}
              {isClosed ? (
                <p className="text-center text-sm text-foreground-secondary py-1">
                  Conversa encerrada
                </p>
              ) : (
                <div className="flex gap-2">
                  {!isEscalated && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      disabled={isPending}
                      onClick={() => runAction(escalateConversation)}
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      Assumir conversa
                    </Button>
                  )}
                  {isEscalated && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      disabled={isPending}
                      onClick={() => runAction(returnToAI)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Devolver para IA
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5"
                    disabled={isPending}
                    onClick={() => runAction(closeConversation)}
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    {isPending ? 'Salvando…' : 'Marcar como Finalizado'}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-xl bg-foreground px-5 py-3 shadow-xl">
      <p className="text-sm font-medium text-background">{message}</p>
    </div>
  )
}

// ─── KanbanBoard ──────────────────────────────────────────────────────────────

export function KanbanBoard({ novo, ia, escalated, closed }: KanbanBoardProps) {
  const [columns, setColumns] = useState<ColumnsState>({ novo, ia, escalated, closed })
  const [selected, setSelected] = useState<ConversationData | null>(null)
  const [dragging, setDragging] = useState<{ conv: ConversationData; dot: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync when server re-renders after revalidatePath
  useEffect(() => {
    setColumns({ novo, ia, escalated, closed })
  }, [novo, ia, escalated, closed])

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }, // require 6px movement to start drag
    })
  )

  function handleDragStart(event: DragStartEvent) {
    const convId = event.active.id as string
    for (const col of COLUMNS) {
      const conv = columns[col.key].find(c => c.id === convId)
      if (conv) {
        setDragging({ conv, dot: col.dotColor })
        return
      }
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(null)

    const { active, over } = event
    if (!over) return

    const convId    = active.id as UniqueIdentifier
    const targetKey = over.id as ColumnKey

    if (!COLUMN_KEYS.includes(targetKey)) return

    // Find source column
    let sourceKey: ColumnKey | null = null
    let sourceConv: ConversationData | null = null

    for (const key of COLUMN_KEYS) {
      const found = columns[key].find(c => c.id === convId)
      if (found) { sourceKey = key; sourceConv = found; break }
    }

    if (!sourceKey || !sourceConv || sourceKey === targetKey) return

    // "Novo" is always blocked; "IA Atendendo" only accepts cards from "escalated"
    if (targetKey === 'novo') {
      showToast('A coluna "Novo" é gerenciada automaticamente pelo sistema.')
      return
    }
    if (targetKey === 'ia' && sourceKey !== 'escalated') {
      showToast('Só é possível devolver para "IA Atendendo" conversas que estejam em "Aguardando Humano".')
      return
    }

    const movedConv = sourceConv
    const fromKey   = sourceKey

    const newStatus =
      targetKey === 'closed'    ? 'closed'    :
      targetKey === 'escalated' ? 'escalated' :
      /* ia */                    'open'

    const action =
      targetKey === 'closed'    ? closeConversation    :
      targetKey === 'escalated' ? escalateConversation :
      /* ia */                    returnToAI

    // Optimistic update
    setColumns(prev => ({
      ...prev,
      [fromKey]:   prev[fromKey].filter(c => c.id !== convId),
      [targetKey]: [{ ...movedConv, status: newStatus }, ...prev[targetKey]],
    }))

    // Background action — revert on error
    void (async () => {
      const result = await action(String(convId))
      if (result.error) {
        setColumns(prev => ({
          ...prev,
          [targetKey]: prev[targetKey].filter(c => c.id !== convId),
          [fromKey]:   [movedConv, ...prev[fromKey]],
        }))
        showToast(result.error)
      }
    })()
  }

  function handleDragCancel() {
    setDragging(null)
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex h-full gap-4 overflow-x-auto pb-4">
          {COLUMNS.map(col => {
            const items = columns[col.key]
            return (
              <div key={col.key} className="flex h-full w-72 shrink-0 flex-col gap-3">
                {/* Column header */}
                <div
                  className="flex shrink-0 items-center justify-between rounded-xl border-l-4 bg-background px-4 py-3 shadow-sm"
                  style={{ borderLeftColor: col.borderColor }}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.dotColor }} />
                    <h3 className="text-sm font-semibold text-foreground">{col.title}</h3>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{ backgroundColor: col.badgeBg, color: col.badgeText }}
                  >
                    {items.length}
                  </span>
                </div>

                {/* Droppable area */}
                <DroppableColumn columnKey={col.key} blocked={col.blocked}>
                  {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
                      <p className="text-xs text-foreground-secondary">{col.emptyText}</p>
                    </div>
                  ) : (
                    items.map(conv => (
                      <DraggableCard
                        key={conv.id}
                        conv={conv}
                        dot={col.dotColor}
                        onClick={() => setSelected(conv)}
                      />
                    ))
                  )}
                </DroppableColumn>
              </div>
            )
          })}
        </div>

        {/* Drag overlay — follows cursor */}
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="w-72 rotate-1 scale-105 cursor-grabbing shadow-2xl">
              <ConvCard
                conv={dragging.conv}
                dot={dragging.dot}
                onClick={() => {}}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <ConvPanel conv={selected} onClose={() => setSelected(null)} />
      <Toast message={toast} />
    </>
  )
}
