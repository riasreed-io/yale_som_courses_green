import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import Markdown from 'react-markdown'
import { clearHistory, fetchHistory, sendChat, UnauthorizedError } from '../api'

interface Message {
  role: 'user' | 'assistant'
  text: string
  tools?: string[]
  error?: boolean
}

const SUGGESTIONS = [
  'Which finance courses are offered?',
  'What does Uri Simonsohn teach?',
  'What meets on Wednesdays?',
]

const TOOL_LABELS: Record<string, string> = {
  search_courses: 'Course search',
  web_search: 'Web search',
}

interface Props {
  onUnauthorized: () => void
}

export default function ChatPanel({ onUnauthorized }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const loadedHistory = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)

  // Saved history comes back from the database the first time the panel opens.
  useEffect(() => {
    if (!open || loadedHistory.current) return
    loadedHistory.current = true
    fetchHistory()
      .then((rows) =>
        setMessages(
          rows.map((r) => ({
            role: r.role,
            text: r.content,
            tools: r.tools_used,
          })),
        ),
      )
      .catch((e: unknown) => {
        if (e instanceof UnauthorizedError) onUnauthorized()
      })
  }, [open, onUnauthorized])

  async function onClear() {
    try {
      await clearHistory()
      setMessages([])
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized()
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy, open])

  async function submit(text: string) {
    const message = text.trim()
    if (!message || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: message }])
    setBusy(true)
    try {
      const res = await sendChat(message)
      setMessages((m) => [...m, { role: 'assistant', text: res.reply, tools: res.tools_used }])
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        onUnauthorized()
        return
      }
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: 'Could not reach the course agent. Is the backend running on port 8000?', error: true },
      ])
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void submit(input)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit(input)
    }
  }

  if (!open) {
    return (
      <button type="button" className="chat-launcher" onClick={() => setOpen(true)} aria-label="Open course assistant">
        <span className="chat-launcher__icon" aria-hidden>💬</span>
        Ask the course assistant
      </button>
    )
  }

  return (
    <section className="chat" aria-label="Course assistant">
      <header className="chat__head">
        <div>
          <strong>Course assistant</strong>
          <span>Ask about any Yale SOM course</span>
        </div>
        <div className="chat__headbtns">
          {messages.length > 0 ? (
            <button type="button" onClick={() => void onClear()} title="Delete saved history">
              Clear
            </button>
          ) : null}
          <button type="button" onClick={() => setOpen(false)} aria-label="Close chat">
            ✕
          </button>
        </div>
      </header>

      <div className="chat__body">
        {messages.length === 0 ? (
          <div className="chat__empty">
            <p>Hi! I search the Yale SOM course list and the web to answer your questions.</p>
            <div className="chat__suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => void submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div key={i} className={`msg msg--${m.role} ${m.error ? 'msg--error' : ''}`}>
            <div className="msg__bubble">
              {m.role === 'assistant' ? <Markdown>{m.text}</Markdown> : m.text}
            </div>
            {m.tools && m.tools.length > 0 ? (
              <div className="msg__tools">
                <span>Used</span>
                {m.tools.map((t) => (
                  <code key={t} title={t}>
                    {TOOL_LABELS[t] ?? t}
                  </code>
                ))}
              </div>
            ) : null}
          </div>
        ))}

        {busy ? (
          <div className="msg msg--assistant" role="status" aria-live="polite">
            <div className="msg__bubble msg__bubble--busy">
              <span className="spinner" aria-hidden />
              Searching courses…
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form className="chat__form" onSubmit={onSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about a course, professor, or day…"
          rows={1}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  )
}
