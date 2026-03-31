import { useEffect, useState, useCallback } from 'react'
import {
  Server,
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  Loader2,
  Shield,
  ShieldOff,
  ChevronDown,
} from 'lucide-react'
import {
  type DynamicIP,
  type DNSRecord,
  type DNSRecordCreate,
  type DNSRecordUpdate,
  listSubdomains,
  listDNSRecords,
  createDNSRecord,
  updateDNSRecord,
  deleteDNSRecord,
  toggleDNSProxy,
  ApiError,
} from '../api/client'
import { cn } from '@/lib/utils'

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS', 'CAA']

// ── Inline Edit Row ──

function RecordRow({
  record,
  subdomain,
  onUpdated,
  onDeleted,
}: {
  record: DNSRecord
  subdomain: string
  onUpdated: (r: DNSRecord) => void
  onDeleted: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(record.content)
  const [ttl, setTtl] = useState(String(record.ttl))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const update: DNSRecordUpdate = { content, ttl: parseInt(ttl) || 1, proxied: record.proxied }
      const updated = await updateDNSRecord(subdomain, record.id, update)
      onUpdated(updated)
      setEditing(false)
    } catch { /* toast */ } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setDeleting(true)
    try {
      await deleteDNSRecord(subdomain, record.id)
      onDeleted(record.id)
    } catch { /* toast */ } finally {
      setDeleting(false)
    }
  }

  const proxyToggle = async () => {
    setToggling(true)
    try {
      const updated = await toggleDNSProxy(subdomain, record.id, !record.proxied)
      onUpdated(updated)
    } catch { /* toast */ } finally {
      setToggling(false)
    }
  }

  return (
    <tr className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
      {/* Type */}
      <td className="px-3 py-2.5 text-xs">
        <span className="px-2 py-0.5 rounded bg-surface-2 text-text-dim font-mono">{record.type}</span>
      </td>
      {/* Name */}
      <td className="px-3 py-2.5 text-xs text-text font-mono truncate max-w-[180px]">{record.name}</td>
      {/* Content */}
      <td className="px-3 py-2.5 text-xs">
        {editing ? (
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full bg-bg border border-border rounded px-2 py-1 text-xs font-mono text-text focus:outline-none focus:border-primary/50"
            autoFocus
          />
        ) : (
          <span className="text-text-dim font-mono truncate block max-w-[240px]">{record.content}</span>
        )}
      </td>
      {/* TTL */}
      <td className="px-3 py-2.5 text-xs">
        {editing ? (
          <input
            value={ttl}
            onChange={(e) => setTtl(e.target.value)}
            className="w-16 bg-bg border border-border rounded px-2 py-1 text-xs font-mono text-text focus:outline-none focus:border-primary/50"
          />
        ) : (
          <span className="text-text-muted font-mono">{record.ttl === 1 ? 'Auto' : record.ttl}</span>
        )}
      </td>
      {/* Proxy */}
      <td className="px-3 py-2.5">
        {record.type === 'A' || record.type === 'AAAA' || record.type === 'CNAME' ? (
          <button
            onClick={proxyToggle}
            disabled={toggling}
            className={cn(
              'p-1 rounded transition-colors',
              record.proxied ? 'text-primary hover:bg-primary/10' : 'text-text-muted hover:bg-white/5'
            )}
            title={record.proxied ? 'Proxied (CF)' : 'DNS only'}
          >
            {toggling ? <Loader2 size={14} className="animate-spin" /> : record.proxied ? <Shield size={14} /> : <ShieldOff size={14} />}
          </button>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      {/* Actions */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button onClick={save} disabled={saving} className="p-1 rounded hover:bg-success/10 text-success transition-colors disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              </button>
              <button onClick={() => { setEditing(false); setContent(record.content); setTtl(String(record.ttl)) }} className="p-1 rounded hover:bg-white/10 text-text-muted">
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text transition-colors">
                <Pencil size={14} />
              </button>
              <button onClick={remove} disabled={deleting} className="p-1 rounded hover:bg-error/10 text-text-muted hover:text-error transition-colors disabled:opacity-50">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Add Record Form ──

function AddRecordForm({
  subdomain,
  onCreated,
}: {
  subdomain: string
  onCreated: (r: DNSRecord) => void
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('A')
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [ttl, setTtl] = useState('1')
  const [priority, setPriority] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!name.trim() || !content.trim()) return setError('Name and content are required')
    setLoading(true)
    setError('')
    try {
      const record: DNSRecordCreate = {
        subdomain,
        record_name: name.trim(),
        record_type: type,
        content: content.trim(),
        ttl: parseInt(ttl) || 1,
        ...(priority ? { priority: parseInt(priority) } : {}),
      }
      const created = await createDNSRecord(subdomain, record)
      onCreated(created)
      setOpen(false)
      setName('')
      setContent('')
      setPriority('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create record')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
      >
        <Plus size={14} />
        Add Record
      </button>
    )
  }

  return (
    <div className="mt-3 bg-bg/50 rounded-lg p-3 border border-border space-y-2">
      <div className="grid grid-cols-[80px_1fr_1fr_80px_80px] gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="bg-bg border border-border rounded px-2 py-1.5 text-xs text-text focus:outline-none focus:border-primary/50">
          {RECORD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Record name" className="bg-bg border border-border rounded px-2 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-primary/50" />
        <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Content / Value" className="bg-bg border border-border rounded px-2 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-primary/50" />
        <input value={ttl} onChange={(e) => setTtl(e.target.value)} placeholder="TTL" className="bg-bg border border-border rounded px-2 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-primary/50" />
        {(type === 'MX' || type === 'SRV') && (
          <input value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="Priority" className="bg-bg border border-border rounded px-2 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-primary/50" />
        )}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs rounded-lg text-text-muted hover:bg-white/5 transition-colors">Cancel</button>
        <button onClick={submit} disabled={loading} className="px-3 py-1.5 text-xs rounded-lg bg-primary text-bg font-medium hover:bg-primary-dim transition-colors disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
        </button>
      </div>
    </div>
  )
}

// ── Main Page ──

export function DNSRecordsPage() {
  const [subdomains, setSubdomains] = useState<DynamicIP[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [records, setRecords] = useState<DNSRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [error, setError] = useState('')

  // Load subdomains on mount
  useEffect(() => {
    listSubdomains()
      .then((subs) => {
        setSubdomains(subs)
        if (subs.length) setSelected(subs[0].subdomain)
      })
      .catch(() => setError('Failed to load subdomains'))
      .finally(() => setLoading(false))
  }, [])

  // Load DNS records when subdomain changes
  useEffect(() => {
    if (!selected) { setRecords([]); return }
    setRecordsLoading(true)
    listDNSRecords(selected)
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setRecordsLoading(false))
  }, [selected])

  const handleUpdated = (r: DNSRecord) => {
    setRecords((prev) => prev.map((rec) => (rec.id === r.id ? r : rec)))
  }

  const handleDeleted = (id: string) => {
    setRecords((prev) => prev.filter((rec) => rec.id !== id))
  }

  const handleCreated = (r: DNSRecord) => {
    setRecords((prev) => [r, ...prev])
  }

  return (
    <div className="h-full flex flex-col p-6 gap-5">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-success/10">
            <Server size={20} className="text-success" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text">DNS Records</h1>
            <p className="text-xs text-text-muted">Manage Cloudflare DNS records per subdomain</p>
          </div>
        </div>

        {/* Subdomain picker */}
        {subdomains.length > 0 && (
          <div className="relative">
            <select
              value={selected ?? ''}
              onChange={(e) => setSelected(e.target.value)}
              className="appearance-none bg-surface border border-border rounded-lg px-4 py-2 pr-8 text-sm text-text focus:outline-none focus:border-primary/50"
            >
              {subdomains.map((s) => (
                <option key={s.subdomain} value={s.subdomain}>
                  {s.full_hostname}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 rounded-lg bg-error/10 border border-error/20 text-sm text-error">{error}</div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-success" />
        </div>
      )}

      {!loading && !subdomains.length && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <Server size={48} className="text-text-muted" />
          <h2 className="text-lg font-semibold text-text-dim">No subdomains</h2>
          <p className="text-sm text-text-muted">Create a subdomain first to manage its DNS records.</p>
        </div>
      )}

      {!loading && selected && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {recordsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-success" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-text-muted">No DNS records found for this subdomain.</p>
              <AddRecordForm subdomain={selected} onCreated={handleCreated} />
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border text-xs text-text-muted">
                    <th className="px-3 py-2 font-medium w-[80px]">Type</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Content</th>
                    <th className="px-3 py-2 font-medium w-[70px]">TTL</th>
                    <th className="px-3 py-2 font-medium w-[50px]">Proxy</th>
                    <th className="px-3 py-2 font-medium w-[80px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <RecordRow
                      key={r.id}
                      record={r}
                      subdomain={selected}
                      onUpdated={handleUpdated}
                      onDeleted={handleDeleted}
                    />
                  ))}
                </tbody>
              </table>
              <div className="mt-3">
                <AddRecordForm subdomain={selected} onCreated={handleCreated} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
