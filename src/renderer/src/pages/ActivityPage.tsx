import { useEffect, useState, useRef, useCallback } from 'react'
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
  Eye,
  Ban,
  Monitor,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  Lock,
} from 'lucide-react'
import {
  type ActivityEvent,
  type RequestLogEntry,
  type RequestLogStats,
  getActivity,
  getRequestLogs,
  getRequestLogStats,
  getRequestLogHostnames,
} from '../api/client'
import { cn } from '@/lib/utils'
import { useAuth } from '../hooks/useAuth'

// ── Tabs ──

type TabId = 'activity' | 'requests'

// ── Activity Event Config ──

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

// ── Stat Card ──

function StatCard({ icon: Icon, label, value, color }: {
  icon: typeof Activity; label: string; value: number | string; color: string
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface/50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        <Icon size={12} className={color} />
        {label}
      </div>
      <span className="text-xl font-bold text-text">{value}</span>
    </div>
  )
}

// ── Activity Event Row ──

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

// ── Request Log Table Row ──

function RequestRow({ log }: { log: RequestLogEntry }) {
  const ts = new Date(log.created_at)
  const time = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const methodColor =
    log.method === 'GET' ? 'text-success' :
    log.method === 'POST' ? 'text-primary' :
    log.method === 'DELETE' ? 'text-error' :
    log.method === 'PUT' || log.method === 'PATCH' ? 'text-warning' :
    'text-text-dim'

  const actionColor = log.action === 'deny' ? 'text-error' : 'text-success'

  return (
    <tr className="border-b border-border/20 hover:bg-white/[0.02] transition-colors text-xs">
      <td className="px-3 py-2.5 font-mono text-text-dim truncate max-w-[180px]" title={log.hostname}>
        {log.hostname}
      </td>
      <td className={cn('px-3 py-2.5 font-mono font-semibold', methodColor)}>
        {log.method}
      </td>
      <td className="px-3 py-2.5 font-mono text-text-muted truncate max-w-[200px]" title={log.path}>
        {log.path}
      </td>
      <td className="px-3 py-2.5 font-mono text-text-dim">{log.source_ip}</td>
      <td className="px-3 py-2.5 text-text-muted">{log.country ?? '—'}</td>
      <td className={cn('px-3 py-2.5 capitalize', actionColor)}>
        {log.action ?? '—'}
      </td>
      <td className="px-3 py-2.5 text-text-dim">{log.tls ? '✓' : '✗'}</td>
      <td className="px-3 py-2.5 text-text-muted whitespace-nowrap">{time}</td>
    </tr>
  )
}

// ── Main Page ──

/** Max lookback hours by plan tier */
function getMaxHours(plan?: string, isAdmin?: boolean): number {
  if (isAdmin) return 720
  if (plan === 'pro' || plan === 'enterprise') return 168
  return 24
}

/** Human-friendly window label */
function windowLabel(h: number): string {
  if (h < 24) return `${h}h window`
  return `${h / 24}d window`
}

export function ActivityPage() {
  const { user } = useAuth()
  const maxHours = getMaxHours(user?.plan, user?.is_admin)
  const [tab, setTab] = useState<TabId>('activity')

  // ── Activity State ──
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [total, setTotal] = useState(0)
  const [retention, setRetention] = useState(0)
  const [actLoading, setActLoading] = useState(true)
  const [limit, setLimit] = useState(100)
  const [filter, setFilter] = useState<string>('all')

  // ── Request Logs State ──
  const [logs, setLogs] = useState<RequestLogEntry[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [logPageSize] = useState(50)
  const [logLoading, setLogLoading] = useState(false)
  const [stats, setStats] = useState<RequestLogStats | null>(null)
  const [hostnames, setHostnames] = useState<Array<{ hostname: string; count: number }>>([])
  const [hostnameFilter, setHostnameFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [hoursFilter, setHoursFilter] = useState(24)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const autoRefreshRef = useRef(autoRefresh)
  autoRefreshRef.current = autoRefresh
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch Activity ──
  useEffect(() => {
    setActLoading(true)
    getActivity(limit)
      .then((data) => {
        setEvents(data.events)
        setTotal(data.total)
        setRetention(data.retention_hours)
      })
      .catch(() => {})
      .finally(() => setActLoading(false))
  }, [limit])

  // ── Fetch Request Logs + Stats ──
  const fetchLogs = useCallback(async () => {
    setLogLoading(true)
    try {
      const params: Record<string, unknown> = {
        page: logPage,
        page_size: logPageSize,
        hours: hoursFilter,
      }
      if (hostnameFilter) params.hostname = hostnameFilter
      if (searchFilter) params.search = searchFilter
      const [logData, statsData] = await Promise.all([
        getRequestLogs(params as Parameters<typeof getRequestLogs>[0]),
        getRequestLogStats(hoursFilter),
      ])
      setLogs(logData.logs)
      setLogTotal(logData.total)
      setStats(statsData)
    } catch {
      // silently fail
    } finally {
      setLogLoading(false)
    }
  }, [logPage, logPageSize, hoursFilter, hostnameFilter, searchFilter])

  // Fetch hostnames once
  useEffect(() => {
    getRequestLogHostnames()
      .then((d) => setHostnames(d.hostnames))
      .catch(() => {})
  }, [])

  // Fetch logs when tab switches or filters change
  useEffect(() => {
    if (tab === 'requests') fetchLogs()
  }, [tab, fetchLogs])

  // Auto-refresh logs every 15s
  useEffect(() => {
    if (tab !== 'requests') return
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    if (autoRefresh) {
      pollTimerRef.current = setInterval(() => {
        if (autoRefreshRef.current) fetchLogs()
      }, 15_000)
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [tab, autoRefresh, fetchLogs])

  // ── Activity filters ──
  const kinds = [...new Set(events.map((e) => e.kind))]
  const filtered = filter === 'all' ? events : events.filter((e) => e.kind === filter)
  const totalLogPages = Math.ceil(logTotal / logPageSize)

  return (
    <div className="h-full flex flex-col p-6 gap-5">
      {/* Header + Tabs */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/10">
            <Activity size={20} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text">Activity</h1>
            <p className="text-xs text-text-muted">
              {tab === 'activity'
                ? `${total} events · ${retention}h retention`
                : `${logTotal} requests · ${windowLabel(hoursFilter)}`}
            </p>
          </div>
        </div>

        {/* Tab buttons */}
        <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-0.5">
          <button
            onClick={() => setTab('activity')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              tab === 'activity' ? 'bg-primary/15 text-primary' : 'text-text-muted hover:text-text'
            )}
          >
            Events
          </button>
          <button
            onClick={() => setTab('requests')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              tab === 'requests' ? 'bg-primary/15 text-primary' : 'text-text-muted hover:text-text'
            )}
          >
            Request Logs
          </button>
        </div>
      </div>

      {/* ─── Activity Tab ─── */}
      {tab === 'activity' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-2 shrink-0">
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

          {/* Timeline */}
          {actLoading ? (
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
        </>
      )}

      {/* ─── Request Logs Tab ─── */}
      {tab === 'requests' && (
        <>
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-4 gap-3 shrink-0">
              <StatCard icon={Activity} label="Total Requests" value={stats.total_requests} color="text-accent" />
              <StatCard icon={Monitor} label="Unique IPs" value={stats.unique_ips} color="text-primary" />
              <StatCard icon={Eye} label="Allowed" value={stats.allowed_requests} color="text-success" />
              <StatCard icon={Ban} label="Blocked" value={stats.blocked_requests} color="text-error" />
            </div>
          )}

          {/* Controls Row */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* Time window */}
            <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-0.5">
              {[1, 6, 24, 72, 168, 720].map((h) => {
                const locked = h > maxHours
                return (
                  <button
                    key={h}
                    onClick={() => { if (!locked) { setHoursFilter(h); setLogPage(1) } }}
                    title={locked ? `Upgrade to ${h <= 168 ? 'Pro' : 'Enterprise'} for ${h < 24 ? `${h}h` : `${h / 24}d`} retention` : undefined}
                    className={cn(
                      'px-2 py-1 rounded-md text-[10px] font-medium transition-colors flex items-center gap-0.5',
                      locked
                        ? 'text-text-muted/40 cursor-not-allowed'
                        : hoursFilter === h ? 'bg-primary/15 text-primary' : 'text-text-muted hover:text-text'
                    )}
                  >
                    {h < 24 ? `${h}h` : `${h / 24}d`}
                    {locked && <Lock size={8} className="ml-0.5" />}
                  </button>
                )
              })}
            </div>

            {/* Hostname filter */}
            {hostnames.length > 0 && (
              <div className="relative">
                <select
                  value={hostnameFilter}
                  onChange={(e) => { setHostnameFilter(e.target.value); setLogPage(1) }}
                  className="appearance-none bg-surface border border-border rounded-lg px-3 py-1.5 pr-7 text-xs text-text focus:outline-none focus:border-primary/50"
                >
                  <option value="">All hostnames</option>
                  {hostnames.map((h) => (
                    <option key={h.hostname} value={h.hostname}>{h.hostname} ({h.count})</option>
                  ))}
                </select>
                <Filter size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            )}

            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setLogPage(1); fetchLogs() } }}
                placeholder="Search path or user-agent…"
                className="w-full bg-surface border border-border rounded-lg pl-7 pr-3 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-primary/50"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* Auto-refresh toggle */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-colors',
                  autoRefresh
                    ? 'border-success/30 bg-success/10 text-success'
                    : 'border-border text-text-muted hover:text-text'
                )}
              >
                <div className={cn('w-1.5 h-1.5 rounded-full', autoRefresh ? 'bg-success animate-pulse' : 'bg-text-muted')} />
                Live
              </button>

              {/* Manual refresh */}
              <button
                onClick={fetchLogs}
                disabled={logLoading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-text-dim hover:bg-white/5 hover:text-text transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={logLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {/* Request Log Table */}
          {logLoading && logs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-accent" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <Eye size={48} className="text-text-muted" />
              <h2 className="text-lg font-semibold text-text-dim">No request logs found</h2>
              <p className="text-sm text-text-muted">Logs will appear once the poller starts ingesting Pangolin data</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-auto rounded-lg border border-border bg-surface/50">
                <table className="w-full text-left">
                  <thead className="bg-surface-2/50 sticky top-0">
                    <tr className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                      <th className="px-3 py-2">Hostname</th>
                      <th className="px-3 py-2">Method</th>
                      <th className="px-3 py-2">Path</th>
                      <th className="px-3 py-2">Source IP</th>
                      <th className="px-3 py-2">Country</th>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">TLS</th>
                      <th className="px-3 py-2">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <RequestRow key={log.id} log={log} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalLogPages > 1 && (
                <div className="flex items-center justify-between pt-3 shrink-0">
                  <span className="text-[10px] text-text-muted">
                    {logTotal} results · page {logPage} of {totalLogPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                      disabled={logPage <= 1}
                      className="p-1.5 rounded-lg border border-border text-text-dim hover:bg-white/5 disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
                      disabled={logPage >= totalLogPages}
                      className="p-1.5 rounded-lg border border-border text-text-dim hover:bg-white/5 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
