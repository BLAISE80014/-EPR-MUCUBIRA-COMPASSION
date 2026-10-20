export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {})
  let body = options.body

  if (body && !(body instanceof FormData) && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(path, {
      ...options,
      body,
      headers,
      credentials: 'include',
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError('The API could not be reached. Start the backend and MongoDB, then try again.', 0)
  }
  const contentType = response.headers.get('content-type') || ''
  const result = contentType.includes('application/json') ? await response.json() : null

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
