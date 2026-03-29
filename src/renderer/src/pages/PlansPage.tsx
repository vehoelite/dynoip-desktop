import { useEffect, useState } from 'react'
import { CreditCard, Check, Loader2, Zap, Star } from 'lucide-react'
import { getServicePlans } from '../api/client'
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
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getServicePlans()
      .then(setPlans)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="h-full flex flex-col p-6 gap-5">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="p-2 rounded-lg bg-warning/10">
          <CreditCard size={20} className="text-warning" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text">Service Plans</h1>
          <p className="text-xs text-text-muted">Compare features and limits across plans</p>
        </div>
      </div>

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
              return (
                <div
                  key={plan.name}
                  className={cn(
                    'flex flex-col rounded-xl border p-5 transition-colors hover:bg-white/[0.02]',
                    tier.border,
                    'bg-surface/50'
                  )}
                >
                  {/* Plan header */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className={cn('p-1.5 rounded-lg', tier.bg)}>
                      <Icon size={16} className={tier.color} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-text">{plan.display_name}</h3>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-4">
                    {plan.price_monthly === 0 ? (
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
