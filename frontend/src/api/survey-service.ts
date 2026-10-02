import { listRows, saveRows } from '@/data/local-store'
import { addTodo } from '@/data/todo-store'
import type { ActionResult, EntryRow } from '@/data/types'

// 测绘控制点的专用读写：检索、登记去重、废弃批复都走这里，页面不做业务判断。
const MODULE_KEY = 'survey'

// 测区控制网的有效坐标范围，超出范围的坐标按无效值退回。
export const NORTH_RANGE = { min: 528000, max: 529000 }
export const EAST_RANGE = { min: 415000, max: 416000 }

export const SURVEY_LEVELS = ['首级控制', '加密控制', '图根控制']

export type SurveyQuery = {
  code: string
  levels: string[]
  northMin: string
  northMax: string
  eastMin: string
  eastMax: string
}

export const EMPTY_QUERY: SurveyQuery = {
  code: '',
  levels: [],
  northMin: '',
  northMax: '',
  eastMin: '',
  eastMax: '',
}

type SurveyCondition = {
  label: string
  test: (row: EntryRow) => boolean
}

export type SurveySearchOutcome = {
  items: EntryRow[]
  total: number
  queryError: string
  blockers: string[]
  conditionStats: { label: string; matched: number }[]
}

export type SurveyPointInput = {
  点位编号: string
  控制等级: string
  北坐标: string
  东坐标: string
  高程值: string
  布设日期: string
  校核日期: string
}

export type SurveyWriteResult = ActionResult & {
  created: boolean
  invalidCoordinates: boolean
}

function toNumber(raw: unknown): number | null {
  if (raw === '' || raw === undefined || raw === null) {
    return null
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function coordinateInRange(axis: 'north' | 'east', value: number): boolean {
  const range = axis === 'north' ? NORTH_RANGE : EAST_RANGE
  return value >= range.min && value <= range.max
}

function rangeError(axisLabel: string): string {
  const range = axisLabel === '北坐标' ? NORTH_RANGE : EAST_RANGE
  return `${axisLabel}的有效范围是 ${range.min}–${range.max}`
}

function buildConditions(query: SurveyQuery): { conditions: SurveyCondition[]; error: string } {
  const conditions: SurveyCondition[] = []
  const code = query.code.trim()
  if (code) {
    conditions.push({
      label: `点位编号包含「${code}」`,
      test: (row) => String(row['点位编号'] ?? '').includes(code),
    })
  }
  if (query.levels.length > 0) {
    const chosen = [...query.levels]
    conditions.push({
      label: `控制等级为「${chosen.join('、')}」`,
      test: (row) => chosen.includes(String(row['控制等级'] ?? '')),
    })
  }
  const axes = [
    { label: '北坐标', minRaw: query.northMin, maxRaw: query.northMax },
    { label: '东坐标', minRaw: query.eastMin, maxRaw: query.eastMax },
  ]
  for (const axis of axes) {
    const hasMin = axis.minRaw.trim() !== ''
    const hasMax = axis.maxRaw.trim() !== ''
    if (!hasMin && !hasMax) {
      continue
    }
    const min = hasMin ? toNumber(axis.minRaw.trim()) : null
    const max = hasMax ? toNumber(axis.maxRaw.trim()) : null
    if ((hasMin && min === null) || (hasMax && max === null)) {
      return { conditions: [], error: `${axis.label}区间里填的不是数值，请填成像 528300 这样的数字` }
    }
    if (min !== null && max !== null && min > max) {
      return { conditions: [], error: `${axis.label}区间的下限比上限还大，请调整后再查` }
    }
    const parts: string[] = []
    if (min !== null) {
      parts.push(`≥ ${min}`)
    }
    if (max !== null) {
      parts.push(`≤ ${max}`)
    }
    conditions.push({
      label: `${axis.label}${parts.join(' 且 ')}`,
      test: (row) => {
        const value = toNumber(row[axis.label])
        if (value === null) {
          return false
        }
        if (min !== null && value < min) {
          return false
        }
        if (max !== null && value > max) {
          return false
        }
        return true
      },
    })
  }
  return { conditions, error: '' }
}

// 几项条件一起用时取交集；命中为空时回传每个条件单独命中的条数，方便说明是谁卡住的。
export function searchSurveyPoints(query: SurveyQuery): SurveySearchOutcome {
  const rows = listRows(MODULE_KEY)
  const { conditions, error } = buildConditions(query)
  if (error) {
    return { items: [], total: 0, queryError: error, blockers: [], conditionStats: [] }
  }
  const items = rows.filter((row) => conditions.every((condition) => condition.test(row)))
  const conditionStats = conditions.map((condition) => ({
    label: condition.label,
    matched: rows.filter(condition.test).length,
  }))
  const blockers =
    items.length === 0
      ? conditionStats.filter((stat) => stat.matched === 0).map((stat) => stat.label)
      : []
  return { items, total: items.length, queryError: '', blockers, conditionStats }
}

export function getSurveyPoint(id: number): EntryRow | undefined {
  return listRows(MODULE_KEY).find((row) => Number(row.id) === id)
}

// 同一个点位编号再次提交只保留一条：命中已有编号就在原记录上更新，不再新增。
// 已废弃的点位坐标沿用废弃时的历史取值，新提交的坐标不覆盖。
export function upsertSurveyPoint(input: SurveyPointInput): SurveyWriteResult {
  const code = input.点位编号.trim()
  if (!code) {
    return { ok: false, created: false, invalidCoordinates: false, message: '点位编号不能为空' }
  }
  const north = toNumber(input.北坐标.trim())
  const east = toNumber(input.东坐标.trim())
  const invalid: string[] = []
  if (north === null || !coordinateInRange('north', north)) {
    invalid.push(`北坐标「${input.北坐标.trim() || '空'}」`)
  }
  if (east === null || !coordinateInRange('east', east)) {
    invalid.push(`东坐标「${input.东坐标.trim() || '空'}」`)
  }
  if (invalid.length > 0) {
    return {
      ok: false,
      created: false,
      invalidCoordinates: true,
      message: `${invalid.join('、')}超出测区范围（${rangeError('北坐标')}，${rangeError('东坐标')}），已按无效值退回，请核对后重新提交`,
    }
  }
  // 走到这里坐标一定通过校验，转成确定的数值再落库
  const validNorth = Number(north)
  const validEast = Number(east)
  const rows = listRows(MODULE_KEY)
  const index = rows.findIndex((row) => String(row['点位编号']) === code)
  if (index >= 0) {
    const existing = rows[index]
    const deprecated = String(existing.status) === '已废弃'
    const keepText = (field: keyof SurveyPointInput) => {
      const value = String(input[field] ?? '').trim()
      return value !== '' ? value : existing[field]
    }
    const updated: EntryRow = {
      ...existing,
      '控制等级': keepText('控制等级'),
      '高程值': keepText('高程值'),
      '布设日期': keepText('布设日期'),
      '校核日期': keepText('校核日期'),
      ...(deprecated ? {} : { '北坐标': validNorth, '东坐标': validEast }),
    }
    const next = [...rows]
    next[index] = updated
    saveRows(MODULE_KEY, next)
    return {
      ok: true,
      created: false,
      invalidCoordinates: false,
      message: deprecated
        ? `点位编号 ${code} 已存在且为已废弃点位：坐标沿用废弃时的历史取值，其余信息已在原记录上更新，仍只保留这一条`
        : `点位编号 ${code} 已存在，已在原记录上更新，没有重复新增`,
    }
  }
  const row: EntryRow = {
    id: rows.reduce((max, item) => Math.max(max, Number(item.id)), 0) + 1,
    status: '待布设',
    pending: true,
    abnormal: false,
    '点位编号': code,
    '控制等级': input.控制等级 || SURVEY_LEVELS[0],
    '北坐标': validNorth,
    '东坐标': validEast,
    '高程值': input.高程值.trim(),
    '布设日期': input.布设日期 || new Date().toISOString().slice(0, 10),
    '校核日期': input.校核日期.trim(),
    '点位状态': '新登记待布设',
  }
  saveRows(MODULE_KEY, [...rows, row])
  return { ok: true, created: true, invalidCoordinates: false, message: `测绘控制点 ${code} 已登记` }
}

// 登记废弃：坐标超出范围按无效值退回；通过则留存废弃时坐标，批复落到探方台账待办。
export function deprecateSurveyPoint(id: number): SurveyWriteResult {
  const rows = listRows(MODULE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, created: false, invalidCoordinates: false, message: `没有找到编号为 ${id} 的测绘控制点` }
  }
  const row = rows[index]
  const code = String(row['点位编号'] ?? id)
  if (String(row.status) === '已废弃') {
    return { ok: false, created: false, invalidCoordinates: false, message: `测绘控制点 ${code} 已经是「已废弃」，不用重复操作` }
  }
  const north = toNumber(row['北坐标'])
  const east = toNumber(row['东坐标'])
  const northOk = north !== null && coordinateInRange('north', north)
  const eastOk = east !== null && coordinateInRange('east', east)
  if (!northOk || !eastOk) {
    return {
      ok: false,
      created: false,
      invalidCoordinates: true,
      message: `点位 ${code} 的现存坐标（北坐标 ${row['北坐标'] ?? '—'}，东坐标 ${row['东坐标'] ?? '—'}）超出测区范围（${rangeError('北坐标')}，${rangeError('东坐标')}），按无效值退回，废弃批复未下达`,
    }
  }
  const today = new Date().toISOString().slice(0, 10)
  // 废弃时坐标按当时的取值留存，之后不再改动
  const frozenNorth = Number(north)
  const frozenEast = Number(east)
  const updated: EntryRow = {
    ...row,
    status: '已废弃',
    pending: false,
    '点位状态': '已废弃封存',
    '废弃时北坐标': frozenNorth,
    '废弃时东坐标': frozenEast,
    '废弃日期': today,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(MODULE_KEY, next)
  addTodo({
    module: 'trench',
    title: `控制点废弃批复：${code}`,
    detail: `测绘控制点 ${code} 已批复废弃，废弃时坐标 北坐标 ${frozenNorth}、东坐标 ${frozenEast}。请核对探方台账中引用该点位的测量记录，后续放样改用其他可用点位。`,
    refKey: MODULE_KEY,
    refId: Number(row.id),
  })
  return {
    ok: true,
    created: false,
    invalidCoordinates: false,
    message: `测绘控制点 ${code} 已登记废弃，废弃时坐标已留存，批复已落到探方台账待办`,
  }
}
