import { useEffect, useState, useCallback } from 'react'
import {
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  KeyRound,
  Shield,
  ShieldOff,
  Copy,
  Check,
  Loader2,
  X,
  Clock,
  Wifi,
  ChevronDown,
  ChevronRight,
  Lock,
  Unlock,
  Eye,
  EyeOff,
} from 'lucide-react'
import {
  type DynamicIP,
  type IPHistory,
  type DDNSProxyStatus,
  type AvailableDomains,
  listSubdomains,
  createSubdomain,
  deleteSubdomain,
  refreshIP,
  regenerateToken,
  getIPHistory,
  getAvailableDomains,
  enableDDNSProxy,
  disableDDNSProxy,
  getDDNSProxyStatus,
  toggleCFSSL,
  togglePangolinSSL,
  ApiError,
} from '../api/client'
import { cn } from '@/lib/utils'
import { DDNSAccessControl } from '../components/DDNSAccessControl'

// ── Helpers ──

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-white/10 transition-colors" title="Copy">
      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} className="text-text-muted" />}
    </button>
  )
}

// ── Create Dialog ──

function CreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (sub: DynamicIP) => void
}) {
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [domains, setDomains] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName('')
    setError('')
    getAvailableDomains()
      .then((d) => {
        setDomains(d.domains)
        setDomain(d.default)
      })
      .catch(() => {
        setDomains(['dyno-ip.com'])
        setDomain('dyno-ip.com')
      })
  }, [open])

  const submit = async () => {
    const trimmed = name.trim().toLowerCase()
    if (!trimmed) return setError('Subdomain name is required')
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(trimmed))
      return setError('Letters, numbers, and hyphens only (2-63 chars)')
    setLoading(true)
    setError('')
    try {
      const sub = await createSubdomain(trimmed, domain || undefined)
      onCreated(sub)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create subdomain')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface border border-border rounded-xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-text">New Subdomain</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X size={18} className="text-text-muted" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Subdomain name */}
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1.5">Subdomain</label>
            <div className="flex items-center gap-0">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''))}
                placeholder="myhost"
                className="flex-1 bg-bg border border-border rounded-l-lg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary/50"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
              <span className="bg-bg border border-l-0 border-border rounded-r-lg px-3 py-2 text-sm text-text-dim select-none">
                .{domain}
              </span>
            </div>
          </div>

          {/* Domain picker */}
          {domains.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-text-dim mb-1.5">Domain</label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary/50"
              >
                {domains.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-xs text-error">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg text-text-dim hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={loading}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-bg font-medium hover:bg-primary-dim transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Delete Confirm Dialog ──

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-surface border border-border rounded-xl p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-text mb-2">{title}</h2>
        <p className="text-sm text-text-dim mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg text-text-dim hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'px-4 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-50',
              danger
                ? 'bg-error text-white hover:bg-error/80'
                : 'bg-primary text-bg hover:bg-primary-dim'
            )}
          >
            {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detail Panel (expandable row) ──

function DetailPanel({
  sub,
  onUpdate,
}: {
  sub: DynamicIP
  onUpdate: (updated: DynamicIP) => void
}) {
  const [history, setHistory] = useState<IPHistory | null>(null)
  const [proxyStatus, setProxyStatus] = useState<DDNSProxyStatus | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [busy, setBusy] = useState('')
  const [actionError, setActionError] = useState('')
  const [showAccess, setShowAccess] = useState(false)
  const [newtConnected, setNewtConnected] = useState(false)
  const [newtConnecting, setNewtConnecting] = useState(false)

  useEffect(() => {
    getIPHistory(sub.subdomain, 10).then(setHistory).catch(() => {})
    if (sub.pangolin_enabled) {
      getDDNSProxyStatus(sub.subdomain).then(setProxyStatus).catch(() => {})
    }
  }, [sub.subdomain, sub.pangolin_enabled])

  // Auto-connect Newt when proxy is enabled and credentials are available
  useEffect(() => {
    if (!sub.pangolin_enabled || !sub.newt_id || !sub.newt_secret) return

    const newtKey = `d-${sub.id}`

    // Check if already running
    window.electron.newtStatus(newtKey).then(async (s) => {
      if (s.running) {
        setNewtConnected(true)
        return
      }
      // Auto-start
      setNewtConnecting(true)
      try {
        await window.electron.newtInstall()
        const endpoint = proxyStatus?.pangolin_endpoint || 'https://pangolin.dyno-ip.online'
        await window.electron.newtStart({
          key: newtKey,
          endpoint,
          newtId: sub.newt_id!,
          newtSecret: sub.newt_secret!,
        })
        setNewtConnected(true)
      } catch {
        setNewtConnected(false)
      } finally {
        setNewtConnecting(false)
      }
    }).catch(() => {})

    return () => {
      // Stop Newt when panel unmounts if proxy is disabled or component unmounts
      // (keep running — user expects background connection)
    }
  }, [sub.pangolin_enabled, sub.newt_id, sub.newt_secret, sub.id, proxyStatus?.pangolin_endpoint])

  // Stop Newt when proxy gets disabled
  useEffect(() => {
    if (!sub.pangolin_enabled && sub.newt_id) {
      const newtKey = `d-${sub.id}`
      window.electron.newtStop(newtKey).catch(() => {})
      setNewtConnected(false)
      setNewtConnecting(false)
    }
  }, [sub.pangolin_enabled, sub.newt_id, sub.id])

  const action = async (key: string, fn: () => Promise<DynamicIP | void>) => {
    setBusy(key)
    setActionError('')
    try {
      const result = await fn()
      if (result && 'id' in result) onUpdate(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed'
      setActionError(msg)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="bg-bg/50 border-t border-border px-5 py-4 space-y-4">
      {/* Error banner */}
      {actionError && (
        <div className="flex items-center gap-2 bg-error/10 text-error rounded-lg px-3 py-2 text-xs">
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError('')} className="hover:opacity-70">✕</button>
        </div>
      )}
      {/* Token section */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-text-dim w-24 shrink-0">Update Token</span>
        <code className="flex-1 bg-surface rounded px-3 py-1.5 text-xs font-mono text-text-dim select-all overflow-hidden">
          {showToken ? sub.update_token : '••••••••••••••••••••'}
        </code>
        <button
          onClick={() => setShowToken(!showToken)}
          className="p-1 rounded hover:bg-white/10"
          title={showToken ? 'Hide' : 'Reveal'}
        >
          {showToken ? <EyeOff size={14} className="text-text-muted" /> : <Eye size={14} className="text-text-muted" />}
        </button>
        <CopyButton text={sub.update_token} />
        <button
          onClick={() => action('regen', () => regenerateToken(sub.subdomain))}
          disabled={busy === 'regen'}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-warning/10 text-warning hover:bg-warning/20 transition-colors disabled:opacity-50"
          title="Regenerate token"
        >
          {busy === 'regen' ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
          Regenerate
        </button>
      </div>

      {/* Proxy / SSL toggles */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-text-dim w-24 shrink-0">Proxy</span>
        <button
          onClick={() =>
            action('proxy', () =>
              sub.pangolin_enabled
                ? disableDDNSProxy(sub.subdomain)
                : enableDDNSProxy(sub.subdomain)
            )
          }
          disabled={!!busy}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50',
            sub.pangolin_enabled
              ? 'bg-success/10 text-success hover:bg-success/20'
              : 'bg-white/5 text-text-muted hover:bg-white/10'
          )}
        >
          {busy === 'proxy' ? (
            <Loader2 size={12} className="animate-spin" />
          ) : sub.pangolin_enabled ? (
            <Shield size={12} />
          ) : (
            <ShieldOff size={12} />
          )}
          {sub.pangolin_enabled ? 'Enabled' : 'Disabled'}
        </button>

        {!sub.pangolin_enabled && (
          <button
            onClick={() => action('cfssl', () => toggleCFSSL(sub.subdomain))}
            disabled={!!busy}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50',
              sub.cf_proxied
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'bg-white/5 text-text-muted hover:bg-white/10'
            )}
          >
            {busy === 'cfssl' ? <Loader2 size={12} className="animate-spin" /> : sub.cf_proxied ? <Lock size={12} /> : <Unlock size={12} />}
            CF SSL {sub.cf_proxied ? 'On' : 'Off'}
          </button>
        )}

        {sub.pangolin_enabled && (
          <button
            onClick={() => action('pssl', () => togglePangolinSSL(sub.subdomain))}
            disabled={!!busy}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50',
              sub.pangolin_ssl
                ? 'bg-accent/10 text-accent hover:bg-accent/20'
                : 'bg-white/5 text-text-muted hover:bg-white/10'
            )}
          >
            {busy === 'pssl' ? <Loader2 size={12} className="animate-spin" /> : sub.pangolin_ssl ? <Lock size={12} /> : <Unlock size={12} />}
            Pangolin SSL {sub.pangolin_ssl ? 'On' : 'Off'}
          </button>
        )}

        {sub.pangolin_enabled && (
          <span
            className={cn(
              'ml-auto text-xs font-medium',
              newtConnected ? 'text-success' : newtConnecting ? 'text-warning' : 'text-error'
            )}
          >
            {newtConnected ? '● Connected' : newtConnecting ? '● Connecting…' : '● Offline'}
          </span>
        )}
      </div>

      {/* IP History */}
      {history && history.entries.length > 0 && (
        <div>
          <span className="text-xs font-medium text-text-dim block mb-2">IP History (last {history.entries.length})</span>
          <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
            {history.entries.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 text-xs text-text-muted">
                <Clock size={11} className="shrink-0" />
                <span className="w-28 shrink-0">{new Date(entry.created_at).toLocaleString()}</span>
                {entry.old_ip && (
                  <>
                    <span className="font-mono text-error/60">{entry.old_ip}</span>
                    <span>→</span>
                  </>
                )}
                <span className="font-mono text-success/80">{entry.new_ip}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Access Control — only when Pangolin proxy is enabled */}
      {sub.pangolin_enabled && (
        <div className="pt-2 border-t border-border/50">
          <button
            onClick={() => setShowAccess(!showAccess)}
            className="flex items-center gap-2 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
          >
            <Shield size={14} />
            Access Control
            {showAccess ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {showAccess && (
            <div className="mt-3">
              <DDNSAccessControl subdomain={sub.subdomain} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ──

export function SubdomainsPage() {
  const [subdomains, setSubdomains] = useState<DynamicIP[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DynamicIP | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const subs = await listSubdomains()
      setSubdomains(subs)
      setError('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load subdomains')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleCreated = (sub: DynamicIP) => {
    setSubdomains((prev) => [sub, ...prev])
    setExpanded((prev) => new Set(prev).add(sub.id))
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await deleteSubdomain(deleteTarget.subdomain)
      setSubdomains((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      /* toast error */
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleRefresh = async (sub: DynamicIP) => {
    setRefreshing((prev) => new Set(prev).add(sub.subdomain))
    try {
      const result = await refreshIP(sub.subdomain)
      setSubdomains((prev) =>
        prev.map((s) =>
          s.id === sub.id ? { ...s, current_ip: result.new_ip, last_update: new Date().toISOString() } : s
        )
      )
    } catch {
      /* toast */
    } finally {
      setRefreshing((prev) => {
        const next = new Set(prev)
        next.delete(sub.subdomain)
        return next
      })
    }
  }

  const handleUpdate = (updated: DynamicIP) => {
    setSubdomains((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  // ── Render ──

  return (
    <div className="h-full flex flex-col p-6 gap-5">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Globe size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text">Subdomains</h1>
            <p className="text-xs text-text-muted">
              {subdomains.length} subdomain{subdomains.length !== 1 && 's'} registered
            </p>
          </div>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-bg text-sm font-medium hover:bg-primary-dim transition-colors"
        >
          <Plus size={16} />
          New Subdomain
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 rounded-lg bg-error/10 border border-error/20 text-sm text-error">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !subdomains.length && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <Globe size={48} className="text-text-muted" />
          <h2 className="text-lg font-semibold text-text-dim">No subdomains yet</h2>
          <p className="text-sm text-text-muted max-w-xs">
            Create your first subdomain to start using Dynamic DNS. Your IP will be updated automatically.
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-bg text-sm font-medium hover:bg-primary-dim transition-colors"
          >
            <Plus size={16} />
            Create Subdomain
          </button>
        </div>
      )}

      {/* Subdomain list */}
      {!loading && subdomains.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {subdomains.map((sub) => {
            const isExpanded = expanded.has(sub.id)
            const isRefreshing = refreshing.has(sub.subdomain)

            return (
              <div
                key={sub.id}
                className="rounded-xl border border-border bg-surface overflow-hidden transition-colors"
              >
                {/* Row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => toggle(sub.id)}
                >
                  {/* Expand chevron */}
                  <div className="shrink-0 text-text-muted">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>

                  {/* Status dot */}
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full shrink-0',
                      sub.is_active ? 'bg-success' : 'bg-text-muted'
                    )}
                  />

                  {/* Hostname */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-text truncate block">
                      {sub.full_hostname}
                    </span>
                    <span className="text-xs text-text-muted">
                      {sub.current_ip || 'no IP'} · updated {timeAgo(sub.last_update)}
                    </span>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {sub.pangolin_enabled && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent">
                        PROXY
                      </span>
                    )}
                    {sub.cf_proxied && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                        CF SSL
                      </span>
                    )}
                  </div>

                  {/* Actions (stop propagation so they don't toggle expand) */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleRefresh(sub)}
                      disabled={isRefreshing}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-text-muted hover:text-primary transition-colors disabled:opacity-50"
                      title="Refresh IP"
                    >
                      <RefreshCw size={14} className={cn(isRefreshing && 'animate-spin')} />
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(sub.full_hostname)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-text-muted hover:text-text transition-colors"
                      title="Copy hostname"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(sub)}
                      className="p-1.5 rounded-lg hover:bg-error/10 text-text-muted hover:text-error transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Expanded detail panel */}
                {isExpanded && <DetailPanel sub={sub} onUpdate={handleUpdate} />}
              </div>
            )
          })}
        </div>
      )}

      {/* Dialogs */}
      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Subdomain"
        message={`Permanently release ${deleteTarget?.full_hostname}? This will remove the DNS record and cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
