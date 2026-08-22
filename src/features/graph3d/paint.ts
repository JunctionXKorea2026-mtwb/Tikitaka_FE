/** canvas에 쓰는 최소 색 유틸. 면 음영을 계산하는 데만 쓴다. */

export type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

/** 밝기 배율. 1을 넘으면 흰색 쪽으로, 밑돌면 검정 쪽으로 간다. */
export function shade(c: RGB, factor: number): RGB {
  if (factor >= 1) return mix(c, [255, 255, 255], Math.min(0.6, (factor - 1) * 0.5))
  return mix(c, [0, 0, 0], Math.min(0.85, 1 - factor))
}

export const css = (c: RGB, alpha = 1) =>
  alpha >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`
