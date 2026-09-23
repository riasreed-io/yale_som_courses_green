const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

const TOKEN_KEY = 'som.token'
const USER_KEY = 'som.username'

/** One row of the `courses` table, as served by GET /api/courses. */
export interface Course {
  id: number
  course_id: string
  course_number: string
  course_title: string
  course_category: string
  course_type: string
  course_session: string
  course_description: string
  faculty_1: string
  faculty_1_email: string
  faculty_bio: string
  daytimes: string
  timings_day: string
  timings_start: string
  timings_end: string
  room: string
  section: string
  units: string
  term_code: string
  syllabus: string
  old_syllabus: string
}

export interface CoursesResponse {
  count: number
  courses: Course[]
}

export interface ChatReply {
  reply: string
  tools_used: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  tools_used: string[]
  created_at: string
}

export interface AuthResult {
  token: string
  username: string
}

/** Thrown when the backend rejects our token — the UI shows the login screen. */
export class UnauthorizedError extends Error {}

// --------------------------------------------------------------------------
// token storage
// --------------------------------------------------------------------------

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY)
}

export function setSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, username)
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

// --------------------------------------------------------------------------
// request helper
// --------------------------------------------------------------------------

async function request<T>(path: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  const token = getToken()
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_URL}${path}`, { ...init, headers, signal })

  if (res.status === 401) {
    clearSession()
    throw new UnauthorizedError('Your session ended. Please sign in again.')
  }
  if (!res.ok) {
    // FastAPI puts the readable reason in `detail`.
    let detail = `Server returned ${res.status}`
    try {
      const body = (await res.json()) as { detail?: string }
      if (body?.detail) detail = body.detail
    } catch {
      /* non-JSON error body — keep the status message */
    }
    throw new Error(detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// --------------------------------------------------------------------------
// endpoints
// --------------------------------------------------------------------------

export function fetchCourses(q: string, signal?: AbortSignal): Promise<CoursesResponse> {
  const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
  return request<CoursesResponse>(`/api/courses${query}`, undefined, signal)
}

export function sendChat(message: string): Promise<ChatReply> {
  return request<ChatReply>('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
}

export function fetchHistory(): Promise<ChatMessage[]> {
  return request<ChatMessage[]>('/api/chat/history')
}

export function clearHistory(): Promise<{ deleted: number }> {
  return request<{ deleted: number }>('/api/chat/history', { method: 'DELETE' })
}

function authRequest(path: string, username: string, password: string): Promise<AuthResult> {
  return request<AuthResult>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

export function login(username: string, password: string): Promise<AuthResult> {
  return authRequest('/api/auth/login', username, password)
}

export function signup(username: string, password: string): Promise<AuthResult> {
  return authRequest('/api/auth/signup', username, password)
}
