import { useEffect, useState } from 'react'
import { CreditCard, Check, Loader2, Zap, Star, ExternalLink, Settings } from 'lucide-react'
import { getServicePlans, createCheckout, createBillingPortal, ApiError } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { cn } from '@/lib/utils'

interface Plan {
  name: string
  display_name: string
  max_subdomains: number
  max_tunnels: number
  max_dns_records: number
  price_monthly: number
  features: string[]
}

const PLAN_TIERS: Record<string, { color: string; bg: string; border: string; icon: typeof Star }> = {
  free:       { color: 'text-text-dim',  bg: 'bg-surface-2',    border: 'border-border',     icon: Zap },
  pro:        { color: 'text-primary',   bg: 'bg-primary/10',   border: 'border-primary/30', icon: Zap },
  business:   { color: 'text-accent',    bg: 'bg-accent/10',    border: 'border-accent/30',  icon: Star },
}

const DEFAULT_TIER = { color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30', icon: Zap }

export function PlansPage() {
  const { user } = useAuth()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentPlan = user?.plan ?? 'free'

  useEffect(() => {
    getServicePlans()
      .then(setPlans)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleUpgrade(planSlug: string) {
    setError(null)
    setCheckoutLoading(planSlug)
    try {
      const { url } = await createCheckout(planSlug)
      window.electron?.openExternal(url)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to start checkout')
    } finally {
      setCheckoutLoading(null)
    }
  }

  async function handleManageBilling() {
    setError(null)
    setPortalLoading(true)
    try {
      const { url } = await createBillingPortal()
      window.electron?.openExternal(url)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to open billing portal')
    } finally {
      setPortalLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 gap-5">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-warning/10">
            <CreditCard size={20} className="text-warning" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text">Service Plans</h1>
            <p className="text-xs text-text-muted">Compare features and limits across plans</p>
          </div>
        </div>
        {currentPlan !== 'free' && (
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs text-text-dim hover:bg-white/5 hover:text-text transition-colors disabled:opacity-50"
          >
            {portalLoading ? <Loader2 size={12} className="animate-spin" /> : <Settings size={12} />}
            Manage Billing
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-lg bg-error/10 border border-error/20 text-xs text-error shrink-0">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-warning" />
        </div>
      ) : plans.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <CreditCard size={48} className="text-text-muted" />
          <h2 className="text-lg font-semibold text-text-dim">No plans available</h2>
          <p className="text-sm text-text-muted">Check back later.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-min">
            {plans.map((plan) => {
              const tier = PLAN_TIERS[plan.name.toLowerCase()] ?? DEFAULT_TIER
              const Icon = tier.icon
              const isCurrent = plan.name.toLowerCase() === currentPlan.toLowerCase()
              const isFree = plan.price_monthly === 0
              const isUpgrade = !isCurrent && !isFree
              const isCheckingOut = checkoutLoading === plan.name

              return (
                <div
                  key={plan.name}
                  className={cn(
                    'flex flex-col rounded-xl border p-5 transition-colors hover:bg-white/[0.02]',
                    isCurrent ? 'border-primary/50 ring-1 ring-primary/20' : tier.border,
                    'bg-surface/50'
                  )}
                >
                  {/* Plan header */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className={cn('p-1.5 rounded-lg', tier.bg)}>
                      <Icon size={16} className={tier.color} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold text-text">{plan.display_name}</h3>
                    </div>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary">
                        Current
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="mb-4">
                    {isFree ? (
                      <span className="text-2xl font-bold text-text">Free</span>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-text">${plan.price_monthly}</span>
                        <span className="text-xs text-text-muted">/mo</span>
                      </div>
                    )}
                  </div>

                  {/* Limits */}
                  <div className="space-y-2 mb-4 pb-4 border-b border-border/50">
                    <LimitRow label="Subdomains" value={plan.max_subdomains} />
                    <LimitRow label="Tunnels" value={plan.max_tunnels} />
                    <LimitRow label="DNS Records" value={plan.max_dns_records} />
                  </div>

                  {/* Features */}
                  <div className="space-y-1.5 flex-1">
                    {plan.features.map((f, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Check size={12} className="mt-0.5 text-success shrink-0" />
                        <span className="text-xs text-text-dim leading-relaxed">{f}</span>
                      </div>
                    ))}
                  </div>

                  {/* Action button */}
                  <div className="mt-4 pt-4 border-t border-border/50">
                    {isCurrent ? (
                      <div className="w-full text-center py-2 rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                        Your Plan
                      </div>
                    ) : isUpgrade ? (
                      <button
                        onClick={() => handleUpgrade(plan.name)}
                        disabled={isCheckingOut}
                        className={cn(
                          'w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors',
                          plan.name === 'pro'
                            ? 'bg-primary hover:bg-primary/90 text-white'
                            : 'bg-accent hover:bg-accent/90 text-white',
                          'disabled:opacity-50'
                        )}
                      >
                        {isCheckingOut ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <ExternalLink size={12} />
                        )}
                        Upgrade to {plan.display_name}
                      </button>
                    ) : (
                      <div className="w-full text-center py-2 text-xs text-text-muted">
                        Free tier
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function LimitRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-muted">{label}</span>
      <span className="font-mono text-text-dim">
        {value >= 9999 ? '∞' : value}
      </span>
    </div>
  )
}
