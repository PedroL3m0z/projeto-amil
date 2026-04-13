import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { io } from 'socket.io-client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/auth-context'
import { AlertCircle, CheckCircle2, Loader2, Smartphone } from 'lucide-react'
import { toast } from 'sonner'

type BotConnectionResponse = {
  state: 'conectando' | 'conectado' | 'desconectado'
  connected: boolean
  qr: string | null
  updatedAt: string
  lastError?: string | null
}

function connectionSnapshotEqual(
  a: BotConnectionResponse,
  b: BotConnectionResponse,
): boolean {
  return (
    a.state === b.state &&
    a.connected === b.connected &&
    a.qr === b.qr &&
    a.updatedAt === b.updatedAt &&
    (a.lastError ?? '') === (b.lastError ?? '')
  )
}

function formatUpdatedAt(iso: string | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function stateLabel(state: BotConnectionResponse['state'] | undefined): string {
  switch (state) {
    case 'conectado':
      return 'Conectado'
    case 'conectando':
      return 'Conectando'
    case 'desconectado':
      return 'Desconectado'
    default:
      return 'Desconhecido'
  }
}

export function SessaoPage() {
  const { apiFetch } = useAuth()
  const [waStatus, setWaStatus] = useState<BotConnectionResponse | null>(null)
  const [waLoading, setWaLoading] = useState(true)
  const [waError, setWaError] = useState<string | null>(null)
  const [waQrDataUrl, setWaQrDataUrl] = useState<string | null>(null)
  const prevConnectionStateRef = useRef<BotConnectionResponse['state'] | null>(null)
  const lastFetchErrorRef = useRef<string | null>(null)
  const lastBotLastErrorRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const lastSnapshotRef = { current: null as BotConnectionResponse | null }
    const lastQrRawRef = { current: null as string | null }

    const applySnapshot = (data: BotConnectionResponse) => {
      const prev = lastSnapshotRef.current
      if (prev && connectionSnapshotEqual(prev, data)) {
        return
      }
      lastSnapshotRef.current = data
      if (cancelled) return
      setWaStatus(data)

      if (data.qr) {
        if (data.qr !== lastQrRawRef.current) {
          lastQrRawRef.current = data.qr
          void QRCode.toDataURL(data.qr, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 256,
          }).then((url) => {
            if (!cancelled) setWaQrDataUrl(url)
          })
        }
      } else {
        lastQrRawRef.current = null
        setWaQrDataUrl(null)
      }
    }

    const fetchOnce = async () => {
      try {
        const res = await apiFetch('/api/bot/connection')
        if (!res.ok) {
          if (!cancelled) {
            setWaError(`Erro ${String(res.status)} ao carregar o estado da sessão.`)
            setWaStatus(null)
            setWaQrDataUrl(null)
          }
          return
        }
        const data = (await res.json()) as BotConnectionResponse
        if (cancelled) return
        setWaError(null)
        applySnapshot(data)
      } catch {
        if (!cancelled) {
          setWaError('Não foi possível consultar a sessão do WhatsApp.')
          setWaStatus(null)
          setWaQrDataUrl(null)
        }
      } finally {
        if (!cancelled) setWaLoading(false)
      }
    }

    const backendUrl =
      window.location.port === '5173' ? 'http://localhost:3000' : window.location.origin

    const socket = io(`${backendUrl}/chats`, {
      withCredentials: true,
      transports: ['websocket'],
    })

    socket.on('bot:connection', (data: BotConnectionResponse) => {
      if (cancelled) return
      setWaError(null)
      applySnapshot(data)
      setWaLoading(false)
    })

    let didHttpFallback = false
    socket.on('connect_error', () => {
      if (cancelled || didHttpFallback) return
      didHttpFallback = true
      void fetchOnce()
    })

    void fetchOnce()

    return () => {
      cancelled = true
      socket.disconnect()
    }
  }, [apiFetch])

  useEffect(() => {
    if (!waStatus?.state) return
    const previous = prevConnectionStateRef.current
    if (previous === null) {
      prevConnectionStateRef.current = waStatus.state
      return
    }
    if (previous !== waStatus.state && waStatus.state === 'conectado') {
      toast.success('Sessão conectada ao WhatsApp.')
    }
    if (
      previous !== waStatus.state &&
      waStatus.state === 'desconectado' &&
      !waStatus.lastError?.trim()
    ) {
      toast.error('Sessão desconectada do WhatsApp.')
    }
    prevConnectionStateRef.current = waStatus.state
  }, [waStatus?.state, waStatus?.lastError])

  useEffect(() => {
    if (!waError) {
      lastFetchErrorRef.current = null
      return
    }
    if (lastFetchErrorRef.current !== waError) {
      toast.error(waError)
      lastFetchErrorRef.current = waError
    }
  }, [waError])

  useEffect(() => {
    const msg = waStatus?.lastError?.trim()
    if (!msg) {
      lastBotLastErrorRef.current = null
      return
    }
    if (lastBotLastErrorRef.current !== msg) {
      toast.error(msg)
      lastBotLastErrorRef.current = msg
    }
  }, [waStatus?.lastError])

  const state = waStatus?.state
  const badgeVariant =
    state === 'conectado' ? 'success' : state === 'conectando' ? 'secondary' : 'outline'

  return (
    <div className="sessao-page mx-auto w-full max-w-5xl space-y-8 pb-2">
      <header className="flex flex-col gap-2 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <Smartphone className="h-5 w-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider">WhatsApp</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sessão</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Autenticação e estado em tempo real da ligação do bot ao WhatsApp. Use o QR quando a sessão
            estiver aguardando pareamento.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className="text-xs text-muted-foreground">Última atualização</span>
          <span className="text-sm font-medium tabular-nums">
            {formatUpdatedAt(waStatus?.updatedAt)}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <Card className="overflow-hidden border-border/80 shadow-sm">
          <CardHeader className="space-y-3 bg-muted/30 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">Estado da sessão</CardTitle>
              {!waLoading && !waError ? (
                <Badge variant={badgeVariant}>{stateLabel(state)}</Badge>
              ) : null}
            </div>
            <CardDescription>
              O painel acompanha o mesmo estado reportado pelo servidor (REST e tempo real).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-2">
            {waLoading && !waStatus ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-24 w-full max-w-md rounded-lg" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : null}

            {waError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Não foi possível carregar</AlertTitle>
                <AlertDescription>{waError}</AlertDescription>
              </Alert>
            ) : null}

            {!waLoading && !waError && waStatus?.connected ? (
              <div className="flex gap-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-emerald-900 dark:text-emerald-100">Sessão ativa</p>
                  <p className="text-sm text-muted-foreground">
                    O bot está autenticado. Mensagens e eventos passam a refletir esta sessão até nova
                    desconexão ou troca de credenciais.
                  </p>
                </div>
              </div>
            ) : null}

            {!waLoading && !waError && !waStatus?.connected && waStatus?.state === 'conectando' ? (
              <div className="space-y-3 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-5">
                <div className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-5 w-5 animate-spin text-amber-600" aria-hidden />
                  A estabelecer ligação…
                </div>
                <p className="text-sm text-muted-foreground">
                  Depois de escanear o QR, o cliente encerra o pareamento e reconecta sozinho. Aguarde
                  alguns segundos até o estado passar a <strong className="text-foreground">Conectado</strong>.
                </p>
              </div>
            ) : null}

            {!waLoading && !waError && !waStatus?.connected && waStatus?.state === 'desconectado' ? (
              <p className="text-sm text-muted-foreground">
                Sessão inativa. Quando o servidor gerar um novo QR, ele aparece ao lado — escaneie com o
                WhatsApp em <strong className="text-foreground">Aparelhos conectados</strong>.
              </p>
            ) : null}

            <p className="border-t border-border/60 pt-4 text-xs text-muted-foreground">
              Estado bruto: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{waStatus?.state ?? '—'}</code>
            </p>
          </CardContent>
        </Card>

        <Card className="flex flex-col border-border/80 shadow-sm lg:sticky lg:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pareamento</CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              No telefone: WhatsApp → <strong className="text-foreground">Mais opções</strong> (⋮ ou ⚙) →{' '}
              <strong className="text-foreground">Aparelhos conectados</strong> →{' '}
              <strong className="text-foreground">Conectar um aparelho</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-4 pb-6 pt-0">
            {waLoading && !waStatus ? (
              <Skeleton className="h-[256px] w-[256px] rounded-xl" />
            ) : null}
            {!waLoading && !waError && waQrDataUrl ? (
              <div className="rounded-xl border bg-white p-3 shadow-inner dark:bg-zinc-950">
                <img
                  className="h-[256px] w-[256px]"
                  src={waQrDataUrl}
                  alt="Código QR para parear o WhatsApp"
                />
              </div>
            ) : null}
            {!waLoading && !waError && !waQrDataUrl && !waStatus?.connected ? (
              <p className="text-center text-sm text-muted-foreground">
                Aguardando geração do QR…
              </p>
            ) : null}
            {!waLoading && !waError && waStatus?.connected ? (
              <p className="text-center text-sm text-muted-foreground">
                Nenhum QR necessário enquanto a sessão estiver ativa.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
