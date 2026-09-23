import { useState } from 'react'
import type { FormEvent } from 'react'
import { login, signup } from '../api'
import HandsomeDan from './HandsomeDan'

interface Props {
  onSignedIn: (username: string) => void
}

export default function Login({ onSignedIn }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const fn = isSignup ? signup : login
      const res = await fn(username.trim(), password)
      onSignedIn(res.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__dans" aria-hidden>
          <HandsomeDan furColor="#3b82f6" size={56} />
          <HandsomeDan furColor="#a855f7" size={56} />
          <HandsomeDan furColor="#22c55e" size={56} />
        </div>

        <h1 className="login__title">Yale SOM Course Explorer</h1>
        <p className="login__sub">
          {isSignup
            ? 'Create an account to save your chat history.'
            : 'Sign in to browse courses and pick up your chat where you left off.'}
        </p>

        <form className="login__form" onSubmit={onSubmit}>
          <label className="login__field">
            <span>Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              placeholder="your-name"
            />
          </label>

          <label className="login__field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
            />
          </label>

          {error ? (
            <p className="login__error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="login__submit" type="submit" disabled={busy}>
            {busy ? 'Working…' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="login__switch">
          {isSignup ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(isSignup ? 'login' : 'signup')
              setError('')
            }}
          >
            {isSignup ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  )
}
