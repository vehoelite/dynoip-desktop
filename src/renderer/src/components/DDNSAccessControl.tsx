import { useMemo } from 'react'
import {
  getDDNSAccessSettings,
  updateDDNSAccessSettings,
  listDDNSRules,
  createDDNSRule,
  deleteDDNSRule,
  setDDNSPassword,
  clearDDNSPassword,
  setDDNSPincode,
  clearDDNSPincode,
  getDDNSWhitelist,
  addDDNSWhitelistEmail,
  removeDDNSWhitelistEmail,
} from '../api/client'
import { AccessControlPanel, type AccessControlApi } from './AccessControlPanel'

export function DDNSAccessControl({ subdomain }: { subdomain: string }) {
  const api = useMemo<AccessControlApi>(
    () => ({
      getSettings: () => getDDNSAccessSettings(subdomain),
      updateSettings: (data) => updateDDNSAccessSettings(subdomain, data),
      listRules: () => listDDNSRules(subdomain),
      createRule: (data) => createDDNSRule(subdomain, data),
      deleteRule: (ruleId) => deleteDDNSRule(subdomain, ruleId),
      setPassword: (pw) => setDDNSPassword(subdomain, pw),
      clearPassword: () => clearDDNSPassword(subdomain),
      setPincode: (pin) => setDDNSPincode(subdomain, pin),
      clearPincode: () => clearDDNSPincode(subdomain),
      getWhitelist: () => getDDNSWhitelist(subdomain),
      addWhitelistEmail: (email) => addDDNSWhitelistEmail(subdomain, email),
      removeWhitelistEmail: (email) => removeDDNSWhitelistEmail(subdomain, email),
    }),
    [subdomain]
  )

  return <AccessControlPanel api={api} entityLabel="subdomain" />
}
