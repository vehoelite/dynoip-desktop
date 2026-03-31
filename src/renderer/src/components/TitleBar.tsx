import { useState, useEffect } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'

export function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.electron.isMaximized().then(setMaximized)
    const cleanup = window.electron.onMaximizeChange(setMaximized)
    return cleanup
  }, [])

  return (
    <div
      className="h-10 flex items-center justify-between bg-surface border-b border-border select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Logo + Title */}
      <div className="flex items-center gap-2.5 pl-3">
        <img src="icon.png" alt="" className="w-5 h-5" draggable={false} />
        <span className="text-xs font-semibold tracking-[0.2em] text-text-dim uppercase">
          Dyno-IP
        </span>
      </div>

      {/* Window Controls */}
      <div
        className="flex items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={() => window.electron.minimize()}
          className="w-11 h-10 flex items-center justify-center text-text-dim hover:bg-white/5 hover:text-text transition-colors"
          aria-label="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => window.electron.maximize()}
          className="w-11 h-10 flex items-center justify-center text-text-dim hover:bg-white/5 hover:text-text transition-colors"
          aria-label="Maximize"
        >
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          onClick={() => window.electron.close()}
          className="w-11 h-10 flex items-center justify-center text-text-dim hover:bg-error/80 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
