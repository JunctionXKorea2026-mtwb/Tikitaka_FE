/**
 * 최소 3D 투영.
 *
 * three.js를 들이지 않고 canvas 2D에 직접 그리기 위한 것. 필요한 건 딱 두 가지다
 * — 궤도 회전(yaw/pitch)과 원근 투영. 노드가 20개 남짓이라 이걸로 충분하다.
 */

export interface Point3 {
  x: number
  y: number
  z: number
}

export interface Camera {
  /** Y축 회전 (좌우 궤도) */
  yaw: number
  /** X축 회전 (위아래 궤도) */
  pitch: number
  /** 카메라와 원점 사이 거리. 클수록 원근이 약해진다 */
  distance: number
  zoom: number
  /** 궤도의 중심 */
  target: Point3
}

export interface Projected {
  sx: number
  sy: number
  /** 원근 배율. 노드 크기·글자 크기·선 굵기에 곱한다 */
  scale: number
  /** 카메라 기준 깊이. 클수록 멀다 (페인터 알고리즘 정렬 키) */
  depth: number
}

const FOV = 700

export function project(p: Point3, cam: Camera, width: number, height: number): Projected | null {
  let x = p.x - cam.target.x
  let y = p.y - cam.target.y
  let z = p.z - cam.target.z

  // yaw — Y축 기준 회전
  const cy = Math.cos(cam.yaw)
  const sy = Math.sin(cam.yaw)
  const x1 = x * cy - z * sy
  const z1 = x * sy + z * cy
  x = x1
  z = z1

  // pitch — X축 기준 회전
  const cp = Math.cos(cam.pitch)
  const sp = Math.sin(cam.pitch)
  const y1 = y * cp - z * sp
  const z2 = y * sp + z * cp
  y = y1
  z = z2

  const depth = z + cam.distance
  // 카메라 뒤로 넘어간 점은 그리지 않는다
  if (depth <= 1) return null

  const scale = (FOV * cam.zoom) / depth
  return {
    sx: width / 2 + x * scale,
    sy: height / 2 + y * scale,
    scale,
    depth,
  }
}

/** 점들을 감싸는 박스의 중심. 궤도의 target으로 쓴다. */
export function centroid(points: Point3[]): Point3 {
  if (points.length === 0) return { x: 0, y: 0, z: 0 }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }

  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }
}

/** 그래프 전체가 화면에 들어오도록 거리를 정한다. */
export function fitDistance(points: Point3[]): number {
  if (points.length === 0) return 900

  const c = centroid(points)
  let maxR = 0
  for (const p of points) {
    const r = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z)
    if (r > maxR) maxR = r
  }
  return Math.max(650, maxR * 2.6)
}

export const clampPitch = (pitch: number) =>
  Math.max(-Math.PI / 2 + 0.12, Math.min(Math.PI / 2 - 0.12, pitch))
