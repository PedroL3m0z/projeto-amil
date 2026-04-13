import { Navigate, Outlet } from 'react-router-dom'

type PrivateRouteProps = {
  isAuthenticated: boolean
}

export function PrivateRoute({ isAuthenticated }: PrivateRouteProps) {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
