import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { io } from 'socket.io-client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/auth-context'
import { cn } from '@/lib/utils'
import { AlertCircle, Check, CheckCheck, CircleCheck, Send, Sparkles, User } from 'lucide-react'
import { toast } from 'sonner'
import './chats-page.css'

type ChatItem = {
  id: string
  name: string | null
  displayName: string
  lastMessage: string | null
  lastMessageAt: string | null
  lastMessageFromMe?: boolean | null
  lastMessageAuthor?: string | null
  /** Mensagens do cliente ainda não abertas no painel (servidor). */
  unreadCount?: number
}

type ChatMessage = {
  id: string
  at: string
  text: string
  fromMe: boolean
  status?: 'sent' | 'delivered' | 'read'
}

type ChatTypingPayload = {
  chatId: string
  typing: boolean
  kind: 'composing' | 'recording' | null
}

type BotConnection = {
  state: 'conectando' | 'conectado' | 'desconectado'
  connected: boolean
  qr: string | null
  updatedAt: string
  lastError?: string | null
}

function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/** Hora curta para a lista de conversas (estilo WhatsApp). */
function formatListTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/** Telefone amigável se o JID for @s.whatsapp.net */
function phoneFromWhatsAppJid(jid: string): string | null {
  const m = /^(\d+)@s\.whatsapp\.net$/u.exec(jid)
  return m ? `+${m[1]}` : null
}

function chatActivitySig(c: ChatItem): string {
  return `${c.lastMessageAt ?? ''}|${c.lastMessage ?? ''}|${String(c.lastMessageFromMe)}`
}

function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn('chats-typing-dots', className)} aria-hidden>
      <span />
      <span />
      <span />
    </span>
  )
}

function lastActivityLine(chat: ChatItem): { author: string; preview: string } {
  const preview = chat.lastMessage?.trim() || 'Sem mensagens ainda'
  if (chat.lastMessageFromMe === true) {
    return { author: 'Você', preview }
  }
  if (chat.lastMessageFromMe === false) {
    const author =
      chat.lastMessageAuthor?.trim() || chat.displayName?.trim() || 'Contato'
    return { author, preview }
  }
  return { author: '—', preview }
}

export function ChatsPage() {
  const { apiFetch } = useAuth()
  const [chats, setChats] = useState<ChatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [socketConnected, setSocketConnected] = useState(false)
  const [botConnection, setBotConnection] = useState<BotConnection | null>(null)

  const [suggestion, setSuggestion] = useState('')
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)
  const [suggestionModel, setSuggestionModel] = useState<string | null>(null)
  /** Só fica true depois de clicar em «Gerar sugestão» neste chat (controla bloco de resultado + Aprovar). */
  const [suggestionRequested, setSuggestionRequested] = useState(false)

  const [typingByChatId, setTypingByChatId] = useState<
    Record<string, { typing: boolean; kind: 'composing' | 'recording' | null }>
  >({})

  const [avatarByChatId, setAvatarByChatId] = useState<Record<string, string | null>>({})
  const avatarFetchedRef = useRef(new Set<string>())

  const selectedChatIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const chatTextInputRef = useRef<HTMLInputElement | null>(null)
  const chatActivityRef = useRef<Map<string, string>>(new Map())
  const chatsHydratedRef = useRef(false)

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  )

  const selectedPhoneHint = selectedChat ? phoneFromWhatsAppJid(selectedChat.id) : null
  const showPhoneUnderTitle = Boolean(
    selectedChat && selectedPhoneHint && selectedPhoneHint !== selectedChat.displayName,
  )

  const selectedTyping =
    selectedChatId && typingByChatId[selectedChatId]?.typing
      ? typingByChatId[selectedChatId]
      : null

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId
  }, [selectedChatId])

  useEffect(() => {
    if (!selectedChatId && chats.length > 0) {
      setSelectedChatId(chats[0].id)
      return
    }
    if (selectedChatId && !chats.some((chat) => chat.id === selectedChatId)) {
      setSelectedChatId(chats[0]?.id ?? null)
    }
  }, [chats, selectedChatId])

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([])
      return
    }
    let cancelled = false
    setMessagesLoading(true)
    void (async () => {
      try {
        const res = await apiFetch(
          `/api/chats/${encodeURIComponent(selectedChatId)}/messages`,
        )
        if (!cancelled && res.ok) {
          const data = (await res.json()) as ChatMessage[]
          setMessages(data)
        }
      } catch {
        if (!cancelled) setMessages([])
      } finally {
        if (!cancelled) setMessagesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedChatId, apiFetch])

  useEffect(() => {
    if (!selectedChatId) return
    void (async () => {
      try {
        await apiFetch(`/api/chats/${encodeURIComponent(selectedChatId)}/read`, {
          method: 'POST',
        })
      } catch {
        /* ignore */
      }
    })()
  }, [selectedChatId, apiFetch])

  useEffect(() => {
    setSuggestion('')
    setSuggestionError(null)
    setSuggestionModel(null)
    setSuggestionLoading(false)
    setSuggestionRequested(false)
  }, [selectedChatId])

  async function fetchSuggestion() {
    const chatId = selectedChatId
    if (!chatId) return
    setSuggestionRequested(true)
    setSuggestionLoading(true)
    setSuggestionError(null)
    try {
      const res = await apiFetch(`/api/chats/${encodeURIComponent(chatId)}/suggest-reply`, {
        method: 'POST',
      })
      const raw = await res.text()
      let data: { suggestion?: string; model?: string; message?: string | string[] } = {}
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {}
      } catch {
        data = {}
      }
      if (selectedChatIdRef.current !== chatId) return
      if (!res.ok) {
        const msg =
          typeof data.message === 'string'
            ? data.message
            : Array.isArray(data.message)
              ? data.message.join(', ')
              : `Erro ${String(res.status)} ao gerar sugestão.`
        setSuggestion('')
        setSuggestionModel(null)
        setSuggestionError(msg)
        toast.error('Sugestão IA', { description: msg })
        return
      }
      if (typeof data.suggestion === 'string' && data.suggestion.trim()) {
        setSuggestion(data.suggestion.trim())
        setSuggestionModel(typeof data.model === 'string' ? data.model : null)
      } else {
        setSuggestion('')
        setSuggestionModel(null)
        setSuggestionError('Resposta inesperada do servidor.')
        toast.error('Sugestão IA', { description: 'Resposta inesperada do servidor.' })
      }
    } catch {
      if (selectedChatIdRef.current !== chatId) return
      const msg = 'Não foi possível obter a sugestão.'
      setSuggestionError(msg)
      toast.error('Sugestão IA', { description: msg })
    } finally {
      if (selectedChatIdRef.current === chatId) setSuggestionLoading(false)
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, selectedTyping?.typing, selectedTyping?.kind])

  useEffect(() => {
    for (const c of chats) {
      if (avatarFetchedRef.current.has(c.id)) continue
      avatarFetchedRef.current.add(c.id)
      void (async () => {
        let url: string | null = null
        try {
          const res = await apiFetch(`/api/chats/${encodeURIComponent(c.id)}/avatar`)
          if (res.ok) {
            const data = (await res.json()) as { url?: string | null }
            if (typeof data.url === 'string' && data.url.trim()) url = data.url.trim()
            else url = null
          }
        } catch {
          url = null
        }
        setAvatarByChatId((prev) => ({ ...prev, [c.id]: url }))
      })()
    }
  }, [chats, apiFetch])

  useEffect(() => {
    const backendUrl =
      window.location.port === '5173' ? 'http://localhost:3000' : window.location.origin

    const socket = io(`${backendUrl}/chats`, {
      withCredentials: true,
      transports: ['websocket'],
    })

    socket.on('connect', () => {
      setSocketConnected(true)
      setError(null)
      setTypingByChatId({})
    })

    socket.on('disconnect', () => {
      setSocketConnected(false)
      setTypingByChatId({})
    })

    socket.on('chat:typing', (payload: ChatTypingPayload) => {
      setTypingByChatId((prev) => ({
        ...prev,
        [payload.chatId]: {
          typing: payload.typing,
          kind: payload.kind ?? null,
        },
      }))
    })

    const snapshotChats = (data: ChatItem[]) => {
      chatActivityRef.current = new Map(data.map((c) => [c.id, chatActivitySig(c)]))
      chatsHydratedRef.current = true
      setChats(data)
    }

    socket.on('chats:list', (data: ChatItem[]) => {
      snapshotChats(data)
      setLoading(false)
    })

    socket.on('chats:updated', (data: ChatItem[]) => {
      setChats(data)
      if (!chatsHydratedRef.current) return
      const next = new Map<string, string>()
      for (const c of data) {
        const sig = chatActivitySig(c)
        const prev = chatActivityRef.current.get(c.id)
        next.set(c.id, sig)
        if (prev === sig) continue
        if (c.lastMessageFromMe !== false) continue
        if (c.id === selectedChatIdRef.current) continue
        const name = c.lastMessageAuthor?.trim() || c.displayName
        const preview = c.lastMessage?.trim() || 'Nova mensagem'
        toast.info(`Mensagem de ${name}`, { description: preview })
      }
      chatActivityRef.current = next
    })

    socket.on('chat:messages', (payload: { chatId: string; messages: ChatMessage[] }) => {
      if (payload.chatId === selectedChatIdRef.current) {
        setMessages(payload.messages)
      }
    })

    socket.on('bot:connection', (data: BotConnection) => {
      setBotConnection(data)
    })

    socket.on('connect_error', () => {
      setSocketConnected(false)
      setError('Não foi possível conectar ao websocket de chats.')
      void (async () => {
        try {
          const res = await apiFetch('/api/chats')
          if (res.ok) {
            const data = (await res.json()) as ChatItem[]
            chatActivityRef.current = new Map(data.map((c) => [c.id, chatActivitySig(c)]))
            chatsHydratedRef.current = true
            setChats(data)
          }
        } catch {
          /* ignore */
        } finally {
          setLoading(false)
        }
      })()
    })

    return () => {
      socket.disconnect()
    }
  }, [apiFetch])

  async function sendChatMessage(bodyText: string): Promise<boolean> {
    if (!selectedChat || !bodyText.trim()) return false
    setSending(true)
    try {
      const res = await apiFetch(`/api/chats/${encodeURIComponent(selectedChat.id)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: bodyText.trim() }),
      })
      if (!res.ok) {
        toast.error(`Erro ${String(res.status)} ao enviar mensagem.`)
        return false
      }
      return true
    } catch {
      toast.error('Não foi possível enviar a mensagem.')
      return false
    } finally {
      setSending(false)
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    const ok = await sendChatMessage(text)
    if (ok) setText('')
  }

  function handleApproveSuggestion() {
    const next = suggestion.trim()
    if (!next) return
    setText(next)
    window.setTimeout(() => {
      const el = chatTextInputRef.current
      if (!el) return
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    }, 0)
  }

  function renderOutboundStatus(status?: ChatMessage['status']) {
    if (status === 'read') {
      return <CheckCheck className="h-3.5 w-3.5 text-sky-300" aria-label="Lida" />
    }
    if (status === 'delivered') {
      return <CheckCheck className="h-3.5 w-3.5 text-white/80" aria-label="Entregue" />
    }
    return <Check className="h-3.5 w-3.5 text-white/80" aria-label="Enviada" />
  }

  return (
    <div className="chats-page">
      <div className="shrink-0">
        <h2 className="text-xl font-semibold">Chats</h2>
        <p className="text-sm text-muted-foreground">
          Socket: {socketConnected ? 'conectado' : 'desconectado'} | Bot: {botConnection?.state ?? 'desconhecido'}.
        </p>
      </div>

      <div className="chats-layout">
        <Card className="flex min-h-[200px] flex-col lg:h-full lg:min-h-0">
          <CardHeader className="shrink-0 pb-2">
            <CardTitle>Conversas</CardTitle>
            <CardDescription>Selecione um chat.</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col space-y-2 overflow-hidden px-4 pb-4 pt-0">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {!loading && !error && chats.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum chat disponível até o momento.</p>
            ) : null}
            {!loading && !error ? (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {chats.map((chat) => {
                  const { author, preview } = lastActivityLine(chat)
                  const unread = chat.unreadCount ?? 0
                  const timeLabel = chat.lastMessageAt ? formatListTime(chat.lastMessageAt) : ''
                  const rowTyping = typingByChatId[chat.id]
                  const avatarUrl = avatarByChatId[chat.id]
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => setSelectedChatId(chat.id)}
                      className={cn(
                        'flex w-full gap-3 rounded-md border p-3 text-left transition',
                        chat.id === selectedChatId
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted',
                      )}
                    >
                      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-border/80 bg-muted">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                            onError={() => {
                              setAvatarByChatId((prev) => ({ ...prev, [chat.id]: null }))
                            }}
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <User className="h-5 w-5" aria-hidden />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-tight text-foreground">
                          {chat.displayName}
                        </p>
                        {rowTyping?.typing ? (
                          <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-emerald-500">
                            {rowTyping.kind === 'recording' ? 'gravando áudio...' : 'digitando...'}
                          </p>
                        ) : (
                          <p className="mt-1 line-clamp-3 text-xs leading-snug text-muted-foreground">
                            <span className="font-medium text-foreground/90">{author}</span>
                            <span className="text-muted-foreground"> · </span>
                            <span>{preview}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
                        {timeLabel ? (
                          <span
                            className={cn(
                              'text-xs tabular-nums',
                              unread > 0 ? 'font-medium text-emerald-500' : 'text-muted-foreground',
                            )}
                          >
                            {timeLabel}
                          </span>
                        ) : null}
                        {unread > 0 ? (
                          <span
                            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm"
                            aria-label={`${String(unread)} mensagens novas`}
                          >
                            {unread > 99 ? '99+' : String(unread)}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="flex min-h-[min(55dvh,420px)] flex-col lg:h-full lg:min-h-0">
          <CardHeader className="shrink-0 border-b py-4">
            <CardTitle className="text-lg font-semibold">
              {selectedChat ? selectedChat.displayName : 'Chat'}
            </CardTitle>
            <CardDescription className="space-y-0.5 text-xs">
              {!selectedChat ? (
                <span>Selecione uma conversa na lista.</span>
              ) : (
                <>
                  {showPhoneUnderTitle && selectedPhoneHint ? (
                    <span className="block text-muted-foreground">{selectedPhoneHint}</span>
                  ) : null}
                  {selectedChat.lastMessageAt ? (
                    <span className="block text-muted-foreground">
                      Última atividade: {formatMessageTime(selectedChat.lastMessageAt)}
                    </span>
                  ) : null}
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-0 p-0">
            <div className="chats-thread relative min-h-0 flex-1 overflow-y-auto bg-[#0b141a] px-4 py-4">
              {messagesLoading ? (
                <div className="space-y-3">
                  <Skeleton className="ml-auto h-10 w-2/3" />
                  <Skeleton className="h-10 w-2/3" />
                  <Skeleton className="ml-auto h-10 w-1/2" />
                </div>
              ) : null}
              {!messagesLoading && selectedChat && messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  O bot só mostra o que aconteceu com ele ligado: não é o histórico completo do WhatsApp no celular.
                  Troque uma mensagem (texto ou mídia) neste chat com o bot conectado; figurinhas e áudios aparecem como
                  [Figurinha], [Áudio], etc.
                </p>
              ) : null}
              {!messagesLoading ? (
                <div className="flex flex-col gap-3">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn('flex w-full', m.fromMe ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        className={cn(
                          'max-w-[min(100%,32rem)] rounded-2xl px-3 py-2 text-sm shadow-sm',
                          m.fromMe
                            ? 'rounded-br-md border border-emerald-700 bg-emerald-800 text-white'
                            : 'rounded-bl-md border border-white/10 bg-[#202c33] text-white',
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <div
                          className={cn(
                            'mt-1 flex items-center justify-end gap-1 text-[11px] tabular-nums',
                            m.fromMe ? 'text-white/80' : 'text-white/60',
                          )}
                        >
                          <span>{formatMessageTime(m.at)}</span>
                          {m.fromMe ? renderOutboundStatus(m.status) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                  {selectedChat && selectedTyping?.typing ? (
                    <div className="flex w-full justify-start" role="status" aria-live="polite">
                      <span className="sr-only">
                        {selectedTyping.kind === 'recording'
                          ? 'Contato gravando áudio'
                          : 'Contato digitando'}
                      </span>
                      <div className="chats-thread-typing-bubble">
                        <TypingDots />
                      </div>
                    </div>
                  ) : null}
                  <div ref={messagesEndRef} />
                </div>
              ) : null}
            </div>

            <form
              onSubmit={(e) => void handleSend(e)}
              className="shrink-0 space-y-3 border-t bg-background p-4"
            >
              <div className="space-y-2">
                <Label htmlFor="chat-text">Mensagem</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    ref={chatTextInputRef}
                    id="chat-text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    disabled={!selectedChat || sending}
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    disabled={!selectedChat || !text.trim() || sending}
                    className="shrink-0"
                  >
                    <Send className="h-4 w-4" />
                    Enviar
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="flex min-h-[200px] flex-col lg:h-full lg:min-h-0">
          <CardHeader className="shrink-0 pb-2">
            <CardTitle className="flex items-center gap-2.5 text-lg">
              <img
                src="/gemini-color.png"
                alt=""
                width={48}
                height={48}
                decoding="async"
                className="h-6 w-6 shrink-0 object-contain select-none"
                aria-hidden
              />
              Sugestão IA
            </CardTitle>
            <CardDescription>
              Só chamamos o Gemini quando você clicar em <span className="font-medium text-foreground/90">Gerar sugestão</span>.
              A ideia de mensagem usa este chat, o que está em Configurações e o catálogo de planos — nada roda sozinho, para
              você não gastar tokens à toa.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-0">
            {!selectedChat ? (
              <p className="text-sm text-muted-foreground">Selecione uma conversa para usar a sugestão IA.</p>
            ) : null}
            {selectedChat ? (
              <Button
                type="button"
                className="shrink-0"
                disabled={!selectedChatId || suggestionLoading || messagesLoading}
                onClick={() => void fetchSuggestion()}
              >
                <Sparkles className="h-4 w-4" />
                Gerar sugestão
              </Button>
            ) : null}
            {selectedChat && suggestionRequested && suggestionLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-9 w-40" />
              </div>
            ) : null}
            {selectedChat && suggestionRequested && !suggestionLoading && suggestionError ? (
              <p className="text-sm text-destructive">{suggestionError}</p>
            ) : null}
            {selectedChat && suggestionRequested && !suggestionLoading && !suggestionError && suggestion ? (
              <>
                <div
                  className={cn(
                    'min-h-0 flex-1 rounded-lg border p-3 shadow-sm',
                    'bg-muted/70 border-border/80',
                    'dark:bg-zinc-950/85 dark:border-zinc-700/80 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]',
                  )}
                >
                  <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                    {suggestion}
                  </p>
                </div>
                {suggestionModel ? (
                  <p className="text-xs text-muted-foreground">Modelo: {suggestionModel}</p>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  disabled={!suggestion.trim() || suggestionLoading}
                  onClick={handleApproveSuggestion}
                >
                  <CircleCheck className="h-4 w-4" />
                  Aprovar sugestão
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
