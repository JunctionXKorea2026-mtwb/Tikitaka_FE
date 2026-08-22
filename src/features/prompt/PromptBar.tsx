import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { isLiveBackend } from '../../transport'
import { activeTurn, useRunStore } from '../../stores/runStore'
import { useViewStore } from '../../stores/viewStore'

const EXAMPLES = [
  '2024년 전기차 시장 규모와 성장률을 조사해서 리포트로 정리해줘',
  '경쟁사 3곳의 요금제를 비교해줘',
  '가격 피드 동기화 (장애 시나리오)',
]

export function PromptBar() {
  const submit = useRunStore((s) => s.submit)
  const submitting = useRunStore((s) => s.submitting)
  const conn = useRunStore((s) => activeTurn(s)?.conn ?? 'idle')
  const turnCount = useRunStore((s) => s.turns.length)

  const [text, setText] = useState('')
  // 3D도 "다음 질문이 어디에 붙는지"를 알아야 대상 원자를 표시할 수 있다
  const composeMode = useViewStore((s) => s.composeMode)
  const setComposeMode = useViewStore((s) => s.setComposeMode)
  const newTopic = composeMode === 'new'
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // 페이지에 들어오면 바로 입력할 수 있게
  useEffect(() => {
    areaRef.current?.focus()
  }, [])

  const busy = submitting || conn === 'connecting'
  const canSend = text.trim().length > 0 && !busy

  const resize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const send = () => {
    if (!canSend) return
    void submit(text, { newTopic })
    setText('')
    if (areaRef.current) {
      areaRef.current.style.height = 'auto'
      areaRef.current.focus()
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 전송, Shift+Enter 줄바꿈
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const useExample = (example: string) => {
    setText(example)
    const el = areaRef.current
    if (el) {
      el.focus()
      requestAnimationFrame(() => resize(el))
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    send()
  }

  return (
    <form className="prompt" onSubmit={onSubmit}>
      <div className="prompt__inner">
        {turnCount === 0 && (
          <div className="prompt__examples">
            <span className="prompt__examples-label">예시</span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="prompt__example"
                onClick={() => useExample(example)}
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {turnCount > 0 && (
          <div className="prompt__mode" role="group" aria-label="질문 방식">
            <button
              type="button"
              data-active={!newTopic || undefined}
              onClick={() => setComposeMode('follow')}
            >
              이어서 질문
            </button>
            <button
              type="button"
              data-active={newTopic || undefined}
              onClick={() => setComposeMode('new')}
            >
              새 주제
            </button>
          </div>
        )}

        <div className="prompt__field">
          <textarea
            ref={areaRef}
            className="prompt__input"
            rows={2}
            value={text}
            placeholder={
              turnCount === 0
                ? '에이전트에게 무엇을 요청할까요?'
                : newTopic
                  ? '새 주제로 물어보세요 — 앞 대화와 분리됩니다'
                  : '이어서 물어보세요 — 지금 보고 있는 턴의 맥락이 이어집니다'
            }
            onChange={(e) => {
              setText(e.target.value)
              resize(e.target)
            }}
            onKeyDown={onKeyDown}
          />

          <div className="prompt__actions">
            <span className="prompt__keys">
              <kbd>Enter</kbd> 전송 · <kbd>Shift</kbd>+<kbd>Enter</kbd> 줄바꿈
            </span>
            <button className="prompt__send" type="submit" disabled={!canSend}>
              {busy ? (
                '시작 중…'
              ) : (
                <>
                  실행 <span aria-hidden>↵</span>
                </>
              )}
            </button>
          </div>
        </div>

        {!isLiveBackend && (
          <p className="prompt__mock">
            MOCK 모드 — 입력한 요청으로 실행 시나리오를 생성해 재생합니다. 백엔드가 연결되면
            같은 요청이 실제 에이전트로 전달됩니다.
          </p>
        )}
      </div>
    </form>
  )
}
