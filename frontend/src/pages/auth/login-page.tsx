import { useId, useState, type FormEvent } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import './login-page.css'

type Props = {
  onLogin: (
    username: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>
}

export function LoginPage({ onLogin }: Props) {
  const userId = useId()
  const passId = useId()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await onLogin(username, password)
      if (!result.ok) {
        setError(result.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page-root">
      <Card className="login-page-card">
        <CardHeader className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Projeto Amil</p>
          <CardTitle>Entrar</CardTitle>
          <CardDescription>
            Sistema Referente a Amil, com finalidade de gerenciar as comunicações com os clientes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Falha no login</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={userId}>Usuario</Label>
              <Input
                id={userId}
                type="text"
                name="username"
                autoComplete="username"
                placeholder="Seu usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={passId}>Senha</Label>
              <div className="relative">
                <Input
                  id={passId}
                  className="pr-10"
                  type={showPass ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-8 w-8"
                  onClick={() => setShowPass((v) => !v)}
                  disabled={loading}
                  aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Continuar'
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            &copy; 2026 Amil. Todos os direitos reservados.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
