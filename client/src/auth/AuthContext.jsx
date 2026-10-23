import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { apiRequest } from '../lib/api'

const AuthContext = createContext(null)
const SESSION_REQUEST_TIMEOUT_MS = 4000

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState('')
  const sessionRequestRef = useRef(null)

  const restoreSession = useCallback(async (signal, didTimeout) => {
    try {
      const response = await apiRequest('/api/auth/me', { signal })
      setUser(response.user)
      return response.user
    } catch (error) {
      if (error.status === 401) {
        setUser(null)
        return null
      }
      if (!signal.aborted || didTimeout()) {
        const message = didTimeout()
          ? 'The server is taking too long to respond. Check that the backend and database are running, then retry.'
          : error.message
        setSessionError(message)
        console.error('Unable to restore the current session:', error)
      }
      return null
    } finally {
      if (!signal.aborted || didTimeout()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let timedOut = false
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, SESSION_REQUEST_TIMEOUT_MS)
    sessionRequestRef.current = controller
    restoreSession(controller.signal, () => timedOut)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
      if (sessionRequestRef.current === controller) sessionRequestRef.current = null
    }
  }, [restoreSession])

  const retrySession = useCallback(async () => {
    sessionRequestRef.current?.abort()
    const controller = new AbortController()
    let timedOut = false
    setLoading(true)
    setSessionError('')
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, SESSION_REQUEST_TIMEOUT_MS)
    sessionRequestRef.current = controller
    try {
      await restoreSession(controller.signal, () => timedOut)
    } finally {
      window.clearTimeout(timeoutId)
      if (sessionRequestRef.current === controller) sessionRequestRef.current = null
    }
  }, [restoreSession])

  const refreshUser = useCallback(async () => {
    const response = await apiRequest('/api/auth/me')
    setUser(response.user)
    setSessionError('')
    return response.user
  }, [])

  const updateProfile = useCallback(async (profile) => {
    const response = await apiRequest('/api/auth/profile', {
      method: 'PATCH',
      body: profile,
    })
    setUser(response.user)
    return response.user
  }, [])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    return apiRequest('/api/auth/password', {
      method: 'PATCH',
      body: { currentPassword, newPassword },
    })
  }, [])

  const login = useCallback(async (email, password, rememberMe, accountType) => {
    const response = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password, rememberMe, accountType },
    })
    setUser(response.user)
    setSessionError('')
    return response.user
  }, [])

  const register = useCallback(async (registration) => {
    const response = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: registration,
    })
    setUser(response.user)
    setSessionError('')
    return response
  }, [])

  const logout = useCallback(async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' })
    setUser(null)
    setSessionError('')
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    sessionError,
    login,
    register,
    logout,
    refreshUser,
    updateProfile,
    changePassword,
    retrySession,
  }), [user, loading, sessionError, login, register, logout, refreshUser, updateProfile, changePassword, retrySession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.')
  }
  return context
}
