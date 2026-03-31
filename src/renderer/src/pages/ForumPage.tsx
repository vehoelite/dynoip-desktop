import { useState, useRef, useEffect } from 'react'
import { ExternalLink, RefreshCw, Loader2, MessageSquare, ChevronLeft, ChevronRight, Home, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAccessToken } from '../api/client'
import { useAuth } from '../hooks/useAuth'

const FORUM_URL = 'https://forum.dyno-ip.online'

export function ForumPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [forumReady, setForumReady] = useState(false)
  const [navCount, setNavCount] = useState(0) // tracks loads beyond the initial one
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { user } = useAuth()

  // Authenticate with forum via main-process cookie injection
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

  function goBack() {
    try { iframeRef.current?.contentWindow?.history.back() } catch {}
  }

  function goForward() {
    try { iframeRef.current?.contentWindow?.history.forward() } catch {}
  }

  function goHome() {
    if (iframeRef.current) {
      setLoading(true)
      iframeRef.current.src = FORUM_URL
      setNavCount(0)
    }
  }

  function refresh() {
    setLoading(true)
    setError(false)
    const token = getAccessToken()
    if (token && window.electron?.forumAuthenticate) {
      window.electron.forumAuthenticate(token).then(() => {
        if (iframeRef.current) iframeRef.current.src = FORUM_URL
      })
    } else if (iframeRef.current) {
      iframeRef.current.src = FORUM_URL
    }
    setNavCount(0)
  }

  function openExternal() {
    window.electron?.openExternal(FORUM_URL)
  }

  function openACP() {
    if (iframeRef.current) {
      setLoading(true)
      iframeRef.current.src = `${FORUM_URL}/adm/`
    }
  }

  function handleIframeLoad() {
    setLoading(false)
    setNavCount((c) => c + 1)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-primary" />
          <h1 className="text-sm font-semibold text-text">Community Forum</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goBack}
            className={cn(
              'flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors',
              navCount > 1 ? 'text-text-dim hover:text-text hover:bg-white/5' : 'text-text-muted/30 cursor-default'
            )}
            title="Back"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={goForward}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-text-dim hover:text-text hover:bg-white/5 rounded-md transition-colors"
            title="Forward"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={goHome}
            className={cn(
              'flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors',
              navCount > 1 ? 'text-text-dim hover:text-text hover:bg-white/5' : 'text-text-muted/30 cursor-default'
            )}
            title="Forum Home"
          >
            <Home size={14} />
          </button>
          {user?.is_admin && (
            <>
              <div className="w-px h-4 bg-border mx-1" />
              <button
                onClick={openACP}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-400/80 hover:text-amber-300 hover:bg-amber-400/10 rounded-md transition-colors"
                title="Admin Control Panel"
              >
                <Shield size={14} />
                <span>ACP</span>
              </button>
            </>
          )}
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-text-dim hover:text-text hover:bg-white/5 rounded-md transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={openExternal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-text-dim hover:text-text hover:bg-white/5 rounded-md transition-colors"
            title="Open in browser"
          >
            <ExternalLink size={14} />
            <span>Open in browser</span>
          </button>
        </div>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="flex items-center justify-center py-3 bg-surface-2 shrink-0">
          <Loader2 size={16} className="animate-spin text-primary mr-2" />
          <span className="text-xs text-text-dim">Loading forum…</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <MessageSquare size={40} className="text-text-muted" />
          <p className="text-sm text-text-dim">Could not load the forum</p>
          <button
            onClick={refresh}
            className="px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Forum iframe — loaded only after main-process cookie injection */}
      {forumReady && <iframe
        ref={iframeRef}
        src={FORUM_URL}
        className={cn('flex-1 w-full border-0', error && !loading && 'hidden')}
        onLoad={handleIframeLoad}
        onError={() => {
          setLoading(false)
          setError(true)
        }}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        allow="clipboard-write"
        title="DynoIP Community Forum"
      />}
    </div>
  )
}
