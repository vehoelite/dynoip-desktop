import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { useDDNSUpdater } from '../hooks/useDDNSUpdater'

export function AppShell({ children }: { children: React.ReactNode }) {
  // Background DDNS IP updater — runs every 5 min while app is open
  useDDNSUpdater()

  return (
    <div className="h-screen flex flex-col bg-bg">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto" style={{ contain: 'layout style paint' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
