import { useCallback, useEffect, useMemo, useState } from 'react'
import { clearSession, fetchCourses, getUsername, UnauthorizedError } from './api'
import type { Course } from './api'
import ChatPanel from './components/ChatPanel'
import CourseCard from './components/CourseCard'
import Login from './components/Login'

export default function App() {
  const [username, setUsername] = useState<string | null>(getUsername())
  const [query, setQuery] = useState('')
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('All')

  const signOut = useCallback(() => {
    clearSession()
    setUsername(null)
    setCourses([])
  }, [])

  useEffect(() => {
    if (!username) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      fetchCourses(query, controller.signal)
        .then((res) => {
          setCourses(res.courses)
          setError('')
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          if (e instanceof UnauthorizedError) {
            signOut()
            return
          }
          setError('Could not load courses. Start the backend: uvicorn main:app --port 8000')
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, username, signOut])

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of courses) counts.set(c.course_category, (counts.get(c.course_category) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [courses])

  if (!username) {
    return <Login onSignedIn={setUsername} />
  }

  const shown = category === 'All' ? courses : courses.filter((c) => c.course_category === category)

  return (
    <>
      <header className="hero">
        <div className="hero__inner">
          <div className="hero__account">
            <span>
              Signed in as <strong>{username}</strong>
            </span>
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </div>

          <p className="hero__eyebrow">Yale School of Management</p>
          <h1>Course Explorer</h1>
          <p className="hero__sub">Browse the full course list, or ask the assistant in the corner.</p>
          <input
            className="search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCategory('All')
            }}
            placeholder="Search by title, number, professor, day…"
            aria-label="Search courses"
          />
        </div>
      </header>

      <main className="main">
        <div className="filters" role="group" aria-label="Filter by category">
          <button type="button" className={category === 'All' ? 'is-on' : ''} onClick={() => setCategory('All')}>
            All <span>{courses.length}</span>
          </button>
          {categories.map(([name, n]) => (
            <button
              key={name}
              type="button"
              className={category === name ? 'is-on' : ''}
              onClick={() => setCategory(name)}
            >
              {name} <span>{n}</span>
            </button>
          ))}
        </div>

        {error ? <p className="notice notice--error">{error}</p> : null}
        {loading && courses.length === 0 && !error ? <p className="notice">Loading courses…</p> : null}
        {!loading && !error && shown.length === 0 ? <p className="notice">No courses match that search.</p> : null}

        {!error ? (
          <>
            <p className="count">
              {shown.length} {shown.length === 1 ? 'course' : 'courses'}
            </p>
            <div className={`grid ${loading ? 'grid--loading' : ''}`}>
              {shown.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          </>
        ) : null}
      </main>

      <ChatPanel onUnauthorized={signOut} />
    </>
  )
}
