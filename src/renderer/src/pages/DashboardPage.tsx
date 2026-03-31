import { useEffect, useState, useRef, useCallback } from 'react'
import { Globe, Network, Server, Wifi, Play, Pause, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import {
  type DynamicIP,
  type UserTunnel,
  listSubdomains,
  listTunnels,
  getAccessToken,
} from '../api/client'

// ── Types ──

type TickerEntry = {
  icon: string
  text: string
  status: 'online' | 'connected' | 'idle' | 'error'
  type: 'subdomain' | 'tunnel'
}

type TestResult = {
  name: string
  type: 'subdomain' | 'tunnel'
  status: 'pending' | 'testing' | 'ok' | 'fail' | 'timeout'
  latency?: number
}

// ── Dashboard ──

export function DashboardPage() {
  const [subdomains, setSubdomains] = useState<DynamicIP[]>([])
  const [globeAnimated, setGlobeAnimated] = useState(() => {
    const saved = localStorage.getItem('dynoip-globe-animated')
    return saved === null ? true : saved === 'true'
  })
  const [tunnels, setTunnels] = useState<UserTunnel[]>([])
  const [publicIP, setPublicIP] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [testRunning, setTestRunning] = useState(false)
  const testRef = useRef<HTMLDivElement>(null)
  const [healthMap, setHealthMap] = useState<Record<string, 'ok' | 'fail' | 'timeout'>>({})
  const healthRunning = useRef(false)
  const [forumReady, setForumReady] = useState(false)

  // Forum SSO: inject cookies via main process before loading iframe
  useEffect(() => {
    let cancelled = false
    async function auth() {
      const token = getAccessToken()
      if (token && window.electron?.forumAuthenticate) {
        await window.electron.forumAuthenticate(token)
      }
      if (!cancelled) setForumReady(true)
    }
    auth()
    return () => { cancelled = true }
  }, [])

  // Quick health probe — parallel HEAD requests with 5s timeout
  const runHealthProbe = useCallback(async (hosts: string[]) => {
    if (healthRunning.current || hosts.length === 0) return
    healthRunning.current = true
    const results: Record<string, 'ok' | 'fail' | 'timeout'> = {}
    await Promise.all(
      hosts.map(async (host) => {
        try {
          const ctrl = new AbortController()
          const timer = setTimeout(() => ctrl.abort(), 5000)
          await fetch(`https://${host}`, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal })
          clearTimeout(timer)
          results[host] = 'ok'
        } catch (err) {
          results[host] = err instanceof DOMException && err.name === 'AbortError' ? 'timeout' : 'fail'
        }
      })
    )
    setHealthMap(results)
    healthRunning.current = false
  }, [])

  // Fetch live data + poll every 30s
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [subs, tuns] = await Promise.all([
          listSubdomains().catch(() => [] as DynamicIP[]),
          listTunnels().catch(() => [] as UserTunnel[]),
        ])
        if (cancelled) return
        setSubdomains(subs)
        setTunnels(tuns)

        // Run health probe on all hostnames
        const hosts = [
          ...subs.filter((s) => s.is_active).map((s) => s.full_hostname),
          ...tuns.filter((t) => t.is_active).map((t) => t.domain || t.name),
        ]
        runHealthProbe(hosts)

        // Detect public IP from first subdomain with current_ip, or fetch
        const firstIP = subs.find((s) => s.current_ip)?.current_ip
        if (firstIP) {
          setPublicIP(firstIP)
        } else {
          try {
            const res = await fetch('https://api.ipify.org?format=json')
            const data = await res.json()
            if (!cancelled) setPublicIP(data.ip)
          } catch {
            if (!cancelled) setPublicIP('unknown')
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [runHealthProbe])

  // Build ticker entries from live data + health probes
  const tickerEntries: TickerEntry[] = [
    ...subdomains.map((s): TickerEntry => {
      const h = healthMap[s.full_hostname]
      let status: TickerEntry['status'] = 'idle'
      if (!s.is_active) status = 'idle'
      else if (h === 'ok') status = 'online'
      else if (h === 'timeout' || h === 'fail') status = 'error'
      else status = 'idle' // no probe result yet
      return { icon: '◈', text: s.full_hostname, status, type: 'subdomain' }
    }),
    ...tunnels.map((t): TickerEntry => {
      const host = t.domain || t.name
      const h = healthMap[host]
      let status: TickerEntry['status']
      // Prefer health probe when available, fall back to Pangolin status
      if (h === 'ok') status = 'connected'
      else if (h === 'timeout' || h === 'fail') status = t.status === 'online' ? 'idle' : 'error'
      else status = t.status === 'online' ? 'connected' : t.is_active ? 'idle' : 'error'
      return { icon: '▸', text: host, status, type: 'tunnel' }
    }),
  ]

  // Connection test
  const runTest = useCallback(async () => {
    if (testRunning) return
    setTestRunning(true)

    // Build test targets
    const targets: TestResult[] = [
      ...subdomains.map((s) => ({
        name: s.full_hostname,
        type: 'subdomain' as const,
        status: 'pending' as const,
      })),
      ...tunnels.map((t) => ({
        name: t.domain || t.name,
        type: 'tunnel' as const,
        status: 'pending' as const,
      })),
    ]
    setTestResults(targets)

    // Test each target sequentially for the "scrolling" effect
    for (let i = 0; i < targets.length; i++) {
      setTestResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: 'testing' } : r))
      )

      const start = performance.now()
      let status: 'ok' | 'fail' | 'timeout' = 'fail'
      let latency: number | undefined
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8000)
        await fetch(`https://${targets[i].name}`, {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal,
        })
        clearTimeout(timer)
        latency = Math.round(performance.now() - start)
        status = 'ok'
      } catch (err) {
        latency = Math.round(performance.now() - start)
        if (err instanceof DOMException && err.name === 'AbortError') {
          status = 'timeout'
        }
      }

      setTestResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status, latency } : r))
      )

      // Auto-scroll
      setTimeout(() => {
        testRef.current?.scrollTo({
          top: testRef.current.scrollHeight,
          behavior: 'smooth',
        })
      }, 50)

      // Brief pause between tests
      if (i < targets.length - 1) {
        await new Promise((r) => setTimeout(r, 300))
      }
    }

    setTestRunning(false)
  }, [subdomains, tunnels, testRunning])

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      {/* Hero: Globe + Status/Test combined */}
      <div className="flex gap-6 items-stretch h-[280px] shrink-0">
        {/* Globe */}
        <div className="flex-1 relative rounded-xl border border-border bg-black overflow-hidden flex items-center justify-center">
          {globeAnimated ? (
            <video
              src="globe.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="h-[260px] w-auto object-contain"
            />
          ) : (
            <img
              src="globe.png"
              alt="Globe"
              className="h-[260px] w-auto object-contain"
            />
          )}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          {/* Globe animation toggle */}
          <button
            onClick={() => {
              const next = !globeAnimated
              setGlobeAnimated(next)
              localStorage.setItem('dynoip-globe-animated', String(next))
            }}
            className="absolute top-2 left-2 p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-text-dim hover:text-primary transition-colors"
            title={globeAnimated ? 'Pause globe animation' : 'Play globe animation'}
          >
            {globeAnimated ? <Pause size={14} /> : <Play size={14} />}
          </button>
        </div>

        {/* Live Status + Connection Test combined */}
        <div className="w-80 rounded-xl border border-border bg-surface flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <Wifi size={14} className="text-primary" />
            <span className="text-xs font-semibold tracking-wider text-text-dim uppercase">
              Live Status
            </span>
            {loading ? (
              <Loader2 size={12} className="ml-auto text-text-muted animate-spin" />
            ) : (
              <div className="ml-auto w-2 h-2 rounded-full bg-success animate-pulse" />
            )}
          </div>
          <div className="flex-1 overflow-hidden relative min-h-0">
            <div className="absolute inset-0 font-mono text-xs leading-6 text-text-dim p-3 space-y-0.5 overflow-y-auto scrollbar-none">
              {loading ? (
                <div className="flex items-center justify-center h-full text-text-muted">
                  Loading services...
                </div>
              ) : tickerEntries.length === 0 ? (
                <div className="flex items-center justify-center h-full text-text-muted">
                  No services configured yet
                </div>
              ) : (
                tickerEntries.map((entry, i) => (
                  <StatusLine key={i} icon={entry.icon} text={entry.text} status={entry.status} />
                ))
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-surface to-transparent pointer-events-none" />
          </div>
          {/* Connection Test section */}
          <div className="border-t border-border px-4 py-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-wider text-text-dim uppercase">
              Connection Test
            </span>
            <button
              onClick={runTest}
              disabled={testRunning || (subdomains.length === 0 && tunnels.length === 0)}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {testRunning ? (
                <>
                  <Loader2 size={10} className="animate-spin" /> Running...
                </>
              ) : (
                <>
                  <Play size={10} /> Run Test
                </>
              )}
            </button>
          </div>
          {testResults.length > 0 && (
            <div
              ref={testRef}
              className="max-h-[90px] overflow-y-auto scrollbar-none border-t border-border px-3 py-2 font-mono text-xs space-y-0.5"
            >
              {testResults.map((r, i) => (
                <TestResultLine key={i} result={r} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={Globe}
          label="Subdomains"
          value={loading ? '—' : String(subdomains.length)}
          color="primary"
        />
        <StatCard
          icon={Network}
          label="Tunnels"
          value={loading ? '—' : String(tunnels.length)}
          color="accent"
        />
        <StatCard
          icon={Server}
          label="Active"
          value={
            loading
              ? '—'
              : String(
                  subdomains.filter((s) => s.is_active).length +
                    tunnels.filter((t) => t.is_active).length
                )
          }
          color="success"
        />
        <StatCard
          icon={Wifi}
          label="Your IP"
          value={publicIP ?? 'detecting...'}
          color="warning"
          mono
        />
      </div>

      {/* Forum embed — loaded after main-process cookie injection */}
      <div className="flex-1 rounded-xl border border-border overflow-hidden min-h-[200px]">
        {forumReady && <iframe
          src="https://forum.dyno-ip.online"
          className="w-full h-full border-0"
          loading="lazy"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          title="Dyno-IP Forum"
        />}
      </div>
    </div>
  )
}

// ── Sub-components ──

function StatusLine({
  icon,
  text,
  status,
}: {
  icon: string
  text: string
  status: 'online' | 'connected' | 'idle' | 'error'
}) {
  const colors = {
    online: 'text-success',
    connected: 'text-primary',
    idle: 'text-text-muted',
    error: 'text-error',
  }

  return (
    <div className="flex items-center gap-2">
      <span className={colors[status]}>{icon}</span>
      <span className="text-text-dim truncate">{text}</span>
      <span className={`ml-auto text-[10px] uppercase tracking-wider ${colors[status]}`}>
        {status}
      </span>
    </div>
  )
}

function TestResultLine({ result }: { result: TestResult }) {
  const iconMap = {
    pending: <div className="w-3.5 h-3.5 rounded-full border border-border" />,
    testing: <Loader2 size={14} className="text-primary animate-spin" />,
    ok: <CheckCircle2 size={14} className="text-success" />,
    fail: <XCircle size={14} className="text-error" />,
    timeout: <AlertTriangle size={14} className="text-warning" />,
  }

  const statusText = {
    pending: '',
    testing: 'testing...',
    ok: result.latency != null ? `${result.latency}ms` : 'ok',
    fail: result.latency != null ? `fail (${result.latency}ms)` : 'fail',
    timeout: 'timeout',
  }

  const statusColor = {
    pending: 'text-text-muted',
    testing: 'text-primary',
    ok: 'text-success',
    fail: 'text-error',
    timeout: 'text-warning',
  }

  return (
    <div className="flex items-center gap-2 py-0.5">
      {iconMap[result.status]}
      <span className="text-[10px] uppercase text-text-muted w-16 shrink-0">
        {result.type === 'subdomain' ? 'DDNS' : 'TUNNEL'}
      </span>
      <span className="text-text-dim truncate">{result.name}</span>
      <span className={`ml-auto text-[10px] ${statusColor[result.status]}`}>
        {statusText[result.status]}
      </span>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  mono,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
  color: 'primary' | 'accent' | 'success' | 'warning'
  mono?: boolean
}) {
  const colorMap = {
    primary: 'text-primary bg-primary/10',
    accent: 'text-accent bg-accent/10',
    success: 'text-success bg-success/10',
    warning: 'text-warning bg-warning/10',
  }
  const [iconColor, iconBg] = colorMap[color].split(' ')

  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="min-w-0">
        <div className={`text-lg font-bold text-text ${mono ? 'font-mono text-sm' : ''} truncate`}>
          {value}
        </div>
        <div className="text-xs text-text-muted">{label}</div>
      </div>
    </div>
  )
}
