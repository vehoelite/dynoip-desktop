import { useMemo } from 'react'
import {
  getTunnelAccessSettings,
  updateTunnelAccessSettings,
  listTunnelRules,
  createTunnelRule,
  deleteTunnelRule,
  setTunnelPassword,
  clearTunnelPassword,
  setTunnelPincode,
  clearTunnelPincode,
  getTunnelWhitelist,
  addTunnelWhitelistEmail,
  removeTunnelWhitelistEmail,
} from '../api/client'
import { AccessControlPanel, type AccessControlApi } from './AccessControlPanel'

export function TunnelAccessControl({ tunnelId }: { tunnelId: number }) {
  const api = useMemo<AccessControlApi>(
    () => ({
      getSettings: () => getTunnelAccessSettings(tunnelId),
      updateSettings: (data) => updateTunnelAccessSettings(tunnelId, data),
      listRules: () => listTunnelRules(tunnelId),
      createRule: (data) => createTunnelRule(tunnelId, data),
      deleteRule: (ruleId) => deleteTunnelRule(tunnelId, ruleId),
      setPassword: (pw) => setTunnelPassword(tunnelId, pw),
      clearPassword: () => clearTunnelPassword(tunnelId),
      setPincode: (pin) => setTunnelPincode(tunnelId, pin),
      clearPincode: () => clearTunnelPincode(tunnelId),
      getWhitelist: () => getTunnelWhitelist(tunnelId),
      addWhitelistEmail: (email) => addTunnelWhitelistEmail(tunnelId, email),
      removeWhitelistEmail: (email) => removeTunnelWhitelistEmail(tunnelId, email),
    }),
    [tunnelId]
  )

  return <AccessControlPanel api={api} entityLabel="tunnel" />
}
