import { useAuth } from '@/contexts/auth-context'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LogOut, MessageSquare, ScrollText, Settings, Smartphone } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

export function AppShell() {
  const { user, logout } = useAuth()

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-muted/30">
      <div className="grid min-h-0 w-full flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-cols-[260px_1fr] lg:grid-rows-1">
        <aside className="flex h-full min-h-0 flex-col overflow-hidden border-b bg-background p-4 lg:border-b-0 lg:border-r">
          <div className="mb-6 shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Projeto Amil</p>
            <h1 className="mt-1 text-lg font-semibold">Painel Administrativo</h1>
            <p className="mt-1 truncate text-xs text-muted-foreground">{user?.username ?? 'Sem sessão'}</p>
          </div>

          <nav className="shrink-0 space-y-1 pr-0.5">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: 'ghost' }),
                  'w-full justify-start',
                  isActive && 'bg-accent text-accent-foreground',
                )
              }
            >
              <Smartphone className="h-4 w-4" />
              Sessão
            </NavLink>

            <NavLink
              to="/contexto"
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: 'ghost' }),
                  'w-full justify-start',
                  isActive && 'bg-accent text-accent-foreground',
                )
              }
            >
              <ScrollText className="h-4 w-4" />
              Contexto
            </NavLink>

            <NavLink
              to="/chats"
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: 'ghost' }),
                  'w-full justify-start',
                  isActive && 'bg-accent text-accent-foreground',
                )
              }
            >
              <MessageSquare className="h-4 w-4" />
              Chats
            </NavLink>

            <NavLink
              to="/configuracoes"
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: 'ghost' }),
                  'w-full justify-start',
                  isActive && 'bg-accent text-accent-foreground',
                )
              }
            >
              <Settings className="h-4 w-4" />
              Configurações
            </NavLink>
          </nav>

          <div className="min-h-0 flex-1" />

          <div className="shrink-0 rounded-lg border border-border/60 bg-muted/20 p-1">
            <button
              type="button"
              className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-start')}
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </aside>

        <main className="flex min-h-0 flex-col overflow-y-auto overflow-x-hidden p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
