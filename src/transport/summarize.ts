/**
 * Aigo LLM Summary API — `POST /api/llm/summarize`
 *
 * 서버가 입력 앞에 자기 요약 프롬프트를 붙여서 LLM에 넘긴다.
 * 그래서 길이·형식은 **입력 안에서 지시**해야 한다 (실제로 잘 먹는다).
 *
 * 응답은 OpenAI Responses 형식이라 텍스트가 output[].content[].text 에 있다.
 */

interface SummaryResponse {
  status?: string
  output?: { content?: { type?: string; text?: string }[] }[]
}

/** 응답에서 텍스트만 꺼낸다. 형식이 바뀌어도 조용히 빈 문자열이 되지 않게 확인한다. */
function extractText(data: SummaryResponse): string {
  const text = data.output
    ?.flatMap((o) => o.content ?? [])
    .map((c) => c.text ?? '')
    .join('')
    .trim()

  if (!text) throw new Error('요약 응답에서 텍스트를 찾지 못했습니다')
  return text
}

async function callSummarize(apiUrl: string, input: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${apiUrl}/api/llm/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
    body: JSON.stringify({ input }),
    signal,
  })
  if (!res.ok) throw new Error(`요약 실패: ${res.status} ${res.statusText}`)
  return extractText((await res.json()) as SummaryResponse)
}

/**
 * 모델이 붙이기 쉬운 군더더기를 떼어낸다.
 * 목록 기호·굵게 표시·머리말·따옴표, 그리고 LaTeX 구분자.
 *
 * 수식이 섞인 질문에서는 결론에 \(33/4\) 같은 표기가 그대로 나온다.
 * 우리 화면은 수식을 렌더하지 않으므로 구분자만 벗겨 내용을 남긴다.
 */
function tidy(text: string): string {
  return text
    .replace(/\\\((.+?)\\\)/g, '$1')
    .replace(/\\\[(.+?)\\\]/g, '$1')
    .replace(/\$\$?(.+?)\$\$?/g, '$1')
    .replace(/^\s*[*_#>\-•·]+\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^\s*(제목|요약)\s*[:：]\s*/i, '')
    .replace(/^["“”'']|["“”'']$/g, '')
    .trim()
}

/**
 * 질문을 짧은 제목으로.
 * 원자 라벨과 대화 목록에 쓰므로 한 줄이어야 한다.
 */
export async function summarizeTitle(
  apiUrl: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const text = await callSummarize(
    apiUrl,
    [
      '아래 질문을 한국어 명사구 한 줄 제목으로만 답하세요.',
      '20자 이내, 설명·머리말·따옴표·기호 없이 제목만.',
      '',
      `질문: ${prompt}`,
    ].join('\n'),
    signal,
  )

  const line = tidy(text).split('\n')[0].trim()
  return line.length > 30 ? `${line.slice(0, 30)}…` : line
}

/**
 * 토론 결론을 몇 문장으로.
 * 원문은 keyPoints·decisions까지 붙어 길기 때문에, 먼저 읽을 것을 따로 만든다.
 */
export async function summarizeResult(
  apiUrl: string,
  result: string,
  signal?: AbortSignal,
): Promise<string> {
  const text = await callSummarize(
    apiUrl,
    [
      '다음 토론 결론을 한국어 3문장 이내로 요약하세요.',
      '목록·머리말 없이 문장만 쓰세요.',
      '',
      `결론: ${result}`,
    ].join('\n'),
    signal,
  )
  return tidy(text)
}
