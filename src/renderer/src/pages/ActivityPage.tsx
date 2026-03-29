import { useEffect, useState } from 'react'
import {
  Activity,
  Globe2,
  Server,
  Shield,
  AlertTriangle,
  RefreshCw,
  User,
  Clock,
  Loader2,
  ChevronDown,
} from 'lucide-react'
import { type ActivityEvent, getActivity } from '../api/client'
import { cn } from '@/lib/utils'

const KIND_CONFIG: Record<string, { icon: typeof Activity; color: string; bg: string }> = {
  ip_change:     { icon: RefreshCw,      color: 'text-primary',  bg: 'bg-primary/10' },
  login:         { icon: User,           color: 'text-success',  bg: 'bg-success/10' },
  tunnel_up:     { icon: Server,         color: 'text-success',  bg: 'bg-success/10' },
  tunnel_down:   { icon: Server,         color: 'text-error',    bg: 'bg-error/10' },
  dns_create:    { icon: Globe2,         color: 'text-accent',   bg: 'bg-accent/10' },
  dns_update:    { icon: Globe2,         color: 'text-accent',   bg: 'bg-accent/10' },
  dns_delete:    { icon: Globe2,         color: 'text-warning',  bg: 'bg-warning/10' },
  blocked_ip:    { icon: Shield,         color: 'text-error',    bg: 'bg-error/10' },
  alert:         { icon: AlertTriangle,  color: 'text-warning',  bg: 'bg-warning/10' },
}

const DEFAULT_CONFIG = { icon: Activity, color: 'text-text-dim', bg: 'bg-surface-2' }

function EventRow({ event }: { event: ActivityEvent }) {
  const config = KIND_CONFIG[event.kind] ?? DEFAULT_CONFIG
  const Icon = config.icon
  const ts = new Date(event.timestamp)
  const time = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const date = ts.toLocaleDateString([], { month: 'short', day: 'numeric' })

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors border-b border-border/30">
      <div className={cn('mt-0.5 p-1.5 rounded-lg shrink-0', config.bg)}>
        <Icon size={14} className={config.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text truncate">{event.title}</span>
          {event.subdomain && (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-surface-2 text-text-dim font-mono">
              {event.subdomain}
            </span>
          )}
        </div>
        {event.detail && (
          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{event.detail}</p>
        )}
        <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted">
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {date} {time}
          </span>
          {event.source_ip && <span className="font-mono">{event.source_ip}</span>}
          {event.country && <span>{event.country}</span>}
        </div>
      </div>
    </div>
  )
}

export function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [total, setTotal] = useState(0)
  const [retention, setRetention] = useState(0)
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(100)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    setLoading(true)
    getActivity(limit)
      .then((data) => {
        setEvents(data.events)
        setTotal(data.total)
        setRetention(data.retention_hours)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [limit])

  const kinds = [...new Set(events.map((e) => e.kind))]
  const filtered = filter === 'all' ? events : events.filter((e) => e.kind === filter)

  return (
    <div className="h-full flex flex-col p-6 gap-5">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/10">
            <Activity size={20} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text">Activity</h1>
            <p className="text-xs text-text-muted">
              {total} events · {retention}h retention
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Kind filter */}
          <div className="relative">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="appearance-none bg-surface border border-border rounded-lg px-3 py-1.5 pr-7 text-xs text-text focus:outline-none focus:border-primary/50"
            >
              <option value="all">All events</option>
              {kinds.map((k) => (
                <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>

          {/* Limit */}
          <div className="relative">
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="appearance-none bg-surface border border-border rounded-lg px-3 py-1.5 pr-7 text-xs text-text focus:outline-none focus:border-primary/50"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-accent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <Activity size={48} className="text-text-muted" />
          <h2 className="text-lg font-semibold text-text-dim">No activity yet</h2>
          <p className="text-sm text-text-muted">Events will appear here as you use your subdomains and tunnels.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto rounded-lg border border-border bg-surface/50">
          {filtered.map((ev, i) => (
            <EventRow key={`${ev.timestamp}-${ev.kind}-${i}`} event={ev} />
          ))}
        </div>
      )}
    </div>
  )
}
