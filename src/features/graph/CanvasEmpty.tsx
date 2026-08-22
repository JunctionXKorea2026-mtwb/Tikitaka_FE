import { useRunState, useRunStore } from '../../stores/runStore'

/** 아직 실행이 없을 때 캔버스 자리에 뜨는 안내. 입력창으로 시선을 보낸다. */
export function CanvasEmpty() {
  const run = useRunState()
  const conn = useRunStore((s) => s.conn)
  const submitting = useRunStore((s) => s.submitting)

  if (run.agentOrder.length > 0) return null

  const starting = submitting || conn === 'connecting'

  return (
    <div className="canvas-empty">
      <div className="canvas-empty__mark" aria-hidden>
        ◇
      </div>
      <h2>{starting ? '실행을 준비하는 중…' : '아래에 요청을 입력해 보세요'}</h2>
      <p>
        요청을 보내면 에이전트들이 생성되고, 서로 메시지를 주고받으며
        <br />
        도구를 호출하는 과정이 이 자리에 실시간으로 그려집니다.
      </p>
    </div>
  )
}
