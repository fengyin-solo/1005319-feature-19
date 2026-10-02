import { listRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow } from '@/data/types'

// 测绘控制点专用领域服务：页面只负责渲染，条件过滤、登记去重、废弃挂账等业务判断都在这里。
// 与通用 local-service 一样，数据落在本地 localStorage，多个入口读到的始终是同一份点位数据。

export const SURVEY_KEY = 'survey'
export const TRENCH_KEY = 'trench'

export const SURVEY_GRADES = ['一等', '二等', '三等', '四等', '图根'] as const

// 工区高斯平面坐标的允许取值区间，登记时超出即按无效值退回。
export const NORTH_LIMITS = { min: 3_000_000, max: 4_500_000 }
export const EAST_LIMITS = { min: 100_000, max: 900_000 }

export type SurveyFilters = {
  code: string
  grades: string[]
  northMin: string
  northMax: string
  eastMin: string
  eastMax: string
}

export function emptySurveyFilters(): SurveyFilters {
  return { code: '', grades: [], northMin: '', northMax: '', eastMin: '', eastMax: '' }
}

type ActiveCondition = {
  name: string
  label: string
  test: (row: EntryRow) => boolean
}

type InputIssue = { name: string; message: string }

export type SurveyListResult = {
  items: EntryRow[]
  total: number
  activeCount: number
  culprit: { name: string; message: string } | null
}

function coordinateNumber(row: EntryRow, field: string): number | null {
  const raw = String(row[field] ?? '').trim()
  if (raw === '') {
    return null
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function readBound(raw: string): { value?: number; invalid?: boolean } {
  const text = raw.trim()
  if (text === '') {
    return {}
  }
  const value = Number(text)
  return Number.isFinite(value) ? { value } : { invalid: true }
}

function rangeLabel(name: string, lo: number | undefined, hi: number | undefined): string {
  if (lo !== undefined && hi !== undefined) {
    return `${name}在 ${lo} 至 ${hi}`
  }
  if (lo !== undefined) {
    return `${name}不小于 ${lo}`
  }
  return `${name}不大于 ${hi as number}`
}

// 把检索条件翻译成一组「且」关系的判定；区间输入不是数字或上下限倒挂时单独报出。
function buildConditions(filters: SurveyFilters): { conditions: ActiveCondition[]; issue: InputIssue | null } {
  const conditions: ActiveCondition[] = []
  let issue: InputIssue | null = null

  const code = filters.code.trim()
  if (code !== '') {
    conditions.push({
      name: '点位编号',
      label: `点位编号包含「${code}」`,
      test: (row) => String(row['点位编号'] ?? '').includes(code),
    })
  }

  const grades = filters.grades.map((item) => item.trim()).filter(Boolean)
  if (grades.length > 0) {
    conditions.push({
      name: '控制等级',
      label: `控制等级为「${grades.join('、')}」`,
      test: (row) => grades.includes(String(row['控制等级'] ?? '')),
    })
  }

  const pushRange = (
    field: '北坐标' | '东坐标',
    minRaw: string,
    maxRaw: string,
  ): void => {
    if (issue) {
      return
    }
    const lo = readBound(minRaw)
    const hi = readBound(maxRaw)
    if (lo.invalid || hi.invalid) {
      issue = {
        name: `${field}区间`,
        message: `「${field}区间」里存在不是数字的值，无法按范围过滤，请改成有效数值后重查`,
      }
      return
    }
    if (lo.value !== undefined && hi.value !== undefined && lo.value > hi.value) {
      issue = {
        name: `${field}区间`,
        message: `「${field}区间」下限 ${lo.value} 大于上限 ${hi.value}，区间倒挂，无法按范围过滤`,
      }
      return
    }
    if (lo.value === undefined && hi.value === undefined) {
      return
    }
    conditions.push({
      name: `${field}区间`,
      label: rangeLabel(field, lo.value, hi.value),
      test: (row) => {
        const value = coordinateNumber(row, field)
        if (value === null) {
          return false
        }
        if (lo.value !== undefined && value < lo.value) {
          return false
        }
        if (hi.value !== undefined && value > hi.value) {
          return false
        }
        return true
      },
    })
  }

  pushRange('北坐标', filters.northMin, filters.northMax)
  pushRange('东坐标', filters.eastMin, filters.eastMax)

  return { conditions, issue }
}

export function querySurveyPoints(filters: SurveyFilters): SurveyListResult {
  const rows = listRows(SURVEY_KEY)
  const { conditions, issue } = buildConditions(filters)

  if (issue) {
    return { items: [], total: 0, activeCount: conditions.length + 1, culprit: issue }
  }
  if (conditions.length === 0) {
    return { items: rows, total: rows.length, activeCount: 0, culprit: null }
  }

  const items = rows.filter((row) => conditions.every((condition) => condition.test(row)))
  if (items.length > 0) {
    return { items, total: items.length, activeCount: conditions.length, culprit: null }
  }

  // 交集为空：先看哪条条件单独就命中不了，再看是加了哪条之后把结果夹没的。
  for (const condition of conditions) {
    if (!rows.some(condition.test)) {
      return {
        items: [],
        total: 0,
        activeCount: conditions.length,
        culprit: {
          name: condition.name,
          message: `没有满足「${condition.label}」的点位，卡点在【${condition.name}】条件`,
        },
      }
    }
  }

  let scoped = rows
  for (let index = 0; index < conditions.length; index += 1) {
    const condition = conditions[index]
    const narrowed = scoped.filter(condition.test)
    if (narrowed.length === 0) {
      const previous = conditions.slice(0, index).map((item) => item.name)
      return {
        items: [],
        total: 0,
        activeCount: conditions.length,
        culprit: {
          name: condition.name,
          message: `「${condition.label}」与已选条件（${previous.join('、')}）各自都有命中、取交集后为 0，卡点在【${condition.name}】`,
        },
      }
    }
    scoped = narrowed
  }

  return { items, total: items.length, activeCount: conditions.length, culprit: null }
}

export function getSurveyPoint(id: number): EntryRow | null {
  return listRows(SURVEY_KEY).find((row) => Number(row.id) === id) ?? null
}

export type SurveyPointInput = {
  code: string
  grade: string
  north: string
  east: string
  elevation: string
  layoutDate: string
}

export type SurveyUpsertResult = ActionResult & {
  id?: number
  duplicated?: boolean
}

function todayText(): string {
  return new Date().toISOString().slice(0, 10)
}

// 登记或更新点位：同一个点位编号只保留一条；已废弃的编号再次提交不覆盖，沿用历史坐标。
export function upsertSurveyPoint(input: SurveyPointInput): SurveyUpsertResult {
  const code = input.code.trim()
  if (code === '') {
    return { ok: false, message: '点位编号不能为空，按无效值退回，请补充后重新提交' }
  }
  if (!SURVEY_GRADES.includes(input.grade as (typeof SURVEY_GRADES)[number])) {
    return {
      ok: false,
      message: `控制等级「${input.grade}」不在可选等级（${SURVEY_GRADES.join('、')}）内，按无效值退回`,
    }
  }

  const north = Number(input.north.trim())
  if (!Number.isFinite(north)) {
    return { ok: false, message: `北坐标「${input.north}」不是有效数字，按无效值退回，请修正后重新提交` }
  }
  if (north < NORTH_LIMITS.min || north > NORTH_LIMITS.max) {
    return {
      ok: false,
      message: `北坐标 ${north} 超出工区允许范围（${NORTH_LIMITS.min} 至 ${NORTH_LIMITS.max}），按无效值退回并另行登记，请修正坐标后重新提交`,
    }
  }

  const east = Number(input.east.trim())
  if (!Number.isFinite(east)) {
    return { ok: false, message: `东坐标「${input.east}」不是有效数字，按无效值退回，请修正后重新提交` }
  }
  if (east < EAST_LIMITS.min || east > EAST_LIMITS.max) {
    return {
      ok: false,
      message: `东坐标 ${east} 超出工区允许范围（${EAST_LIMITS.min} 至 ${EAST_LIMITS.max}），按无效值退回并另行登记，请修正坐标后重新提交`,
    }
  }

  const elevationText = input.elevation.trim()
  if (elevationText !== '' && !Number.isFinite(Number(elevationText))) {
    return { ok: false, message: `高程值「${elevationText}」不是有效数字，按无效值退回` }
  }

  const rows = listRows(SURVEY_KEY)
  const index = rows.findIndex((row) => String(row['点位编号'] ?? '') === code)

  if (index >= 0) {
    const existing = rows[index]
    if (String(existing.status) === '已废弃') {
      return {
        ok: false,
        duplicated: true,
        id: Number(existing.id),
        message: `点位编号「${code}」已废弃，按历史点位保留当时坐标（北坐标 ${existing['北坐标']}、东坐标 ${existing['东坐标']}），本次提交不重复登记、不覆盖坐标`,
      }
    }
    const updated: EntryRow = {
      ...existing,
      控制等级: input.grade,
      北坐标: String(north),
      东坐标: String(east),
      高程值: elevationText,
      布设日期: input.layoutDate.trim() || String(existing['布设日期'] ?? ''),
      点位状态: existing.status,
    }
    const next = [...rows]
    next[index] = updated
    saveRows(SURVEY_KEY, next)
    return {
      ok: true,
      duplicated: true,
      id: Number(updated.id),
      message: `点位编号「${code}」已存在，仅保留一条并更新了控制等级与坐标等字段，未重复登记`,
    }
  }

  const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const row: EntryRow = {
    id,
    status: '待布设',
    pending: true,
    abnormal: false,
    点位编号: code,
    控制等级: input.grade,
    北坐标: String(north),
    东坐标: String(east),
    高程值: elevationText,
    布设日期: input.layoutDate.trim() || todayText(),
    校核日期: '',
    点位状态: '待布设',
  }
  saveRows(SURVEY_KEY, [...rows, row])
  return { ok: true, id, message: `测绘控制点「${code}」已登记，当前状态「待布设」` }
}

const STATUS_TARGETS: Record<string, string> = {
  提交布设: '可使用',
  送交校核: '待校核',
  登记废弃: '已废弃',
}

// 废弃点位编号在探方台账里的挂账编号，同一编号只挂一条待办。
function abandonTodoCode(pointCode: string): string {
  return `废弃批复-${pointCode}`
}

// 废弃批复落到探方台账待办；重复废弃同一个点位不重复挂账。
function createAbandonTodo(point: EntryRow): boolean {
  const pointCode = String(point['点位编号'] ?? '')
  const todoCode = abandonTodoCode(pointCode)
  const trenches = listRows(TRENCH_KEY)
  if (trenches.some((row) => String(row['探方编号'] ?? '') === todoCode)) {
    return false
  }
  const id = trenches.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const todo: EntryRow = {
    id,
    status: '待布方',
    pending: true,
    abnormal: false,
    探方编号: todoCode,
    所属发掘区: '测绘控制点废弃批复',
    布方面积: '待批复',
    起始层位: '—',
    现场负责人: '待指派',
    开工日期: todayText(),
    最大深度: '—',
    探方状态: `待办：控制点 ${pointCode} 废弃批复`,
    sourcePoint: pointCode,
    todoKind: '控制点废弃批复',
  }
  saveRows(TRENCH_KEY, [...trenches, todo])
  return true
}

export function abandonTodoExists(pointCode: string): boolean {
  return listRows(TRENCH_KEY).some(
    (row) => String(row['探方编号'] ?? '') === abandonTodoCode(pointCode),
  )
}

export type SurveyActionResult = ActionResult & {
  todoCreated?: boolean
  todoCode?: string
}

// 控制点状态流转：废弃时坐标原样保留（沿用历史点位里的坐标），并把批复挂到探方台账待办。
export function changeSurveyStatus(id: number, action: string): SurveyActionResult {
  const target = STATUS_TARGETS[action]
  if (!target) {
    return { ok: false, message: `测绘控制点没有登记「${action}」这个动作` }
  }
  const rows = listRows(SURVEY_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的测绘控制点` }
  }
  const current = rows[index]
  const currentStatus = String(current.status)
  if (currentStatus === target) {
    return { ok: false, message: `测绘控制点已经是「${target}」，不用重复操作` }
  }
  if (currentStatus === '已废弃') {
    return { ok: false, message: '已废弃点位只保留历史记录，不能再执行状态流转' }
  }

  const updated: EntryRow = {
    ...current,
    status: target,
    pending: target !== '已废弃',
    点位状态: target,
  }
  if (action === '送交校核') {
    updated['校核日期'] = todayText()
  }
  const next = [...rows]
  next[index] = updated
  saveRows(SURVEY_KEY, next)

  if (action === '登记废弃') {
    const pointCode = String(updated['点位编号'] ?? '')
    const created = createAbandonTodo(updated)
    return {
      ok: true,
      todoCreated: created,
      todoCode: abandonTodoCode(pointCode),
      message: created
        ? `点位「${pointCode}」已登记废弃，坐标沿用当时取值（北坐标 ${updated['北坐标']}、东坐标 ${updated['东坐标']}）；废弃批复已落到探方台账待办（探方编号 ${abandonTodoCode(pointCode)}）`
        : `点位「${pointCode}」已登记废弃，坐标沿用当时取值；其废弃批复此前已在探方台账待办中，不重复挂账`,
    }
  }

  return { ok: true, message: `测绘控制点已${action}，当前状态「${target}」` }
}

export type SurveyStats = { label: string; value: number }[]

export function surveyStats(): SurveyStats {
  const rows = listRows(SURVEY_KEY)
  const count = (status: string) => rows.filter((row) => String(row.status) === status).length
  return [
    { label: '可使用点位', value: count('可使用') },
    { label: '待校核点位', value: count('待校核') },
    { label: '已废弃点位', value: count('已废弃') },
  ]
}
