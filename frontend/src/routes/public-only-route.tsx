import { Navigate, Outlet } from 'react-router-dom'

type PublicOnlyRouteProps = {
  isAuthenticated: boolean
}

export function PublicOnlyRoute({ isAuthenticated }: PublicOnlyRouteProps) {
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
