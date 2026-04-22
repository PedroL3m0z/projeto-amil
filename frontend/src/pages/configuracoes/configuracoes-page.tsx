import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/auth-context'
import { useTheme, type ThemePreference } from '@/contexts/theme-context'
import { cn } from '@/lib/utils'
import {
  KeyRound,
  Monitor,
  Moon,
  Palette,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react'
import { toast } from 'sonner'

type SettingsSummary = {
  geminiConfigured: boolean
  passwordOverriddenInRedis: boolean
}

type TabId = 'ia' | 'credenciais' | 'preferencias'

const TABS: { id: TabId; label: string; icon: typeof Sparkles; description: string }[] = [
  {
    id: 'ia',
    label: 'IA',
    icon: Sparkles,
    description: 'Modelos generativos usados pela plataforma.',
  },
  {
    id: 'credenciais',
    label: 'Credenciais',
    icon: ShieldCheck,
    description: 'Senha do utilizador e segurança de acesso.',
  },
  {
    id: 'preferencias',
    label: 'Preferências',
    icon: Palette,
    description: 'Aparência e comportamento do painel.',
  },
]

export function ConfiguracoesPage() {
  const { apiFetch } = useAuth()
  const { theme, setTheme, resolved } = useTheme()

  const [summary, setSummary] = useState<SettingsSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  const [geminiKey, setGeminiKey] = useState('')
  const [geminiSaving, setGeminiSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window === 'undefined') return 'ia'
    const hash = window.location.hash.replace('#', '') as TabId
    return TABS.some((t) => t.id === hash) ? hash : 'ia'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash.replace('#', '') !== activeTab) {
      window.history.replaceState(null, '', `#${activeTab}`)
    }
  }, [activeTab])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch('/api/settings')
        if (!cancelled && res.ok) {
          const data = (await res.json()) as SettingsSummary
          setSummary(data)
        }
      } catch {
        if (!cancelled) toast.error('Não foi possível carregar as configurações.')
      } finally {
        if (!cancelled) setSummaryLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiFetch])

  async function saveGemini(e: FormEvent) {
    e.preventDefault()
    setGeminiSaving(true)
    try {
      const res = await apiFetch('/api/settings/gemini', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: geminiKey }),
      })
      if (!res.ok) {
        toast.error(`Erro ${String(res.status)} ao guardar a chave.`)
        return
      }
      const cleared = geminiKey.trim().length === 0
      setGeminiKey('')
      const refreshed = await apiFetch('/api/settings')
      if (refreshed.ok) {
        setSummary((await refreshed.json()) as SettingsSummary)
      }
      toast.success(
        cleared
          ? 'Chave removida do Redis (se existia). Pode continuar a usar GEMINI_API_KEY no ambiente.'
          : 'Chave do Gemini guardada no Redis.',
      )
    } catch {
      toast.error('Falha ao guardar a chave.')
    } finally {
      setGeminiSaving(false)
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error('A confirmação da nova senha não coincide.')
      return
    }
    setPasswordSaving(true)
    try {
      const res = await apiFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.status === 403) {
        toast.error('Senha atual incorreta.')
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { message?: string } | null
        const msg =
          typeof err?.message === 'string'
            ? err.message
            : `Erro ${String(res.status)} ao alterar a senha.`
        toast.error(msg)
        return
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSummary((s) => (s ? { ...s, passwordOverriddenInRedis: true } : s))
      toast.success('Senha atualizada. Use a nova senha no próximo login.')
    } catch {
      toast.error('Não foi possível alterar a senha.')
    } finally {
      setPasswordSaving(false)
    }
  }

  const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'dark', label: 'Escuro', icon: Moon },
    { value: 'system', label: 'Sistema', icon: Monitor },
  ]

  const activeMeta = TABS.find((t) => t.id === activeTab) ?? TABS[0]

  return (
    <div className="w-full space-y-8 pb-2">
      <header className="flex flex-col gap-2 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <Settings2 className="h-5 w-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider">Painel</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Configurações</h2>
          <p className="max-w-xl text-sm text-muted-foreground">{activeMeta.description}</p>
        </div>
      </header>

      <Tabs
        value={activeTab}
        defaultValue="ia"
        onValueChange={(v) => setActiveTab(v as TabId)}
      >
        <TabsList className="w-full sm:w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="flex-1 sm:flex-none">
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="ia" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5 text-lg">
                <img
                  src="/gemini-color.png"
                  alt=""
                  width={48}
                  height={48}
                  decoding="async"
                  className="h-7 w-7 shrink-0 object-contain select-none"
                  aria-hidden
                />
                Google Gemini
              </CardTitle>
              <CardDescription>
                A chave é guardada no Redis do servidor. Não é mostrada de volta por segurança.
                {summaryLoading ? null : (
                  <span className="mt-2 block font-medium text-foreground">
                    Estado:{' '}
                    {summary?.geminiConfigured
                      ? 'configurada (Redis ou GEMINI_API_KEY no ambiente)'
                      : 'não configurada'}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void saveGemini(e)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="gemini-key">API key</Label>
                  <Input
                    id="gemini-key"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      summary?.geminiConfigured
                        ? '••••••••  (introduza uma nova chave para substituir)'
                        : 'AIza…'
                    }
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Deixe em branco e guarde para remover a chave do Redis (continua a valer
                    GEMINI_API_KEY no .env, se existir).
                  </p>
                </div>
                <Button type="submit" disabled={geminiSaving}>
                  {geminiSaving ? 'A guardar…' : 'Guardar chave'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credenciais" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5 text-primary" aria-hidden />
                Senha do utilizador
              </CardTitle>
              <CardDescription>
                Utilizador definido por AUTH_USERNAME no servidor. A nova senha fica em hash no
                Redis; até alterar, usa-se AUTH_PASSWORD do ambiente.
                {!summaryLoading && summary?.passwordOverriddenInRedis ? (
                  <span className="mt-2 block font-medium text-foreground">
                    A senha já foi personalizada (hash no Redis).
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void savePassword(e)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cur-pw">Senha atual</Label>
                  <Input
                    id="cur-pw"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-pw">Nova senha (mín. 8 caracteres)</Label>
                  <Input
                    id="new-pw"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conf-pw">Confirmar nova senha</Label>
                  <Input
                    id="conf-pw"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={passwordSaving}>
                  {passwordSaving ? 'A atualizar…' : 'Atualizar senha'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferencias" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Palette className="h-5 w-5 text-primary" aria-hidden />
                Tema
              </CardTitle>
              <CardDescription>
                Preferência guardada neste navegador. Agora:{' '}
                <strong className="text-foreground">
                  {resolved === 'dark' ? 'escuro' : 'claro'}
                </strong>
                {theme === 'system' ? ' (segue o sistema)' : null}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                {themeOptions.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      theme === value
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background hover:bg-muted/60',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                O modo escuro usa a classe <code className="rounded bg-muted px-1">dark</code> no
                documento, alinhado com o Tailwind do projeto.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
