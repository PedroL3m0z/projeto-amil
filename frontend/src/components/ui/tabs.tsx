import * as React from 'react'
import { cn } from '@/lib/utils'

type TabsContextValue = {
  value: string
  setValue: (v: string) => void
  listId: string
  registerTrigger: (value: string) => void
  triggersOrderRef: React.MutableRefObject<string[]>
  focusTriggerByIndex: (index: number) => void
  orientation: 'horizontal' | 'vertical'
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext(component: string) {
  const ctx = React.useContext(TabsContext)
  if (!ctx) {
    throw new Error(`<${component}> deve estar dentro de <Tabs>.`)
  }
  return ctx
}

export type TabsProps = {
  /** Valor inicial (modo não controlado). */
  defaultValue: string
  /** Valor controlado (opcional). */
  value?: string
  onValueChange?: (value: string) => void
  orientation?: 'horizontal' | 'vertical'
  className?: string
  children: React.ReactNode
}

export function Tabs({
  defaultValue,
  value: controlled,
  onValueChange,
  orientation = 'horizontal',
  className,
  children,
}: TabsProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const value = controlled ?? uncontrolled
  const setValue = React.useCallback(
    (v: string) => {
      if (controlled === undefined) setUncontrolled(v)
      onValueChange?.(v)
    },
    [controlled, onValueChange],
  )

  const reactId = React.useId()
  const listId = `tabs-list-${reactId}`
  const triggersOrderRef = React.useRef<string[]>([])
  const triggerRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map())

  const registerTrigger = React.useCallback((v: string) => {
    if (!triggersOrderRef.current.includes(v)) {
      triggersOrderRef.current = [...triggersOrderRef.current, v]
    }
  }, [])

  const focusTriggerByIndex = React.useCallback((index: number) => {
    const order = triggersOrderRef.current
    if (order.length === 0) return
    const target = order[(index + order.length) % order.length]
    triggerRefs.current.get(target)?.focus()
  }, [])

  const ctx: TabsContextValue = React.useMemo(
    () => ({
      value,
      setValue,
      listId,
      registerTrigger,
      triggersOrderRef,
      focusTriggerByIndex,
      orientation,
    }),
    [value, setValue, listId, registerTrigger, focusTriggerByIndex, orientation],
  )

  return (
    <TabsContext.Provider value={ctx}>
      <div
        data-orientation={orientation}
        className={cn('flex flex-col gap-6', className)}
      >
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child
          if (child.type === TabsTrigger) {
            return React.cloneElement(
              child as React.ReactElement<TabsTriggerProps>,
              {
                __refMap: triggerRefs.current,
              },
            )
          }
          return child
        })}
      </div>
    </TabsContext.Provider>
  )
}

export type TabsListProps = React.HTMLAttributes<HTMLDivElement>

export function TabsList({ className, children, ...props }: TabsListProps) {
  const { listId, orientation, triggersOrderRef, focusTriggerByIndex } =
    useTabsContext('TabsList')

  const triggerRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map())

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null
    if (!target || target.getAttribute('role') !== 'tab') return
    const currentValue = target.getAttribute('data-value')
    if (!currentValue) return
    const order = triggersOrderRef.current
    const idx = order.indexOf(currentValue)

    const isHorizontal = orientation === 'horizontal'
    const next = isHorizontal ? 'ArrowRight' : 'ArrowDown'
    const prev = isHorizontal ? 'ArrowLeft' : 'ArrowUp'

    if (e.key === next) {
      e.preventDefault()
      focusTriggerByIndex(idx + 1)
    } else if (e.key === prev) {
      e.preventDefault()
      focusTriggerByIndex(idx - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusTriggerByIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusTriggerByIndex(order.length - 1)
    }
  }

  return (
    <div
      id={listId}
      role="tablist"
      aria-orientation={orientation}
      onKeyDown={handleKeyDown}
      className={cn(
        'inline-flex h-11 items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 text-muted-foreground',
        className,
      )}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child
        if (child.type === TabsTrigger) {
          return React.cloneElement(
            child as React.ReactElement<TabsTriggerProps>,
            { __refMap: triggerRefs.current },
          )
        }
        return child
      })}
    </div>
  )
}

export type TabsTriggerProps = {
  value: string
  className?: string
  disabled?: boolean
  children: React.ReactNode
  /** @internal injetado por TabsList para suportar navegação por teclado. */
  __refMap?: Map<string, HTMLButtonElement>
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'children'>

export function TabsTrigger({
  value,
  className,
  disabled,
  children,
  __refMap,
  ...props
}: TabsTriggerProps) {
  const { value: active, setValue, registerTrigger } = useTabsContext('TabsTrigger')
  const isActive = active === value

  React.useEffect(() => {
    registerTrigger(value)
  }, [registerTrigger, value])

  const setRef = (el: HTMLButtonElement | null) => {
    if (!__refMap) return
    if (el) __refMap.set(value, el)
    else __refMap.delete(value)
  }

  return (
    <button
      ref={setRef}
      role="tab"
      type="button"
      data-value={value}
      data-state={isActive ? 'active' : 'inactive'}
      aria-selected={isActive}
      aria-controls={`tab-panel-${value}`}
      id={`tab-trigger-${value}`}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => setValue(value)}
      className={cn(
        'inline-flex min-w-0 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
        'whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        isActive
          ? 'bg-background text-foreground shadow-sm ring-1 ring-border/60'
          : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export type TabsContentProps = {
  value: string
  className?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>

export function TabsContent({
  value,
  className,
  children,
  ...props
}: TabsContentProps) {
  const { value: active } = useTabsContext('TabsContent')
  const isActive = active === value
  return (
    <div
      role="tabpanel"
      id={`tab-panel-${value}`}
      aria-labelledby={`tab-trigger-${value}`}
      hidden={!isActive}
      tabIndex={0}
      className={cn(
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md',
        className,
      )}
      {...props}
    >
      {isActive ? children : null}
    </div>
  )
}
