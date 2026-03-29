import { useEffect, useState, useCallback } from 'react'
import {
  Network,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Loader2,
  X,
  ChevronDown,
  ChevronRight,
  Wifi,
  WifiOff,
  Shield,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react'
import {
  type UserTunnel,
  type UserTunnelCreateResult,
  listTunnels,
  listTunnelDomains,
  createTunnel,
  deleteTunnel,
  syncTunnel,
  toggleTunnelSSL,
  ApiError,
} from '../api/client'
import { cn } from '@/lib/utils'
import { TunnelAccessControl } from '../components/TunnelAccessControl'

// ── Helpers ──

function timeAgo(iso: string): string {
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

function statusColor(status: string) {
  if (status === 'online') return 'bg-success'
  if (status === 'offline') return 'bg-error'
  return 'bg-warning'
}

// ── Create Tunnel Dialog ──

function CreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (result: UserTunnelCreateResult) => void
}) {
  const [name, setName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [domain, setDomain] = useState('')
  const [domains, setDomains] = useState<string[]>([])
  const [targetPort, setTargetPort] = useState('80')
  const [protocol, setProtocol] = useState('https')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName('')
    setSubdomain('')
    setTargetPort('80')
    setProtocol('https')
    setError('')
    listTunnelDomains()
      .then((d) => {
        setDomains(d)
        if (d.length) setDomain(d[0])
      })
      .catch(() => {
        setDomains(['dyno-ip.com'])
        setDomain('dyno-ip.com')
      })
  }, [open])

  const submit = async () => {
    const trimmedName = name.trim()
    const trimmedSub = subdomain.trim().toLowerCase()
    if (!trimmedName) return setError('Tunnel name is required')
    if (!trimmedSub) return setError('Subdomain is required')
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(trimmedSub))
      return setError('Subdomain: letters, numbers, hyphens only')

    setLoading(true)
    setError('')
    try {
      const result = await createTunnel({
        name: trimmedName,
        subdomain: trimmedSub,
        domain: domain || undefined,
        target_port: parseInt(targetPort) || 80,
        protocol,
      })
      onCreated(result)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create tunnel')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface border border-border rounded-xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-text">New Tunnel</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X size={18} className="text-text-muted" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1.5">Tunnel Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-web-server"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary/50"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-dim mb-1.5">Subdomain</label>
            <div className="flex items-center gap-0">
              <input
                type="text"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''))}
                placeholder="tunnel"
                className="flex-1 bg-bg border border-border rounded-l-lg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary/50"
              />
              <span className="bg-bg border border-l-0 border-border rounded-r-lg px-3 py-2 text-sm text-text-dim select-none">
                .{domain}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-dim mb-1.5">Target Port</label>
              <input
                type="number"
                value={targetPort}
                onChange={(e) => setTargetPort(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-dim mb-1.5">Protocol</label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary/50"
              >
                <option value="https">HTTPS</option>
                <option value="http">HTTP</option>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
            </div>
          </div>

          {domains.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-text-dim mb-1.5">Domain</label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary/50"
              >
                {domains.map((d) => (
                  <option key={d} value={d}>{d}</option>
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

// ── Confirm Dialog ──

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
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
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg text-text-dim hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="px-4 py-2 text-sm rounded-lg bg-error text-white font-medium hover:bg-error/80 transition-colors disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detail Panel ──

function DetailPanel({
  tunnel,
  onTunnelUpdate,
  newtConnected: newtConnectedProp,
  onNewtStatusChange,
}: {
  tunnel: UserTunnel
  onTunnelUpdate?: (updated: Partial<UserTunnel>) => void
  newtConnected: boolean
  onNewtStatusChange?: (connected: boolean) => void
}) {
  const [sslLoading, setSslLoading] = useState(false)
  const [showAccess, setShowAccess] = useState(false)
  const newtConnected = newtConnectedProp
  const setNewtConnected = (v: boolean) => onNewtStatusChange?.(v)
  const [newtBusy, setNewtBusy] = useState(false)

  // Check Newt status on mount
  useEffect(() => {
    if (!tunnel.newt_id) return
    window.electron.newtStatus(`t-${tunnel.id}`).then(s => setNewtConnected(s.running)).catch(() => {})
  }, [tunnel.id, tunnel.newt_id])

  const handleNewtToggle = async () => {
    if (!tunnel.newt_id || !tunnel.newt_secret || !tunnel.pangolin_endpoint) return
    setNewtBusy(true)
    try {
      if (newtConnected) {
        await window.electron.newtStop(`t-${tunnel.id}`)
        setNewtConnected(false)
      } else {
        await window.electron.newtInstall()
        await window.electron.newtStart({
          key: `t-${tunnel.id}`,
          endpoint: tunnel.pangolin_endpoint,
          newtId: tunnel.newt_id,
          newtSecret: tunnel.newt_secret,
        })
        setNewtConnected(true)
      }
    } catch {
      // re-check actual state
      const s = await window.electron.newtStatus(`t-${tunnel.id}`).catch(() => ({ running: false }))
      setNewtConnected(s.running)
    } finally {
      setNewtBusy(false)
    }
  }

  const isHttp = ['http', 'https'].includes(tunnel.protocol.toLowerCase())
  const sslOn = tunnel.protocol.toLowerCase() === 'https'

  const handleSSLToggle = async () => {
    setSslLoading(true)
    try {
      const res = await toggleTunnelSSL(tunnel.id, !sslOn)
      onTunnelUpdate?.({ protocol: res.ssl ? 'https' : 'http' })
    } catch {
      /* silently fail — user sees no change */
    } finally {
      setSslLoading(false)
    }
  }

  return (
    <div className="bg-bg/50 border-t border-border px-5 py-4 space-y-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <div>
          <span className="text-text-muted">Protocol</span>
          <span className="ml-2 text-text font-mono">{tunnel.protocol.toUpperCase()}</span>
        </div>
        <div>
          <span className="text-text-muted">Target Port</span>
          <span className="ml-2 text-text font-mono">{tunnel.target_port ?? '—'}</span>
        </div>
        {tunnel.proxy_port && (
          <div>
            <span className="text-text-muted">Proxy Port</span>
            <span className="ml-2 text-text font-mono">{tunnel.proxy_port}</span>
          </div>
        )}
        <div>
          <span className="text-text-muted">Created</span>
          <span className="ml-2 text-text">{new Date(tunnel.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Connect / Disconnect — only when tunnel has Newt credentials */}
      {tunnel.newt_id && tunnel.newt_secret && tunnel.pangolin_endpoint && (
        <div className="flex items-center gap-3 pt-1">
          <span className="text-xs font-medium text-text-dim w-20 shrink-0">Tunnel</span>
          <button
            onClick={handleNewtToggle}
            disabled={newtBusy}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              newtConnected
                ? 'bg-success/20 text-success hover:bg-success/30'
                : 'bg-surface text-text-muted hover:bg-white/10'
            )}
          >
            {newtBusy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : newtConnected ? (
              <Wifi size={14} />
            ) : (
              <WifiOff size={14} />
            )}
            {newtBusy ? 'Working…' : newtConnected ? 'Connected' : 'Connect'}
          </button>
        </div>
      )}

      {/* SSL Toggle — only for HTTP/HTTPS tunnels */}
      {isHttp && (
        <div className="flex items-center gap-3 pt-1">
          <span className="text-xs font-medium text-text-dim w-20 shrink-0">SSL</span>
          <button
            onClick={handleSSLToggle}
            disabled={sslLoading}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              sslOn
                ? 'bg-success/20 text-success hover:bg-success/30'
                : 'bg-surface text-text-muted hover:bg-white/10'
            )}
          >
            {sslLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : sslOn ? (
              <ShieldCheck size={14} />
            ) : (
              <ShieldOff size={14} />
            )}
            {sslOn ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      )}

      {/* Access Control */}
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
            <TunnelAccessControl tunnelId={tunnel.id} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──

export function TunnelsPage() {
  const [tunnels, setTunnels] = useState<UserTunnel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UserTunnel | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [syncing, setSyncing] = useState<Set<number>>(new Set())
  const [newtStatuses, setNewtStatuses] = useState<Record<number, boolean>>({})

  const load = useCallback(async () => {
    try {
      const list = await listTunnels()
      setTunnels(list)
      setError('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load tunnels')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Check local Newt status for all tunnels with credentials
  useEffect(() => {
    if (tunnels.length === 0) return
    const check = async () => {
      const statuses: Record<number, boolean> = {}
      for (const t of tunnels) {
        if (t.newt_id) {
          try {
            const s = await window.electron.newtStatus(`t-${t.id}`)
            statuses[t.id] = s.running
          } catch {
            statuses[t.id] = false
          }
        }
      }
      setNewtStatuses(statuses)
    }
    check()
  }, [tunnels.length])

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleCreated = (result: UserTunnelCreateResult) => {
    setTunnels((prev) => [result.tunnel, ...prev])
    setExpanded((prev) => new Set(prev).add(result.tunnel.id))
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await deleteTunnel(deleteTarget.id)
      setTunnels((prev) => prev.filter((t) => t.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch { /* toast */ } finally {
      setDeleteLoading(false)
    }
  }

  const handleSync = async (t: UserTunnel) => {
    setSyncing((prev) => new Set(prev).add(t.id))
    try {
      const result = await syncTunnel(t.id)
      setTunnels((prev) =>
        prev.map((tun) =>
          tun.id === t.id ? { ...tun, status: result.status } : tun
        )
      )
    } catch { /* toast */ } finally {
      setSyncing((prev) => {
        const next = new Set(prev)
        next.delete(t.id)
        return next
      })
    }
  }

  return (
    <div className="h-full flex flex-col p-6 gap-5">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/10">
            <Network size={20} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text">Tunnels</h1>
            <p className="text-xs text-text-muted">
              {tunnels.length} tunnel{tunnels.length !== 1 && 's'} configured
            </p>
          </div>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-dim transition-colors"
        >
          <Plus size={16} />
          New Tunnel
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 rounded-lg bg-error/10 border border-error/20 text-sm text-error">{error}</div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-accent" />
        </div>
      )}

      {!loading && !tunnels.length && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <Network size={48} className="text-text-muted" />
          <h2 className="text-lg font-semibold text-text-dim">No tunnels yet</h2>
          <p className="text-sm text-text-muted max-w-xs">
            Create a tunnel to securely expose a local service through Pangolin's reverse proxy.
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-dim transition-colors"
          >
            <Plus size={16} />
            Create Tunnel
          </button>
        </div>
      )}

      {!loading && tunnels.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {tunnels.map((t) => {
            const isExpanded = expanded.has(t.id)
            const isSyncing = syncing.has(t.id)
            const hostname = t.domain || t.name

            return (
              <div key={t.id} className="rounded-xl border border-border bg-surface overflow-hidden transition-colors">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => toggle(t.id)}
                >
                  <div className="shrink-0 text-text-muted">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>

                  <div className={cn('w-2 h-2 rounded-full shrink-0', statusColor(newtStatuses[t.id] ? 'online' : t.status))} />

                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-text truncate block">{hostname}</span>
                    <span className="text-xs text-text-muted">
                      {t.name} · {t.protocol.toUpperCase()} :{t.target_port} · {newtStatuses[t.id] ? 'online' : t.status} · {timeAgo(t.updated_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-medium',
                      (newtStatuses[t.id] || t.status === 'online') ? 'bg-success/10 text-success' : 'bg-text-muted/10 text-text-muted'
                    )}>
                      {(newtStatuses[t.id] || t.status === 'online') ? 'ONLINE' : t.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleSync(t)}
                      disabled={isSyncing}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-text-muted hover:text-accent transition-colors disabled:opacity-50"
                      title="Sync status"
                    >
                      <RefreshCw size={14} className={cn(isSyncing && 'animate-spin')} />
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(hostname)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-text-muted hover:text-text transition-colors"
                      title="Copy hostname"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(t)}
                      className="p-1.5 rounded-lg hover:bg-error/10 text-text-muted hover:text-error transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <DetailPanel
                    tunnel={t}
                    newtConnected={newtStatuses[t.id] ?? false}
                    onNewtStatusChange={(connected) => setNewtStatuses(prev => ({ ...prev, [t.id]: connected }))}
                    onTunnelUpdate={(updates) => {
                      setTunnels((prev) =>
                        prev.map((tun) =>
                          tun.id === t.id ? { ...tun, ...updates } : tun
                        )
                      )
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Tunnel"
        message={`Permanently remove tunnel "${deleteTarget?.name}"? The Newt agent will stop working.`}
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
