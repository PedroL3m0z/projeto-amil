import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/auth-context'
import { cn } from '@/lib/utils'
import { ScrollText } from 'lucide-react'
import { toast } from 'sonner'

type AiContextPayload = {
  instructions: string
}

export function ContextoPage() {
  const { apiFetch } = useAuth()
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch('/api/settings/context')
        if (!res.ok) {
          toast.error('Não foi possível carregar o contexto.')
          return
        }
        const data = (await res.json()) as AiContextPayload
        if (cancelled) return
        setInstructions(data.instructions ?? '')
      } catch {
        if (!cancelled) toast.error('Erro ao carregar contexto.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiFetch])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/settings/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructions,
        } satisfies AiContextPayload),
      })
      if (!res.ok) {
        toast.error(`Erro ${String(res.status)} ao guardar contexto.`)
        return
      }
      toast.success('Contexto guardado com sucesso.')
    } catch {
      toast.error('Não foi possível guardar o contexto.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="contexto-page w-full space-y-8">
      <header className="flex flex-col gap-2 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <ScrollText className="h-5 w-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider">IA · Atendimento</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Contexto</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Defina o que a IA deve saber e como deve falar ao responder clientes automaticamente. Estas
            opções serão ligadas ao motor de respostas quando o backend estiver pronto.
          </p>
        </div>
        <Button type="button" onClick={() => void handleSave()} disabled={loading || saving}>
          Guardar contexto
        </Button>
      </header>

      <div className="grid gap-6">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Instruções principais</CardTitle>
            <CardDescription>
              Regras gerais de comportamento: o que fazer, o que evitar, prioridades e limites do bot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="ctx-instructions">Prompt de sistema (visão geral)</Label>
            <textarea
              id="ctx-instructions"
              className={cn(
                'min-h-[180px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm',
                'ring-offset-background placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
              placeholder="Ex.: És o assistente da clínica X. Respondes só a questões sobre marcações e informações públicas do site. Se não souberes, pedes contacto humano."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={loading || saving}
            />
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
