import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Loader2,
  Lock,
  Mail,
  Hash,
  AlertTriangle,
  Check,
  X,
  Shield,
  ShieldCheck,
  ShieldOff,
  Ban,
  Wrench,
  Globe,
  ChevronDown,
  ChevronRight,
  Zap,
  Eye,
  EyeOff,
  Power,
} from 'lucide-react'
import { type AccessRule, type AccessSettings, ApiError } from '../api/client'
import { cn } from '@/lib/utils'

// ── API contract — each wrapper (Tunnel/DDNS) passes its specific functions ──

export interface AccessControlApi {
  getSettings: () => Promise<AccessSettings>
  updateSettings: (data: Partial<AccessSettings>) => Promise<{ message: string }>
  listRules: () => Promise<{ rules: AccessRule[] }>
  createRule: (data: {
    match: string
    value: string
    action?: string
    priority?: number
    enabled?: boolean
  }) => Promise<AccessRule>
  deleteRule: (ruleId: number) => Promise<{ message: string }>
  setPassword: (password: string) => Promise<{ message: string }>
  clearPassword: () => Promise<{ message: string }>
  setPincode: (pincode: string) => Promise<{ message: string }>
  clearPincode: () => Promise<{ message: string }>
  getWhitelist: () => Promise<{ whitelist: Array<{ email: string }> }>
  addWhitelistEmail: (email: string) => Promise<{ message: string }>
  removeWhitelistEmail: (email: string) => Promise<{ message: string }>
}

interface Props {
  api: AccessControlApi
  /** Label shown context-sensitively, e.g. "tunnel" or "subdomain" */
  entityLabel: string
}

// ── Quick-add presets ──

const POPULAR_COUNTRIES = [
  { code: 'CN', name: 'China' },
  { code: 'RU', name: 'Russia' },
  { code: 'KP', name: 'North Korea' },
  { code: 'IR', name: 'Iran' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'ID', name: 'Indonesia' },
]

const MATCH_META: Record<string, { label: string; placeholder: string; hint: string }> = {
  IP: { label: 'IP Address', placeholder: '203.0.113.50', hint: 'Single IP address' },
  CIDR: { label: 'IP Range (CIDR)', placeholder: '10.0.0.0/24', hint: 'Network range in CIDR notation' },
  COUNTRY: { label: 'Country', placeholder: 'CN', hint: 'Two-letter ISO country code' },
  PATH: { label: 'URL Path', placeholder: '/admin', hint: 'URL path prefix to match' },
  ASN: { label: 'ASN', placeholder: 'AS13335', hint: 'Autonomous System Number' },
}

// ── Status pill ──

function StatusPill({
  label,
  active,
  icon,
}: {
  label: string
  active: boolean
  icon: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors',
        active
          ? 'bg-primary/15 text-primary border border-primary/30'
          : 'bg-surface-2 text-text-muted border border-border'
      )}
    >
      {icon}
      {label}
    </span>
  )
}

// ── Section wrapper ──

function Section({
  title,
  description,
  children,
  defaultOpen = true,
  danger,
}: {
  title: string
  description?: string
  children: React.ReactNode
  defaultOpen?: boolean
  danger?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div
      className={cn(
        'rounded-lg border',
        danger ? 'border-error/20 bg-error/[0.03]' : 'border-border bg-surface/50'
      )}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2.5 text-left group"
      >
        <div>
          <h4
            className={cn(
              'text-[11px] font-bold uppercase tracking-wider',
              danger ? 'text-error/80' : 'text-text-dim'
            )}
          >
            {title}
          </h4>
          {description && !open && (
            <p className="text-[10px] text-text-muted mt-0.5">{description}</p>
          )}
        </div>
        {open ? (
          <ChevronDown size={14} className="text-text-muted" />
        ) : (
          <ChevronRight size={14} className="text-text-muted" />
        )}
      </button>
      {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  )
}

// ── Main component ──

export function AccessControlPanel({ api, entityLabel }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [settings, setSettings] = useState<AccessSettings | null>(null)
  const [rules, setRules] = useState<AccessRule[]>([])
  const [emails, setEmails] = useState<string[]>([])

  // Auth forms
  const [pwExpanded, setPwExpanded] = useState(false)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [settingPwd, setSettingPwd] = useState(false)
  const [clearingPwd, setClearingPwd] = useState(false)

  const [pinExpanded, setPinExpanded] = useState(false)
  const [pincode, setPincode] = useState('')
  const [settingPin, setSettingPin] = useState(false)
  const [clearingPin, setClearingPin] = useState(false)

  const [emailExpanded, setEmailExpanded] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [addingEmail, setAddingEmail] = useState(false)

  // Rules
  const [showAddRule, setShowAddRule] = useState(false)
  const [newMatch, setNewMatch] = useState('IP')
  const [newValue, setNewValue] = useState('')
  const [newAction, setNewAction] = useState<'DROP' | 'ACCEPT'>('DROP')
  const [creating, setCreating] = useState(false)
  const [showCountryPicker, setShowCountryPicker] = useState(false)

  // Maintenance
  const [maintTitle, setMaintTitle] = useState('')
  const [maintMessage, setMaintMessage] = useState('')
  const [savingMaint, setSavingMaint] = useState(false)

  const flash = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 3000)
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [s, r, w] = await Promise.all([
        api.getSettings(),
        api.listRules(),
        api.getWhitelist(),
      ])
      setSettings(s)
      setRules(r.rules || [])
      setEmails((w.whitelist || []).map((e: { email: string }) => e.email))
      setMaintTitle(s.maintenance_title || '')
      setMaintMessage(s.maintenance_message || '')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load access settings')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ── Helpers ──

  const updateSetting = async (field: string, value: boolean | string) => {
    try {
      await api.updateSettings({ [field]: value } as Partial<AccessSettings>)
      setSettings((prev) => (prev ? { ...prev, [field]: value } : prev))
      flash(`${field.replace(/_/g, ' ')} ${value ? 'enabled' : 'disabled'}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update')
    }
  }

  const handleSetPassword = async () => {
    if (password.length < 4) return
    setSettingPwd(true)
    try {
      await api.setPassword(password)
      setSettings((prev) => (prev ? { ...prev, password_set: true } : prev))
      setPassword('')
      setPwExpanded(false)
      flash('Password protection set')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to set password')
    } finally {
      setSettingPwd(false)
    }
  }

  const handleClearPassword = async () => {
    setClearingPwd(true)
    try {
      await api.clearPassword()
      setSettings((prev) => (prev ? { ...prev, password_set: false } : prev))
      setPwExpanded(false)
      flash('Password protection removed')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to clear password')
    } finally {
      setClearingPwd(false)
    }
  }

  const handleSetPincode = async () => {
    if (!/^\d{6}$/.test(pincode)) return
    setSettingPin(true)
    try {
      await api.setPincode(pincode)
      setSettings((prev) => (prev ? { ...prev, pincode_set: true } : prev))
      setPincode('')
      setPinExpanded(false)
      flash('PIN code set')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to set pincode')
    } finally {
      setSettingPin(false)
    }
  }

  const handleClearPincode = async () => {
    setClearingPin(true)
    try {
      await api.clearPincode()
      setSettings((prev) => (prev ? { ...prev, pincode_set: false } : prev))
      setPinExpanded(false)
      flash('PIN code removed')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to clear pincode')
    } finally {
      setClearingPin(false)
    }
  }

  const handleAddEmail = async () => {
    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed.includes('@')) return
    setAddingEmail(true)
    try {
      await api.addWhitelistEmail(trimmed)
      setEmails((prev) => [...prev, trimmed])
      setNewEmail('')
      flash('Email added')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add email')
    } finally {
      setAddingEmail(false)
    }
  }

  const handleRemoveEmail = async (email: string) => {
    try {
      await api.removeWhitelistEmail(email)
      setEmails((prev) => prev.filter((e) => e !== email))
      flash('Email removed')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove email')
    }
  }

  const nextPriority = () => {
    if (rules.length === 0) return 100
    return Math.max(...rules.map((r) => r.priority)) + 10
  }

  const handleCreateRule = async (
    match?: string,
    value?: string,
    action?: 'DROP' | 'ACCEPT'
  ) => {
    const m = match || newMatch
    const v = value || newValue.trim()
    const a = action || newAction
    if (!v) return
    setCreating(true)
    setError('')
    try {
      await api.createRule({ match: m, value: v, action: a, priority: nextPriority() })
      setNewValue('')
      setShowAddRule(false)
      setShowCountryPicker(false)
      flash(`Rule created: ${a} ${m} ${v}`)
      const r = await api.listRules()
      setRules(r.rules || [])
      // Also fetch settings since apply_rules may have auto-enabled
      const s = await api.getSettings()
      setSettings(s)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create rule')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteRule = async (ruleId: number) => {
    try {
      await api.deleteRule(ruleId)
      const remaining = rules.filter((r) => r.ruleId !== ruleId)
      setRules(remaining)
      flash('Rule deleted')
      // If no rules left, auto-disable apply_rules
      if (remaining.length === 0 && settings?.apply_rules) {
        await api.updateSettings({ apply_rules: false })
        setSettings((prev) => (prev ? { ...prev, apply_rules: false } : prev))
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete rule')
    }
  }

  const handleSaveMaintenance = async () => {
    setSavingMaint(true)
    try {
      await api.updateSettings({
        maintenance_title: maintTitle,
        maintenance_message: maintMessage,
      })
      flash('Maintenance message saved')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save')
    } finally {
      setSavingMaint(false)
    }
  }

  // ── Derived state ──

  const passwordActive = settings?.password_set ?? false
  const pincodeActive = settings?.pincode_set ?? false
  const emailActive = settings?.email_whitelist_enabled ?? false
  const rulesActive = settings?.apply_rules && rules.length > 0
  const blocked = settings?.block_access ?? false
  const maintenance = settings?.maintenance_mode ?? false

  // ── Render ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Flash messages */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-xs text-error">
          <AlertTriangle size={13} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="p-0.5 hover:bg-error/20 rounded">
            <X size={12} />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 border border-success/30 text-xs text-success animate-in fade-in duration-200">
          <Check size={13} /> {success}
        </div>
      )}

      {/* ── Status strip ── */}
      <div className="flex flex-wrap items-center gap-1.5 px-1">
        {blocked ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-error/20 text-error border border-error/40">
            <Ban size={10} /> ALL ACCESS BLOCKED
          </span>
        ) : maintenance ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning/20 text-warning border border-warning/40">
            <Wrench size={10} /> MAINTENANCE MODE
          </span>
        ) : (
          <>
            <StatusPill label="Password" active={passwordActive} icon={<Lock size={9} />} />
            <StatusPill label="PIN" active={pincodeActive} icon={<Hash size={9} />} />
            <StatusPill label="Email Gate" active={emailActive} icon={<Mail size={9} />} />
            <StatusPill
              label={`Rules (${rules.length})`}
              active={!!rulesActive}
              icon={<Shield size={9} />}
            />
          </>
        )}
      </div>

      {/* ── Section 1: Authentication ── */}
      <Section
        title="Authentication"
        description={
          passwordActive || pincodeActive || emailActive
            ? 'Protected'
            : 'No auth — anyone with the link can access'
        }
      >
        <p className="text-[10px] text-text-muted -mt-1">
          Require visitors to verify before accessing this {entityLabel}.
        </p>

        {/* Password */}
        <div
          className={cn(
            'rounded-lg border transition-all',
            passwordActive
              ? 'border-primary/30 bg-primary/[0.04]'
              : 'border-border bg-surface/60'
          )}
        >
          <button
            onClick={() => {
              setPwExpanded(!pwExpanded)
              setPinExpanded(false)
            }}
            className="flex items-center justify-between w-full px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <Lock size={13} className={passwordActive ? 'text-primary' : 'text-text-muted'} />
              <span className="text-xs font-medium text-text">Password</span>
            </div>
            <span
              className={cn(
                'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full',
                passwordActive
                  ? 'bg-primary/15 text-primary'
                  : 'bg-surface-2 text-text-muted'
              )}
            >
              {passwordActive ? '● Active' : '○ Not Set'}
            </span>
          </button>
          {pwExpanded && (
            <div className="px-3 pb-3 space-y-2 border-t border-border/50">
              <p className="text-[10px] text-text-muted pt-2">
                {passwordActive
                  ? 'Update or change the current password.'
                  : `Set a password to protect this ${entityLabel}. Visitors will see a password prompt.`}
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 4 characters"
                    className="w-full px-2 py-1.5 pr-8 rounded-lg bg-bg border border-border text-xs text-text placeholder:text-text-muted focus:border-primary/50 focus:outline-none transition-colors"
                    onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                  >
                    {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                <button
                  onClick={handleSetPassword}
                  disabled={settingPwd || password.length < 4}
                  className="px-3 py-1.5 rounded-lg bg-primary text-bg text-[10px] font-bold hover:bg-primary-dim disabled:opacity-40 transition-colors"
                >
                  {settingPwd ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : passwordActive ? (
                    'Update'
                  ) : (
                    'Set'
                  )}
                </button>
              </div>
              {passwordActive && (
                <button
                  onClick={handleClearPassword}
                  disabled={clearingPwd}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-error/80 hover:bg-error/10 border border-error/20 transition-colors disabled:opacity-40"
                >
                  {clearingPwd ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                  Remove Password
                </button>
              )}
            </div>
          )}
        </div>

        {/* PIN Code */}
        <div
          className={cn(
            'rounded-lg border transition-all',
            pincodeActive
              ? 'border-primary/30 bg-primary/[0.04]'
              : 'border-border bg-surface/60'
          )}
        >
          <button
            onClick={() => {
              setPinExpanded(!pinExpanded)
              setPwExpanded(false)
            }}
            className="flex items-center justify-between w-full px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <Hash size={13} className={pincodeActive ? 'text-primary' : 'text-text-muted'} />
              <span className="text-xs font-medium text-text">PIN Code</span>
            </div>
            <span
              className={cn(
                'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full',
                pincodeActive
                  ? 'bg-primary/15 text-primary'
                  : 'bg-surface-2 text-text-muted'
              )}
            >
              {pincodeActive ? '● Active' : '○ Not Set'}
            </span>
          </button>
          {pinExpanded && (
            <div className="px-3 pb-3 space-y-2 border-t border-border/50">
              <p className="text-[10px] text-text-muted pt-2">
                {pincodeActive
                  ? 'Update or change the current PIN.'
                  : 'Set a 6-digit PIN code. Visitors will see a PIN entry screen.'}
              </p>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="● ● ● ● ● ●"
                  maxLength={6}
                  className="w-32 px-2 py-1.5 rounded-lg bg-bg border border-border text-xs text-text font-mono text-center tracking-[0.3em] focus:border-primary/50 focus:outline-none transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handleSetPincode()}
                />
                <button
                  onClick={handleSetPincode}
                  disabled={settingPin || !/^\d{6}$/.test(pincode)}
                  className="px-3 py-1.5 rounded-lg bg-primary text-bg text-[10px] font-bold hover:bg-primary-dim disabled:opacity-40 transition-colors"
                >
                  {settingPin ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : pincodeActive ? (
                    'Update'
                  ) : (
                    'Set'
                  )}
                </button>
              </div>
              {pincodeActive && (
                <button
                  onClick={handleClearPincode}
                  disabled={clearingPin}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-error/80 hover:bg-error/10 border border-error/20 transition-colors disabled:opacity-40"
                >
                  {clearingPin ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                  Remove PIN
                </button>
              )}
            </div>
          )}
        </div>

        {/* Email Whitelist */}
        <div
          className={cn(
            'rounded-lg border transition-all',
            emailActive
              ? 'border-primary/30 bg-primary/[0.04]'
              : 'border-border bg-surface/60'
          )}
        >
          <button
            onClick={() => setEmailExpanded(!emailExpanded)}
            className="flex items-center justify-between w-full px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <Mail size={13} className={emailActive ? 'text-primary' : 'text-text-muted'} />
              <span className="text-xs font-medium text-text">Email Gate</span>
              {emailActive && emails.length > 0 && (
                <span className="text-[9px] text-text-muted">
                  {emails.length} email{emails.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <span
              className={cn(
                'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full',
                emailActive
                  ? 'bg-primary/15 text-primary'
                  : 'bg-surface-2 text-text-muted'
              )}
            >
              {emailActive ? '● Enabled' : '○ Disabled'}
            </span>
          </button>
          {emailExpanded && (
            <div className="px-3 pb-3 space-y-2 border-t border-border/50">
              <div className="flex items-center justify-between pt-2">
                <p className="text-[10px] text-text-muted">
                  Only whitelisted emails can access (via one-time code).
                </p>
                <button
                  onClick={() =>
                    updateSetting('email_whitelist_enabled', !settings?.email_whitelist_enabled)
                  }
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold transition-all',
                    emailActive
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'bg-surface-2 text-text-muted border border-border hover:border-primary/30'
                  )}
                >
                  <Power size={9} />
                  {emailActive ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@example.com or *@company.com"
                  className="flex-1 px-2 py-1.5 rounded-lg bg-bg border border-border text-xs text-text placeholder:text-text-muted focus:border-primary/50 focus:outline-none transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                />
                <button
                  onClick={handleAddEmail}
                  disabled={addingEmail || !newEmail.includes('@')}
                  className="px-3 py-1.5 rounded-lg bg-primary text-bg text-[10px] font-bold hover:bg-primary-dim disabled:opacity-40 transition-colors"
                >
                  {addingEmail ? <Loader2 size={10} className="animate-spin" /> : 'Add'}
                </button>
              </div>
              {emails.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {emails.map((email) => (
                    <div
                      key={email}
                      className="flex items-center justify-between px-2 py-1 rounded bg-bg/80 group"
                    >
                      <span className="text-[11px] text-text font-mono">{email}</span>
                      <button
                        onClick={() => handleRemoveEmail(email)}
                        className="p-0.5 rounded text-text-muted hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* ── Section 2: IP & Geo Rules ── */}
      <Section
        title="IP & Geo Rules"
        description={
          rules.length > 0 ? `${rules.length} rule${rules.length !== 1 ? 's' : ''} active` : 'No rules'
        }
        defaultOpen={rules.length > 0}
      >
        <p className="text-[10px] text-text-muted -mt-1">
          Block or allow traffic by IP address, country, or network — evaluated before authentication.
        </p>

        {/* Warning: apply_rules on but no rules */}
        {settings?.apply_rules && rules.length === 0 && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-[10px] text-warning">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>
              Rules are enabled but no rules exist — <strong>all traffic is blocked by default</strong>.
              Add a rule or this will be auto-disabled.
            </span>
          </div>
        )}

        {/* Quick-add presets */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setShowCountryPicker(!showCountryPicker)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-[10px] font-medium text-text-dim hover:border-error/40 hover:text-error transition-all"
          >
            <Globe size={11} /> Block Country
          </button>
          <button
            onClick={() => {
              setNewMatch('IP')
              setNewAction('ACCEPT')
              setNewValue('')
              setShowAddRule(true)
              setShowCountryPicker(false)
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-[10px] font-medium text-text-dim hover:border-success/40 hover:text-success transition-all"
          >
            <ShieldCheck size={11} /> Allow IP
          </button>
          <button
            onClick={() => {
              setNewMatch('IP')
              setNewAction('DROP')
              setNewValue('')
              setShowAddRule(true)
              setShowCountryPicker(false)
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-[10px] font-medium text-text-dim hover:border-error/40 hover:text-error transition-all"
          >
            <ShieldOff size={11} /> Block IP
          </button>
          <button
            onClick={() => {
              setNewMatch('CIDR')
              setNewAction('ACCEPT')
              setNewValue('')
              setShowAddRule(true)
              setShowCountryPicker(false)
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-[10px] font-medium text-text-dim hover:border-success/40 hover:text-success transition-all"
          >
            <Zap size={11} /> Allow Range
          </button>
        </div>

        {/* Country picker */}
        {showCountryPicker && (
          <div className="p-3 rounded-lg bg-bg border border-border space-y-2">
            <label className="text-[10px] text-text-muted">
              Select a country to block — click to add rule instantly
            </label>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_COUNTRIES.map((c) => {
                const alreadyBlocked = rules.some(
                  (r) => r.match === 'COUNTRY' && r.value === c.code && r.action === 'DROP'
                )
                return (
                  <button
                    key={c.code}
                    disabled={creating || alreadyBlocked}
                    onClick={() => handleCreateRule('COUNTRY', c.code, 'DROP')}
                    className={cn(
                      'px-2 py-1 rounded text-[10px] font-medium border transition-all',
                      alreadyBlocked
                        ? 'bg-error/10 border-error/30 text-error/60 cursor-not-allowed'
                        : 'bg-surface border-border text-text hover:border-error/50 hover:bg-error/10 hover:text-error'
                    )}
                  >
                    {c.name} ({c.code}) {alreadyBlocked && '✓'}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2 items-center">
              <input
                placeholder="Other country code (e.g. UA)"
                maxLength={2}
                className="w-36 px-2 py-1.5 rounded-lg bg-surface border border-border text-xs text-text placeholder:text-text-muted focus:border-primary/50 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value.trim().toUpperCase()
                    if (val.length === 2) {
                      handleCreateRule('COUNTRY', val, 'DROP')
                      ;(e.target as HTMLInputElement).value = ''
                    }
                  }
                }}
              />
              <span className="text-[10px] text-text-muted">Press Enter to add</span>
            </div>
            <button
              onClick={() => setShowCountryPicker(false)}
              className="text-[10px] text-text-muted hover:text-text"
            >
              Close
            </button>
          </div>
        )}

        {/* Custom rule form */}
        {showAddRule && (
          <div className="p-3 rounded-lg bg-bg border border-border space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-text-muted block mb-1">Match Type</label>
                <select
                  value={newMatch}
                  onChange={(e) => setNewMatch(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-surface border border-border text-xs text-text"
                >
                  {Object.entries(MATCH_META).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-text-muted block mb-1">Action</label>
                <select
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value as 'DROP' | 'ACCEPT')}
                  className="w-full px-2 py-1.5 rounded-lg bg-surface border border-border text-xs text-text"
                >
                  <option value="ACCEPT">✅ Allow</option>
                  <option value="DROP">🚫 Block</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-text-muted block mb-1">
                {MATCH_META[newMatch]?.hint}
              </label>
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={MATCH_META[newMatch]?.placeholder}
                className="w-full px-2 py-1.5 rounded-lg bg-surface border border-border text-xs text-text placeholder:text-text-muted focus:border-primary/50 focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateRule()}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowAddRule(false)}
                className="px-3 py-1 text-[10px] text-text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                onClick={() => handleCreateRule()}
                disabled={creating || !newValue.trim()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-bg text-[10px] font-bold hover:bg-primary-dim disabled:opacity-40 transition-colors"
              >
                {creating && <Loader2 size={10} className="animate-spin" />}
                Add Rule
              </button>
            </div>
          </div>
        )}

        {/* Rule list */}
        {rules.length > 0 ? (
          <div className="space-y-1">
            {rules
              .sort((a, b) => a.priority - b.priority)
              .map((rule) => (
                <div
                  key={rule.ruleId}
                  className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-bg/80 border border-border group hover:border-border-bright transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0',
                        rule.action === 'DROP'
                          ? 'bg-error/15 text-error'
                          : 'bg-success/15 text-success'
                      )}
                    >
                      {rule.action === 'DROP' ? 'BLOCK' : 'ALLOW'}
                    </span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-surface-2 text-text-dim shrink-0">
                      {rule.match}
                    </span>
                    <code className="text-[11px] font-mono text-text truncate">{rule.value}</code>
                  </div>
                  <button
                    onClick={() => handleDeleteRule(rule.ruleId)}
                    className="p-1 rounded text-text-muted hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all shrink-0 ml-2"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
          </div>
        ) : (
          !showAddRule &&
          !showCountryPicker && (
            <p className="text-[10px] text-text-muted italic py-1">
              No IP or geo rules — all traffic proceeds to authentication checks.
            </p>
          )
        )}
      </Section>

      {/* ── Section 3: Emergency Controls ── */}
      <Section title="Emergency Controls" defaultOpen={blocked || maintenance} danger>
        <div className="grid grid-cols-2 gap-2">
          {/* Block All */}
          <button
            onClick={() => updateSetting('block_access', !settings?.block_access)}
            className={cn(
              'flex items-center gap-2 p-3 rounded-lg border transition-all text-left',
              blocked
                ? 'bg-error/15 border-error/40 text-error'
                : 'bg-bg/80 border-border text-text-muted hover:border-error/30 hover:text-error/80'
            )}
          >
            <Ban size={14} />
            <div>
              <div className="text-[11px] font-semibold">Block All</div>
              <div className="text-[9px] opacity-70">
                {blocked ? 'All access denied' : 'Deny everyone'}
              </div>
            </div>
          </button>

          {/* Maintenance */}
          <button
            onClick={() => updateSetting('maintenance_mode', !settings?.maintenance_mode)}
            className={cn(
              'flex items-center gap-2 p-3 rounded-lg border transition-all text-left',
              maintenance
                ? 'bg-warning/15 border-warning/40 text-warning'
                : 'bg-bg/80 border-border text-text-muted hover:border-warning/30 hover:text-warning/80'
            )}
          >
            <Wrench size={14} />
            <div>
              <div className="text-[11px] font-semibold">Maintenance</div>
              <div className="text-[9px] opacity-70">
                {maintenance ? 'Showing message' : 'Show a notice page'}
              </div>
            </div>
          </button>
        </div>

        {/* Maintenance message editor */}
        {maintenance && (
          <div className="space-y-2 pt-1">
            <input
              value={maintTitle}
              onChange={(e) => setMaintTitle(e.target.value)}
              placeholder="Maintenance title"
              className="w-full px-2 py-1.5 rounded-lg bg-bg border border-border text-xs text-text focus:border-warning/50 focus:outline-none"
            />
            <textarea
              value={maintMessage}
              onChange={(e) => setMaintMessage(e.target.value)}
              placeholder="We'll be back soon..."
              rows={2}
              className="w-full px-2 py-1.5 rounded-lg bg-bg border border-border text-xs text-text resize-none focus:border-warning/50 focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                onClick={handleSaveMaintenance}
                disabled={savingMaint}
                className="px-3 py-1 rounded-lg bg-warning text-bg text-[10px] font-bold hover:bg-warning/80 disabled:opacity-40 transition-colors"
              >
                {savingMaint ? <Loader2 size={10} className="animate-spin" /> : 'Save Message'}
              </button>
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}
