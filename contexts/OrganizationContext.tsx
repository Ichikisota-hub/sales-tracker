'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Organization, OrganizationMember } from '@/lib/supabase'
import { createClient } from '@/lib/supabase-browser'
import { useAuth } from './AuthContext'

type OrganizationContextType = {
  organization: Organization | null
  membership: OrganizationMember | null
  organizationId: string | null
  role: 'admin' | 'manager' | 'member' | null
  isAdmin: boolean
  isManager: boolean
  loading: boolean
  reload: () => Promise<void>
}

const OrganizationContext = createContext<OrganizationContextType>({
  organization: null,
  membership: null,
  organizationId: null,
  role: null,
  isAdmin: false,
  isManager: false,
  loading: true,
  reload: async () => {},
})

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [membership, setMembership] = useState<OrganizationMember | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function load() {
    if (!user) {
      setOrganization(null)
      setMembership(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const { data } = await supabase
      .from('organization_members')
      .select('*, organizations(*)')
      .eq('user_id', user.id)
      .maybeSingle()

    if (data) {
      setMembership(data as OrganizationMember)
      setOrganization((data as any).organizations as Organization)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [user?.id])

  const role = membership?.role ?? null

  return (
    <OrganizationContext.Provider value={{
      organization,
      membership,
      organizationId: organization?.id ?? null,
      role,
      isAdmin: role === 'admin',
      isManager: role === 'admin' || role === 'manager',
      loading,
      reload: load,
    }}>
      {children}
    </OrganizationContext.Provider>
  )
}

export function useOrganization() {
  return useContext(OrganizationContext)
}
