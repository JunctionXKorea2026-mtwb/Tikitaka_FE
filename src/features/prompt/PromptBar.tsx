import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { isLiveBackend } from '../../transport'
import { useRunStore } from '../../stores/runStore'

const EXAMPLES = [
  '2024년 전기차 시장 규모와 성장률을 조사해서 리포트로 정리해줘',
  '가격 피드를 동기화해줘 (업스트림 장애 시나리오)',
]

export function PromptBar() {
  const submit = useRunStore((s) => s.submit)
  const submitting = useRunStore((s) => s.submitting)
  const conn = useRunStore((s) => s.conn)

  const [text, setText] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const busy = submitting || conn === 'connecting'
  const canSend = text.trim().length > 0 && !busy

  const send = () => {
    if (!canSend) return
    void submit(text)
    setText('')
    if (areaRef.current) areaRef.current.style.height = 'auto'
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 전송, Shift+Enter 줄바꿈
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    send()
  }

  return (
    <form className="prompt" onSubmit={onSubmit}>
      <div className="prompt__row">
        <textarea
          ref={areaRef}
          className="prompt__input"
          rows={1}
          value={text}
          placeholder="에이전트에게 요청할 내용을 입력하세요  (Enter 전송 · Shift+Enter 줄바꿈)"
          onChange={(e) => {
            setText(e.target.value)
            // 입력에 따라 높이를 늘린다 (최대 높이는 CSS가 잡는다)
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
          }}
          onKeyDown={onKeyDown}
        />
        <button className="prompt__send" type="submit" disabled={!canSend}>
          {busy ? '시작 중…' : '실행'}
        </button>
      </div>

      <div className="prompt__hint">
        {!isLiveBackend && (
          <span className="prompt__mock">
            MOCK — 프롬프트 내용과 무관하게 준비된 시나리오가 재생됩니다
          </span>
        )}
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className="prompt__example"
            onClick={() => setText(example)}
          >
            {example}
          </button>
        ))}
      </div>
    </form>
  )
}
