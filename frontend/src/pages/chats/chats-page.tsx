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
import { AlertCircle, Check, CheckCheck, Send } from 'lucide-react'
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
}

type ChatMessage = {
  id: string
  at: string
  text: string
  fromMe: boolean
  status?: 'sent' | 'delivered' | 'read'
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

/** Telefone amigável se o JID for @s.whatsapp.net */
function phoneFromWhatsAppJid(jid: string): string | null {
  const m = /^(\d+)@s\.whatsapp\.net$/u.exec(jid)
  return m ? `+${m[1]}` : null
}

function chatActivitySig(c: ChatItem): string {
  return `${c.lastMessageAt ?? ''}|${c.lastMessage ?? ''}|${String(c.lastMessageFromMe)}`
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

  const selectedChatIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
    })

    socket.on('disconnect', () => {
      setSocketConnected(false)
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

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!selectedChat || !text.trim()) return
    setSending(true)
    try {
      const res = await apiFetch(`/api/chats/${encodeURIComponent(selectedChat.id)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        toast.error(`Erro ${String(res.status)} ao enviar mensagem.`)
        return
      }
      setText('')
    } catch {
      toast.error('Não foi possível enviar a mensagem.')
    } finally {
      setSending(false)
    }
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
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => setSelectedChatId(chat.id)}
                      className={cn(
                        'w-full rounded-md border p-3 text-left transition',
                        chat.id === selectedChatId
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted',
                      )}
                    >
                      <p className="truncate text-sm font-semibold leading-tight text-foreground">
                        {chat.displayName}
                      </p>
                      <p className="mt-1 line-clamp-3 text-xs leading-snug text-muted-foreground">
                        <span className="font-medium text-foreground/90">{author}</span>
                        <span className="text-muted-foreground"> · </span>
                        <span>{preview}</span>
                      </p>
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
                    id="chat-text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Digite a mensagem..."
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
      </div>
    </div>
  )
}
