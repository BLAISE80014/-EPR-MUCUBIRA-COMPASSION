import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const response = await apiRequest('/api/auth/me')
    setUser(response.user)
    return response.user
  }, [])

  useEffect(() => {
    let active = true
    apiRequest('/api/auth/me')
      .then((response) => {
        if (active) {
          setUser(response.user)
        }
      })
      .catch((error) => {
        if (active && error.status !== 401 && error.status < 500) {
          console.error('Unable to restore the current session:', error.message)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email, password, rememberMe, accountType) => {
    const response = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password, rememberMe, accountType },
    })
    setUser(response.user)
    return response.user
  }, [])

  const register = useCallback(async (registration) => {
    const response = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: registration,
    })
    setUser(response.user)
    return response
  }, [])

  const logout = useCallback(async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    login,
    register,
    logout,
    refreshUser,
  }), [user, loading, login, register, logout, refreshUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.')
  }
  return context
}
