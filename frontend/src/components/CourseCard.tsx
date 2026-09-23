import { useState } from 'react'
import type { Course } from '../api'
import HandsomeDan from './HandsomeDan'

// Just for fun: a ROYGBIV rainbow of coat colors, each course gets a stable one based on its number.
const FUR_PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#4f46e5', '#a855f7']

function furColorFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return FUR_PALETTE[hash % FUR_PALETTE.length]
}

const CATEGORY_HUES: Record<string, string> = {
  Core: 'core',
  EMBA: 'emba',
  PhD: 'phd',
  Finance: 'finance',
  Economics: 'economics',
  Marketing: 'marketing',
  Accounting: 'accounting',
}

function initials(name: string): string {
  const [last = '', first = ''] = (name ?? '').split(',').map((s) => s.trim())
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '?'
}

function displayName(name: string): string {
  const [last, first] = (name ?? '').split(',').map((s) => s.trim())
  return first ? `${first} ${last}` : name
}

function sessionLabel(session: string | null): string {
  // DB columns can be NULL where the old JSON had an empty string.
  return (session ?? '').replace('fall-', 'Fall ').replace(/^fall$/, 'Fall (full term)') || 'TBA'
}

export default function CourseCard({ course }: { course: Course }) {
  const [open, setOpen] = useState(false)
  const category = course.course_category
  const hue = CATEGORY_HUES[category] ?? 'default'
  const syllabus = course.syllabus || course.old_syllabus
  const faculty = course.faculty_1
  const description = (course.course_description ?? '').trim()
  const dan = furColorFor(`${course.course_number}${course.section}`)

  return (
    <article className={`card card--${hue}`}>
      <div className="card__headrow">
        <div className="card__headtext">
          <header className="card__top">
            <span className="card__number">
              {course.course_number}
              {course.section ? <span className="card__section"> · §{course.section}</span> : null}
            </span>
            <span className="chip">{category}</span>
          </header>

          <h3 className="card__title">{course.course_title}</h3>
        </div>

        <HandsomeDan furColor={dan} size={72} className="card__dan" />
      </div>

      {faculty ? (
        <div className="card__faculty">
          <span className="avatar" aria-hidden>
            {initials(faculty)}
          </span>
          <span>{displayName(faculty)}</span>
        </div>
      ) : (
        <div className="card__faculty card__faculty--tba">Instructor TBA</div>
      )}

      <dl className="card__facts">
        <div>
          <dt>When</dt>
          <dd>{course.daytimes || 'TBA'}</dd>
        </div>
        <div>
          <dt>Where</dt>
          <dd>{course.room || 'TBA'}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{sessionLabel(course.course_session)}</dd>
        </div>
        <div>
          <dt>Units</dt>
          <dd>{course.units}</dd>
        </div>
      </dl>

      {description ? (
        <p className={`card__desc ${open ? 'card__desc--open' : ''}`}>{description}</p>
      ) : null}

      {open && course.faculty_bio ? (
        <p className="card__bio">
          <strong>About the instructor.</strong> {(course.faculty_bio ?? '').replace(/\(\[.*?\]\(.*?\)\)/g, '').trim()}
        </p>
      ) : null}

      <footer className="card__footer">
        <span className="badge">{course.course_type}</span>
        <div className="card__actions">
          {syllabus ? (
            <a href={syllabus} target="_blank" rel="noreferrer">
              Syllabus ↗
            </a>
          ) : null}
          {description || course.faculty_bio ? (
            <button type="button" onClick={() => setOpen((v) => !v)}>
              {open ? 'Show less' : 'Show more'}
            </button>
          ) : null}
        </div>
      </footer>
    </article>
  )
}
