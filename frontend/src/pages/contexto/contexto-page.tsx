import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { ScrollText } from 'lucide-react'
import { toast } from 'sonner'

type Tone = 'formal' | 'neutro' | 'informal'

const toneOptions: { value: Tone; label: string; hint: string }[] = [
  { value: 'formal', label: 'Formal', hint: 'Tratamento respeitoso e linguagem corporativa.' },
  { value: 'neutro', label: 'Neutro', hint: 'Claro e direto, sem ser frio nem informal demais.' },
  { value: 'informal', label: 'Leve', hint: 'Tom amigável, ainda profissional.' },
]

export function ContextoPage() {
  const [assistantName, setAssistantName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [knowledge, setKnowledge] = useState('')
  const [tone, setTone] = useState<Tone>('neutro')
  const [avoidPromises, setAvoidPromises] = useState(true)
  const [escalateMedical, setEscalateMedical] = useState(true)

  const handleSave = () => {
    toast.info('Ainda sem API: esta área é só a interface. A gravação no servidor virá a seguir.')
  }

  return (
    <div className="contexto-page mx-auto max-w-5xl space-y-8">
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
        <Button type="button" onClick={handleSave}>
          Guardar contexto
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/80 shadow-sm lg:col-span-2">
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
            />
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Conhecimento fixo</CardTitle>
            <CardDescription>
              Dados estáveis que a IA pode assumir como verdade: horários, localização, serviços, links
              oficiais.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="ctx-knowledge">Texto de referência</Label>
            <textarea
              id="ctx-knowledge"
              className={cn(
                'min-h-[200px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm',
                'ring-offset-background placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              placeholder="Cola aqui bullets ou parágrafos com informação que queres que a IA use nas respostas."
              value={knowledge}
              onChange={(e) => setKnowledge(e.target.value)}
            />
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Identidade e tom</CardTitle>
            <CardDescription>Como o assistente se apresenta e qual registo usa nas mensagens.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="ctx-name">Nome do assistente (opcional)</Label>
              <Input
                id="ctx-name"
                placeholder="Ex.: Ana · Suporte Amil"
                value={assistantName}
                onChange={(e) => setAssistantName(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <span className="text-sm font-medium">Tom das respostas</span>
              <div className="grid gap-2 sm:grid-cols-3">
                {toneOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTone(opt.value)}
                    className={cn(
                      'rounded-lg border px-3 py-3 text-left text-sm transition-colors',
                      'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      tone === opt.value
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border bg-background',
                    )}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <p className="mt-1 text-xs text-muted-foreground">{opt.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <span className="text-sm font-medium">Salvaguardas</span>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/80 bg-muted/20 p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-input"
                  checked={avoidPromises}
                  onChange={(e) => setAvoidPromises(e.target.checked)}
                />
                <span className="text-sm leading-snug">
                  <span className="font-medium">Evitar promessas comerciais</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    Não confirmar descontos, prazos legais ou condições sem validação humana.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/80 bg-muted/20 p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-input"
                  checked={escalateMedical}
                  onChange={(e) => setEscalateMedical(e.target.checked)}
                />
                <span className="text-sm leading-snug">
                  <span className="font-medium">Encaminhar temas sensíveis</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    Diagnósticos, medicação ou urgências: sugerir contacto com profissional ou linha
                    adequada.
                  </span>
                </span>
              </label>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Os valores acima existem só nesta página até existir endpoint para guardar e aplicar no bot.
      </p>
    </div>
  )
}
