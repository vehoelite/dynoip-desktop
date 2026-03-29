/**
 * DynoIP Desktop — API Client
 * JWT auth with auto-refresh, electron-store persistence, full endpoint coverage.
 */

const API_BASE = 'https://dyno-ip.com/api';

// ── Types ──

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ── Token Storage ──
// Primary: localStorage (fast, synchronous, renderer-accessible)
// Backup: electron-store via IPC (persists across sessions, encrypted)

const TOKEN_KEY = 'dynoip_access_token';
const REFRESH_KEY = 'dynoip_refresh_token';

function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(tokens: TokenPair): void {
  localStorage.setItem(TOKEN_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  // Persist to electron-store for cross-session survival
  window.electron?.setTokens({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  window.electron?.clearTokens();
}

export function hasTokens(): boolean {
  return !!getAccessToken();
}

/**
 * Restore tokens from electron-store into localStorage on app start.
 * Call once before checking auth state.
 */
export async function restoreTokens(): Promise<boolean> {
  if (hasTokens()) return true;
  try {
    const stored = await window.electron?.getTokens();
    if (stored?.access_token && stored?.refresh_token) {
      localStorage.setItem(TOKEN_KEY, stored.access_token);
      localStorage.setItem(REFRESH_KEY, stored.refresh_token);
      return true;
    }
  } catch {
    // electron API not available (e.g., in tests)
  }
  return false;
}

// ── Core Fetch ──

let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (ok: boolean) => void;
}> = [];

function processRefreshQueue(success: boolean): void {
  refreshQueue.forEach((p) => p.resolve(success));
  refreshQueue = [];
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const tokens: TokenPair = await res.json();
    setTokens(tokens);
    return true;
  } catch {
    return false;
  }
}

async function waitForRefresh(): Promise<boolean> {
  return new Promise((resolve) => {
    refreshQueue.push({ resolve });
  });
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  // Only set Content-Type for requests with a body
  if (options.body) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Token expired — try refresh (with queue to prevent concurrent refreshes)
  if (res.status === 401 && retry) {
    if (isRefreshing) {
      const ok = await waitForRefresh();
      if (ok) return apiFetch<T>(path, options, false);
      throw new ApiError(401, 'Session expired');
    }

    isRefreshing = true;
    const refreshed = await refreshAccessToken();
    isRefreshing = false;
    processRefreshQueue(refreshed);

    if (refreshed) {
      return apiFetch<T>(path, options, false);
    }
    clearTokens();
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = body.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((d: { msg?: string }) => d.msg || JSON.stringify(d))
              .join('; ')
          : detail
            ? JSON.stringify(detail)
            : 'Request failed';
    throw new ApiError(res.status, message);
  }

  // 204 No Content — return null (caller must handle)
  if (res.status === 204) {
    return null as T;
  }

  return res.json();
}

// ── Auth API ──

export interface User {
  id: number;
  email: string;
  username: string;
  plan: string;
  is_active: boolean;
  is_admin?: boolean;
  is_banned?: boolean;
  oauth_provider?: string | null;
  avatar_url?: string | null;
  totp_enabled?: boolean;
  created_at: string;
}

interface LoginResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  requires_2fa?: boolean;
  challenge_token?: string;
}

export async function login(
  email: string,
  password: string
): Promise<User | { requires_2fa: true; challenge_token: string }> {
  const resp = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (resp.requires_2fa && resp.challenge_token) {
    return { requires_2fa: true, challenge_token: resp.challenge_token };
  }

  setTokens(resp as TokenPair);
  return getMe();
}

export async function login2FA(
  challengeToken: string,
  code: string
): Promise<User> {
  const tokens = await apiFetch<TokenPair>('/auth/login/2fa', {
    method: 'POST',
    body: JSON.stringify({ challenge_token: challengeToken, code }),
  });
  setTokens(tokens);
  return getMe();
}

export async function register(
  email: string,
  username: string,
  password: string
): Promise<User> {
  const tokens = await apiFetch<TokenPair>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, username, password }),
  });
  setTokens(tokens);
  return getMe();
}

export async function getMe(): Promise<User> {
  return apiFetch<User>('/auth/me');
}

export function logout(): void {
  clearTokens();
}

export async function forgotPassword(
  email: string
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  token: string,
  password: string
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

export async function deleteMyAccount(): Promise<{ message: string }> {
  return apiFetch('/auth/me', { method: 'DELETE' });
}

// ── OAuth (Desktop Flow) ──

export async function getOAuthUrl(
  provider: 'google' | 'github'
): Promise<{ auth_url: string; session_id: string }> {
  return apiFetch<{ auth_url: string; session_id: string }>(
    `/auth/oauth/${provider}?client=desktop`
  );
}

export async function pollOAuthTokens(
  sessionId: string
): Promise<TokenPair | null> {
  // Backend returns 204 when tokens aren't ready yet, or JSON tokens when ready
  const result = await apiFetch<TokenPair | null>(
    `/auth/oauth/poll/${sessionId}`,
    {},
    false // don't retry on 401
  );
  if (!result || !result.access_token) {
    return null; // Not ready yet (204)
  }
  setTokens(result);
  return result;
}

// ── 2FA Management ──

export interface TwoFactorSetup {
  secret: string;
  otpauth_uri: string;
  qr_code_base64: string;
}

export async function get2FAStatus(): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>('/auth/2fa/status');
}

export async function setup2FA(): Promise<TwoFactorSetup> {
  return apiFetch<TwoFactorSetup>('/auth/2fa/setup', { method: 'POST' });
}

export async function enable2FA(
  code: string
): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>('/auth/2fa/enable', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function disable2FA(
  code: string
): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>('/auth/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

// ── Dynamic IP (DDNS) API ──

export interface DynamicIP {
  id: number;
  subdomain: string;
  domain: string;
  full_hostname: string;
  current_ip: string | null;
  update_token: string;
  is_active: boolean;
  last_update: string | null;
  created_at: string;
  pangolin_enabled: boolean;
  pangolin_site_id: string | null;
  pangolin_resource_id: string | null;
  newt_id: string | null;
  newt_secret: string | null;
  cf_proxied: boolean;
  pangolin_ssl: boolean;
}

export interface AvailableDomains {
  domains: string[];
  default: string;
}

export interface IPLogEntry {
  old_ip: string | null;
  new_ip: string;
  source_ip: string | null;
  created_at: string;
}

export interface IPHistory {
  subdomain: string;
  entries: IPLogEntry[];
  total: number;
}

export async function getAvailableDomains(): Promise<AvailableDomains> {
  return apiFetch<AvailableDomains>('/ip/domains');
}

export async function listSubdomains(): Promise<DynamicIP[]> {
  return apiFetch<DynamicIP[]>('/ip/list');
}

export async function createSubdomain(
  subdomain: string,
  domain?: string
): Promise<DynamicIP> {
  const body: Record<string, string> = { subdomain };
  if (domain) body.domain = domain;
  return apiFetch<DynamicIP>('/ip/create', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteSubdomain(subdomain: string): Promise<void> {
  await apiFetch(`/ip/${subdomain}`, { method: 'DELETE' });
}

export async function refreshIP(
  subdomain: string,
  ip?: string
): Promise<{
  subdomain: string;
  domain: string;
  full_hostname: string;
  old_ip: string | null;
  new_ip: string;
  changed: boolean;
}> {
  const body = ip ? { ip } : undefined;
  return apiFetch(`/ip/refresh/${subdomain}`, {
    method: 'POST',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export async function regenerateToken(
  subdomain: string
): Promise<DynamicIP> {
  return apiFetch<DynamicIP>(`/ip/${subdomain}/regenerate-token`, {
    method: 'POST',
  });
}

export async function getIPHistory(
  subdomain: string,
  limit = 50
): Promise<IPHistory> {
  return apiFetch<IPHistory>(`/ip/history/${subdomain}?limit=${limit}`);
}

// ── DDNS Proxy / SSL Toggles ──

export interface DDNSProxyStatus {
  enabled: boolean;
  online: boolean;
  resource_id: string | null;
  newt_id: string | null;
  newt_secret: string | null;
  pangolin_endpoint: string | null;
}

export async function enableDDNSProxy(
  subdomain: string
): Promise<DynamicIP> {
  return apiFetch<DynamicIP>(`/ip/${subdomain}/proxy`, { method: 'POST' });
}

export async function disableDDNSProxy(
  subdomain: string
): Promise<DynamicIP> {
  return apiFetch<DynamicIP>(`/ip/${subdomain}/proxy`, {
    method: 'DELETE',
  });
}

export async function getDDNSProxyStatus(
  subdomain: string
): Promise<DDNSProxyStatus> {
  return apiFetch<DDNSProxyStatus>(`/ip/${subdomain}/proxy`);
}

export async function toggleCFSSL(subdomain: string): Promise<DynamicIP> {
  return apiFetch<DynamicIP>(`/ip/${subdomain}/cf-ssl`, { method: 'POST' });
}

export async function togglePangolinSSL(
  subdomain: string
): Promise<DynamicIP> {
  return apiFetch<DynamicIP>(`/ip/${subdomain}/pangolin-ssl`, {
    method: 'POST',
  });
}

// ── Tunnels API ──

export interface UserTunnel {
  id: number;
  name: string;
  domain?: string;
  subdomain?: string;
  target_ip?: string;
  target_port?: number;
  proxy_port?: number;
  protocol: string;
  proxied?: boolean;
  status: string;
  is_active: boolean;
  has_install_command: boolean;
  newt_id?: string;
  newt_secret?: string;
  pangolin_endpoint?: string;
  created_at: string;
  updated_at: string;
}

export interface UserTunnelCreateResult {
  tunnel: UserTunnel;
  install_command: string;
  newt_id: string;
  newt_secret: string;
  full_domain: string;
}

export async function listTunnels(): Promise<UserTunnel[]> {
  return apiFetch<UserTunnel[]>('/tunnels');
}

export async function createTunnel(data: {
  name: string;
  subdomain: string;
  domain?: string;
  target_ip?: string;
  target_port?: number;
  protocol?: string;
  proxied?: boolean;
}): Promise<UserTunnelCreateResult> {
  return apiFetch<UserTunnelCreateResult>('/tunnels', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listTunnelDomains(): Promise<string[]> {
  return apiFetch<string[]>('/tunnels/domains');
}

export async function syncTunnel(
  id: number
): Promise<{ message: string; status: string; online: boolean }> {
  return apiFetch(`/tunnels/${id}/sync`, { method: 'POST' });
}

export async function deleteTunnel(
  id: number
): Promise<{ message: string }> {
  return apiFetch(`/tunnels/${id}`, { method: 'DELETE' });
}

export async function getTunnelInstall(
  id: number,
  platform: 'linux' | 'windows' | 'docker' = 'linux'
): Promise<{
  platform: string;
  oneliner: string;
  service_script: string;
  instructions: string;
}> {
  return apiFetch(`/tunnels/${id}/install?platform=${platform}`);
}

// ── DNS Records API ──

export interface DNSRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: number;
  priority?: number | null;
  proxied: boolean;
  created_on?: string | null;
  modified_on?: string | null;
}

export interface DNSRecordCreate {
  subdomain: string;
  record_name: string;
  record_type: string;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
}

export interface DNSRecordUpdate {
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
}

export async function listDNSRecords(
  subdomain: string
): Promise<DNSRecord[]> {
  return apiFetch<DNSRecord[]>(`/dns/records/${subdomain}`);
}

export async function createDNSRecord(
  subdomain: string,
  record: DNSRecordCreate
): Promise<DNSRecord> {
  return apiFetch<DNSRecord>(`/dns/records/${subdomain}`, {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

export async function updateDNSRecord(
  subdomain: string,
  recordId: string,
  update: DNSRecordUpdate
): Promise<DNSRecord> {
  return apiFetch<DNSRecord>(`/dns/records/${subdomain}/${recordId}`, {
    method: 'PUT',
    body: JSON.stringify(update),
  });
}

export async function deleteDNSRecord(
  subdomain: string,
  recordId: string
): Promise<void> {
  await apiFetch(`/dns/records/${subdomain}/${recordId}`, {
    method: 'DELETE',
  });
}

export async function toggleDNSProxy(
  subdomain: string,
  recordId: string,
  proxied: boolean
): Promise<DNSRecord> {
  return apiFetch<DNSRecord>(
    `/dns/records/${subdomain}/${recordId}/proxy`,
    {
      method: 'PATCH',
      body: JSON.stringify({ proxied }),
    }
  );
}

// ── Activity Feed ──

export interface ActivityEvent {
  kind: string;
  timestamp: string;
  title: string;
  detail: string;
  source_ip: string | null;
  country: string | null;
  subdomain: string | null;
  extra: Record<string, unknown>;
}

export async function getActivity(
  limit = 100
): Promise<{ events: ActivityEvent[]; total: number; retention_hours: number }> {
  return apiFetch(`/ip/activity?limit=${limit}`);
}

// ── Visitor Stats ──

export interface VisitorEntry {
  visitor_ip: string;
  user_agent: string | null;
  referer: string | null;
  path: string;
  country: string | null;
  created_at: string;
}

export interface VisitorStats {
  subdomain: string;
  total_hits: number;
  unique_visitors: number;
  recent: VisitorEntry[];
}

export async function getSubdomainVisitors(
  subdomain: string,
  limit = 50
): Promise<VisitorStats> {
  return apiFetch<VisitorStats>(`/ip/visitors/${subdomain}?limit=${limit}`);
}

// ── Notification Settings ──

export interface NotificationSettings {
  notification_email: string;
  alert_login: boolean;
  alert_attack: boolean;
  alert_tunnel_offline: boolean;
  alert_ip_change: boolean;
  alert_bandwidth: boolean;
  bandwidth_threshold_pct: number;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  return apiFetch<NotificationSettings>('/ip/notifications');
}

export async function updateNotificationSettings(
  data: Partial<NotificationSettings>
): Promise<NotificationSettings> {
  return apiFetch<NotificationSettings>('/ip/notifications', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ── Blocked IPs ──

export interface BlockedIP {
  id: number;
  ip_address: string;
  subdomain: string;
  reason: string;
  source: string;
  created_at: string;
}

export async function listBlockedIPs(): Promise<{
  blocked: BlockedIP[];
  total: number;
}> {
  return apiFetch('/ip/blocked');
}

export async function blockIP(data: {
  ip_address: string;
  subdomain: string;
  reason: string;
}): Promise<BlockedIP> {
  return apiFetch('/ip/blocked', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function unblockIP(blockId: number): Promise<void> {
  await apiFetch(`/ip/blocked/${blockId}`, { method: 'DELETE' });
}

// ── Access Control (DDNS) ──

export interface AccessRule {
  ruleId: number;
  resourceId: number;
  action: 'ACCEPT' | 'DROP';
  match: 'CIDR' | 'IP' | 'PATH' | 'COUNTRY' | 'ASN';
  value: string;
  priority: number;
  enabled: boolean;
}

export interface AccessSettings {
  apply_rules: boolean;
  email_whitelist_enabled: boolean;
  block_access: boolean;
  sso: boolean;
  maintenance_mode: boolean;
  maintenance_title: string;
  maintenance_message: string;
  password_set?: boolean;
  pincode_set?: boolean;
}

export async function getDDNSAccessSettings(
  subdomain: string
): Promise<AccessSettings> {
  return apiFetch<AccessSettings>(`/ip/${subdomain}/access-settings`);
}

export async function updateDDNSAccessSettings(
  subdomain: string,
  data: Partial<AccessSettings>
): Promise<{ message: string }> {
  return apiFetch(`/ip/${subdomain}/access-settings`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ── Access Control (Tunnels) ──

export async function getTunnelAccessSettings(
  tunnelId: number
): Promise<AccessSettings> {
  return apiFetch<AccessSettings>(`/tunnels/${tunnelId}/access-settings`);
}

export async function updateTunnelAccessSettings(
  tunnelId: number,
  data: Partial<AccessSettings>
): Promise<{ message: string }> {
  return apiFetch(`/tunnels/${tunnelId}/access-settings`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function listTunnelRules(
  tunnelId: number
): Promise<{ rules: AccessRule[] }> {
  return apiFetch(`/tunnels/${tunnelId}/rules`);
}

export async function createTunnelRule(
  tunnelId: number,
  data: { match: string; value: string; action?: string; priority?: number; enabled?: boolean }
): Promise<AccessRule> {
  return apiFetch(`/tunnels/${tunnelId}/rules`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteTunnelRule(
  tunnelId: number,
  ruleId: number
): Promise<{ message: string }> {
  return apiFetch(`/tunnels/${tunnelId}/rules/${ruleId}`, { method: 'DELETE' });
}

export async function setTunnelPassword(
  tunnelId: number,
  password: string
): Promise<{ message: string }> {
  return apiFetch(`/tunnels/${tunnelId}/password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function clearTunnelPassword(
  tunnelId: number
): Promise<{ message: string }> {
  return apiFetch(`/tunnels/${tunnelId}/password`, { method: 'DELETE' });
}

export async function setTunnelPincode(
  tunnelId: number,
  pincode: string
): Promise<{ message: string }> {
  return apiFetch(`/tunnels/${tunnelId}/pincode`, {
    method: 'POST',
    body: JSON.stringify({ pincode }),
  });
}

export async function clearTunnelPincode(
  tunnelId: number
): Promise<{ message: string }> {
  return apiFetch(`/tunnels/${tunnelId}/pincode`, { method: 'DELETE' });
}

export async function getTunnelWhitelist(
  tunnelId: number
): Promise<{ whitelist: Array<{ email: string }> }> {
  return apiFetch(`/tunnels/${tunnelId}/whitelist`);
}

export async function addTunnelWhitelistEmail(
  tunnelId: number,
  email: string
): Promise<{ message: string }> {
  return apiFetch(`/tunnels/${tunnelId}/whitelist/add`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function removeTunnelWhitelistEmail(
  tunnelId: number,
  email: string
): Promise<{ message: string }> {
  return apiFetch(`/tunnels/${tunnelId}/whitelist/remove`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function toggleTunnelSSL(
  tunnelId: number,
  ssl: boolean
): Promise<{ message: string; ssl: boolean }> {
  return apiFetch(`/tunnels/${tunnelId}/ssl`, {
    method: 'PATCH',
    body: JSON.stringify({ ssl }),
  });
}

// ── Access Control (DDNS) — Rules, Password, Pincode, Whitelist ──

export async function listDDNSRules(
  subdomain: string
): Promise<{ rules: AccessRule[] }> {
  return apiFetch(`/ip/${subdomain}/rules`);
}

export async function createDDNSRule(
  subdomain: string,
  data: { match: string; value: string; action?: string; priority?: number; enabled?: boolean }
): Promise<AccessRule> {
  return apiFetch(`/ip/${subdomain}/rules`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteDDNSRule(
  subdomain: string,
  ruleId: number
): Promise<{ message: string }> {
  return apiFetch(`/ip/${subdomain}/rules/${ruleId}`, { method: 'DELETE' });
}

export async function setDDNSPassword(
  subdomain: string,
  password: string
): Promise<{ message: string }> {
  return apiFetch(`/ip/${subdomain}/password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function clearDDNSPassword(
  subdomain: string
): Promise<{ message: string }> {
  return apiFetch(`/ip/${subdomain}/password`, { method: 'DELETE' });
}

export async function setDDNSPincode(
  subdomain: string,
  pincode: string
): Promise<{ message: string }> {
  return apiFetch(`/ip/${subdomain}/pincode`, {
    method: 'POST',
    body: JSON.stringify({ pincode }),
  });
}

export async function clearDDNSPincode(
  subdomain: string
): Promise<{ message: string }> {
  return apiFetch(`/ip/${subdomain}/pincode`, { method: 'DELETE' });
}

export async function getDDNSWhitelist(
  subdomain: string
): Promise<{ whitelist: Array<{ email: string }> }> {
  return apiFetch(`/ip/${subdomain}/whitelist`);
}

export async function addDDNSWhitelistEmail(
  subdomain: string,
  email: string
): Promise<{ message: string }> {
  return apiFetch(`/ip/${subdomain}/whitelist/add`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function removeDDNSWhitelistEmail(
  subdomain: string,
  email: string
): Promise<{ message: string }> {
  return apiFetch(`/ip/${subdomain}/whitelist/remove`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

// ── Plans ──

export async function getServicePlans(): Promise<
  Array<{
    name: string;
    display_name: string;
    max_subdomains: number;
    max_tunnels: number;
    max_dns_records: number;
    price_monthly: number;
    features: string[];
  }>
> {
  const res = await apiFetch<{ plans: Array<{
    slug: string;
    name: string;
    price_monthly: number;
    max_subdomains: number;
    max_tunnels: number;
    max_dns_records_per_sub: number;
    monthly_bandwidth_mb: number;
    max_connections: number;
    analytics_retention_hours: number;
    custom_domains: boolean;
    priority_dns: boolean;
    priority_support: boolean;
    description: string;
  }> }>('/plans');
  return res.plans.map((p) => ({
    name: p.slug,
    display_name: p.name,
    max_subdomains: p.max_subdomains,
    max_tunnels: p.max_tunnels,
    max_dns_records: p.max_dns_records_per_sub,
    price_monthly: p.price_monthly,
    features: buildFeatures(p),
  }));
}

function buildFeatures(p: {
  monthly_bandwidth_mb: number;
  max_connections: number;
  analytics_retention_hours: number;
  custom_domains: boolean;
  priority_dns: boolean;
  priority_support: boolean;
  description: string;
}): string[] {
  const f: string[] = [];
  if (p.monthly_bandwidth_mb > 0) {
    f.push(`${p.monthly_bandwidth_mb >= 1024 ? `${Math.round(p.monthly_bandwidth_mb / 1024)} GB` : `${p.monthly_bandwidth_mb} MB`}/mo bandwidth`);
  } else {
    f.push('Unlimited bandwidth');
  }
  if (p.max_connections >= 9999) f.push('Unlimited connections');
  else f.push(`${p.max_connections} simultaneous connections`);
  if (p.analytics_retention_hours >= 720) f.push('30-day analytics');
  else if (p.analytics_retention_hours >= 168) f.push('7-day analytics');
  else f.push('24-hour analytics');
  if (p.custom_domains) f.push('Custom domains');
  if (p.priority_dns) f.push('Priority DNS');
  if (p.priority_support) f.push('Priority support');
  return f;
}
