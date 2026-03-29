import { useEffect, useRef, useCallback, useState } from 'react'
import { listSubdomains, refreshIP, type DynamicIP } from '../api/client'

const DEFAULT_INTERVAL = 5 * 60_000 // 5 minutes

interface DDNSStatus {
  lastCheck: Date | null
  lastIP: string | null
  changed: boolean
  error: string | null
  checking: boolean
}

/**
 * Background DDNS updater.
 * Periodically fetches public IP and pushes it to all active subdomains.
 * Runs in the renderer — no separate service needed for the desktop client.
 */
export function useDDNSUpdater(interval = DEFAULT_INTERVAL) {
  const [status, setStatus] = useState<DDNSStatus>({
    lastCheck: null,
    lastIP: null,
    changed: false,
    error: null,
    checking: false,
  })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  const update = useCallback(async () => {
    setStatus((s) => ({ ...s, checking: true, error: null }))

    try {
      // Get current public IP
      const ipRes = await fetch('https://api.ipify.org?format=json')
      const { ip } = await ipRes.json()
      if (!mountedRef.current) return

      // Get user's active subdomains
      const subs = await listSubdomains()
      if (!mountedRef.current) return

      let anyChanged = false

      // Refresh each subdomain that has a stale IP
      const stale = subs.filter((s: DynamicIP) => s.is_active && s.current_ip !== ip)
      for (const sub of stale) {
        try {
          const result = await refreshIP(sub.subdomain, ip)
          if (result.changed) anyChanged = true
        } catch {
          // Individual subdomain failure — keep going
        }
      }

      if (mountedRef.current) {
        setStatus({
          lastCheck: new Date(),
          lastIP: ip,
          changed: anyChanged,
          error: null,
          checking: false,
        })
      }
    } catch (err) {
      if (mountedRef.current) {
        setStatus((s) => ({
          ...s,
          checking: false,
          error: err instanceof Error ? err.message : 'Update failed',
        }))
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    // Run once on mount
    update()

    // Then on interval
    timerRef.current = setInterval(update, interval)

    return () => {
      mountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [update, interval])

  return { ...status, forceUpdate: update }
}
