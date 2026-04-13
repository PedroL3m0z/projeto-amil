import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type AuthUser = { username: string }

type AuthContextValue = {
  bootstrapping: boolean
  user: AuthUser | null
  login: (
    username: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>
  logout: () => Promise<void>
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [bootstrapping, setBootstrapping] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)

  const refreshMe = useCallback(async () => {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    if (!res.ok) {
      setUser(null)
      return
    }
    const data = (await res.json()) as { user: AuthUser | null }
    setUser(data.user ?? null)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await refreshMe()
      if (!cancelled) {
        setBootstrapping(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshMe])

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const message =
        res.status === 401
          ? 'Usuário ou senha incorretos.'
          : 'Não foi possível entrar. Tente de novo.'
      return { ok: false as const, message }
    }
    const data = (await res.json()) as { user: AuthUser }
    setUser(data.user)
    return { ok: true as const }
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
    setUser(null)
  }, [])

  const apiFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await fetch(input, { ...init, credentials: 'include' })
      if (res.status === 401) {
        setUser(null)
      }
      return res
    },
    [],
  )

  const value = useMemo(
    () => ({
      bootstrapping,
      user,
      login,
      logout,
      apiFetch,
    }),
    [bootstrapping, user, login, logout, apiFetch],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return ctx
}
