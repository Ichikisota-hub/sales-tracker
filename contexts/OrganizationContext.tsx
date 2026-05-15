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

    // organization_members を取得（複数ある場合は最初の1件）
    const { data: membersData, error: memberError } = await supabase
      .from('organization_members')
      .select('*')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true })
      .limit(1)

    const memberData = membersData?.[0] ?? null

    if (memberError) {
      console.error('organization_members error:', memberError)
      setMembership(null)
      setOrganization(null)
      setLoading(false)
      return
    }

    // membership がない、または sales_rep_id が未設定の場合は auto-provision を呼ぶ
    const needsProvision = !memberData || !memberData.sales_rep_id

    if (memberData) {
      setMembership(memberData as OrganizationMember)

      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', memberData.organization_id)
        .maybeSingle()
      if (orgData) setOrganization(orgData as Organization)
    }

    if (needsProvision) {
      try {
        const session = (await supabase.auth.getSession()).data.session
        const res = await fetch('/api/auth/auto-provision', {
          method: 'POST',
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        })
        if (res.ok) {
          const result = await res.json()
          if (result.provisioned) {
            // 再取得して state を更新
            const { data: refreshedData } = await supabase
              .from('organization_members')
              .select('*')
              .eq('user_id', user.id)
              .order('joined_at', { ascending: true })
              .limit(1)

            const refreshed = refreshedData?.[0] ?? null
            if (refreshed) {
              setMembership(refreshed as OrganizationMember)
              const { data: orgData } = await supabase
                .from('organizations')
                .select('*')
                .eq('id', refreshed.organization_id)
                .maybeSingle()
              if (orgData) setOrganization(orgData as Organization)
            }
          }
        }
      } catch (e) {
        console.error('auto-provision error:', e)
      }
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
