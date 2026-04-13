import { AppShell } from '@/components/layout/app-shell'
import { useAuth } from '@/contexts/auth-context'
import { LoginPage } from '@/pages/auth/login-page'
import { ConfiguracoesPage } from '@/pages/configuracoes/configuracoes-page'
import { ContextoPage } from '@/pages/contexto/contexto-page'
import { ChatsPage } from '@/pages/chats/chats-page'
import { SessaoPage } from '@/pages/sessao/sessao-page'
import { Navigate, Route, Routes } from 'react-router-dom'
import { PrivateRoute } from './private-route'
import { PublicOnlyRoute } from './public-only-route'

export function AppRoutes() {
  const auth = useAuth()

  return (
    <Routes>
      <Route element={<PublicOnlyRoute isAuthenticated={Boolean(auth.user)} />}>
        <Route path="/login" element={<LoginPage onLogin={auth.login} />} />
      </Route>

      <Route element={<PrivateRoute isAuthenticated={Boolean(auth.user)} />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<SessaoPage />} />
          <Route path="/contexto" element={<ContextoPage />} />
          <Route path="/configuracoes" element={<ConfiguracoesPage />} />
          <Route path="/chats" element={<ChatsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={auth.user ? '/' : '/login'} replace />} />
    </Routes>
  )
}
