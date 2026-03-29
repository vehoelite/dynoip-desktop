import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Globe,
  Network,
  Server,
  Activity,
  Crown,
  ChevronLeft,
  ChevronRight,
  LogOut
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { id: 'subdomains', label: 'Subdomains', icon: Globe, path: '/subdomains' },
  { id: 'tunnels', label: 'Tunnels', icon: Network, path: '/tunnels' },
  { id: 'dns', label: 'DNS Records', icon: Server, path: '/dns' },
  { id: 'activity', label: 'Activity', icon: Activity, path: '/activity' },
  { id: 'plans', label: 'Plans', icon: Crown, path: '/plans' }
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()

  return (
    <div
      className={cn(
        'h-full bg-surface border-r border-border flex flex-col transition-all duration-200',
        collapsed ? 'w-16' : 'w-52'
      )}
    >
      {/* Navigation */}
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path))
          const Icon = item.icon

          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-dim hover:bg-white/5 hover:text-text'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate">{item.label}</span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  )}
                </>
              )}
            </button>
          )
        })}
      </nav>

      {/* User & Sign Out */}
      <div className="px-2 py-2 border-t border-border space-y-1">
        {!collapsed && user && (
          <div className="px-3 py-1.5 text-xs text-text-muted truncate">
            {user.email}
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-error/70 hover:bg-error/10 hover:text-error transition-colors"
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>

        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center py-2 rounded-lg text-text-muted hover:bg-white/5 hover:text-text-dim transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </div>
  )
}
