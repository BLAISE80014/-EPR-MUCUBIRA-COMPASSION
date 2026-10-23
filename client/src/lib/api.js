export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 4000

export async function apiRequest(path, options = {}) {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    signal: externalSignal,
    ...requestOptions
  } = options
  const headers = new Headers(requestOptions.headers || {})
  let body = requestOptions.body

  if (body && !(body instanceof FormData) && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(body)
  }

  const controller = new AbortController()
  let timedOut = false
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abortRequest = () => controller.abort(externalSignal.reason)
  if (externalSignal?.aborted) abortRequest()
  else externalSignal?.addEventListener('abort', abortRequest, { once: true })

  let response
  let result
  try {
    response = await fetch(path, {
      ...requestOptions,
      body,
      headers,
      credentials: 'include',
      signal: controller.signal,
    })
    const contentType = response.headers.get('content-type') || ''
    result = contentType.includes('application/json') ? await response.json() : null
  } catch (error) {
    if (timedOut) {
      throw new ApiError('This request took too long. Check your connection and try again.', 408)
    }
    if (externalSignal?.aborted || error.name === 'AbortError') throw error
    if (error instanceof SyntaxError) {
      throw new ApiError('The API returned an invalid response. Please try again.', 502)
    }
    throw new ApiError('The API could not be reached. Start the backend and MongoDB, then try again.', 0)
  } finally {
    window.clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortRequest)
  }

  if (!response.ok) {
    const message = result?.message
      || (response.status >= 500
        ? 'The API is unavailable. Start the backend and MongoDB, then check http://localhost:5000/api/health for a connected status.'
        : `Request failed with status ${response.status}.`)
    throw new ApiError(message, response.status)
  }

  if (result === null) {
    throw new ApiError('The API returned an unexpected response. Check that the backend is running.', response.status)
  }

  return result
}
