import { useAuth } from '@/contexts/auth-context'
import { AppRoutes } from '@/routes/app-routes'
import { Skeleton } from '@/components/ui/skeleton'
import { Toaster } from 'sonner'

function BootstrapScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex w-full max-w-sm flex-col gap-3 px-6" role="status" aria-live="polite">
        <Skeleton className="h-10 w-32 self-center" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  )
}

export default function App() {
  const auth = useAuth()

  if (auth.bootstrapping) {
    return <BootstrapScreen />
  }

  return (
    <>
      <AppRoutes />
      <Toaster richColors position="top-right" />
    </>
  )
}
