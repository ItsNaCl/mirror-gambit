import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CourseApi } from '../hooks/useCourse'
import { Glossed } from './Glossary'
import { HintBar } from './HintBar'

export function CoursesPanel({ api }: { api: CourseApi }) {
  if (!api.lesson || !api.course || !api.step) return <CourseList api={api} />
  const { course, lesson, step, index } = api
  const last = index === lesson.steps.length - 1
  const kind = api.task === 'wrong' ? 'warn' : api.task === 'solved' ? 'good' : api.task === 'revealed' ? 'warn' : 'info'

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <button className="btn small" onClick={api.exit}>
          <ChevronLeft /> All lessons
        </button>
        <span className="muted small-text">
          {course.title} · step {index + 1} of {lesson.steps.length}
        </span>
      </div>
      <h2>{lesson.title}</h2>
      <div className="progress" style={{ margin: '10px 0 16px' }}>
        <div style={{ width: `${Math.round(((index + (api.finished ? 1 : 0)) / lesson.steps.length) * 100)}%` }} />
      </div>

      {step.kind === 'read' ? (
        <div className="commentary">
          <p>
            <Glossed text={step.text} />
          </p>
        </div>
      ) : (
        <div className={'card ' + kind}>
          <h3>{api.task === 'solved' ? 'Well done' : api.task === 'revealed' ? 'The solution' : 'Your move'}</h3>
          <p className="small-text">
            <Glossed text={api.task === 'solved' || (api.task === 'revealed' && api.finished) ? step.success : (api.message ?? step.prompt)} />
          </p>
          {api.userToMove && <HintBar attempt={api.attempt} hintText={api.hintText} onGiveUp={api.giveUp} giveUpLabel="Show me" />}
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn small" onClick={() => api.goTo(index - 1)} disabled={index === 0}>
          <ChevronLeft /> Back
        </button>
        <span className="spacer" />
        <button className={'btn ' + (api.finished ? 'primary' : '')} onClick={api.next} disabled={!api.finished}>
          {last ? 'Finish lesson' : 'Next'} <ChevronRight />
        </button>
      </div>
    </div>
  )
}

function CourseList({ api }: { api: CourseApi }) {
  return (
    <div>
      <p className="muted" style={{ marginBottom: 16 }}>
        Short lessons with positions to solve. The text is written for this app and every position and solution is
        checked with Stockfish.
      </p>
      {api.courses.map((c) => (
        <section key={c.id} className="course-block">
          <div className="panel-head" style={{ marginBottom: 4 }}>
            <h2>{c.title}</h2>
            <span className="pill">{c.level}</span>
          </div>
          <p className="muted small-text" style={{ marginBottom: 8 }}>
            {c.summary}
          </p>
          <div className="opening-list">
            {c.lessons.map((l) => {
              const finished = api.done[`${c.id}/${l.id}`]
              return (
                <button key={l.id} className="opening-item" onClick={() => api.open(c.id, l.id)}>
                  <span className="name">
                    {l.title}
                    <span className="lesson-summary">{l.summary}</span>
                  </span>
                  {finished ? <span className="pill pos">Done</span> : <span className="rate">{l.steps.length} steps</span>}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
