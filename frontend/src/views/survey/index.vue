<template>
  <section class="page" data-module="survey">
    <header class="page-head">
      <div>
        <h2>测绘控制点管理</h2>
        <p class="page-desc">
          按点位编号、控制等级、北坐标、东坐标组合定位控制点；坐标给区间按范围过滤，几项条件一起用时取交集。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记测绘控制点</button>
        <button class="btn" type="button" @click="exportRows">导出测绘控制点清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="applySearch">
      <label class="filter-item">
        <span>点位编号</span>
        <input v-model="filters.code" placeholder="按点位编号检索" />
      </label>
      <div class="filter-item">
        <span>控制等级（可多选）</span>
        <div class="level-options">
          <button
            v-for="level in levels"
            :key="level"
            type="button"
            class="level-chip"
            :class="{ active: filters.levels.includes(level) }"
            @click="toggleLevel(level)"
          >
            {{ level }}
          </button>
        </div>
      </div>
      <label class="filter-item">
        <span>北坐标区间</span>
        <span class="range-inputs">
          <input v-model="filters.northMin" placeholder="下限" />
          <em>—</em>
          <input v-model="filters.northMax" placeholder="上限" />
        </span>
      </label>
      <label class="filter-item">
        <span>东坐标区间</span>
        <span class="range-inputs">
          <input v-model="filters.eastMin" placeholder="下限" />
          <em>—</em>
          <input v-model="filters.eastMax" placeholder="上限" />
        </span>
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <p v-if="queryError" class="hint-banner error">{{ queryError }}</p>
    <p v-if="invalidNotice" class="hint-banner warning">坐标无效值提示：{{ invalidNotice }}</p>
    <p v-if="noticeMessage" class="hint-banner info">{{ noticeMessage }}</p>

    <div v-if="showForm" class="create-panel">
      <h3>登记测绘控制点</h3>
      <p class="panel-desc">
        同一个点位编号再次提交只保留一条，会在原记录上更新；已废弃点位的坐标沿用废弃时的历史取值。
        坐标有效范围：北坐标 {{ northRange.min }}–{{ northRange.max }}，东坐标 {{ eastRange.min }}–{{ eastRange.max }}。
      </p>
      <form class="form-grid" @submit.prevent="submitForm">
        <label class="filter-item">
          <span>点位编号</span>
          <input v-model="form.点位编号" placeholder="如 SURV-0012" />
        </label>
        <label class="filter-item">
          <span>控制等级</span>
          <select v-model="form.控制等级">
            <option v-for="level in levels" :key="level" :value="level">{{ level }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>北坐标</span>
          <input v-model="form.北坐标" placeholder="如 528312.45" />
        </label>
        <label class="filter-item">
          <span>东坐标</span>
          <input v-model="form.东坐标" placeholder="如 415623.18" />
        </label>
        <label class="filter-item">
          <span>高程值</span>
          <input v-model="form.高程值" placeholder="选填" />
        </label>
        <label class="filter-item">
          <span>布设日期</span>
          <input v-model="form.布设日期" type="date" />
        </label>
        <label class="filter-item">
          <span>校核日期</span>
          <input v-model="form.校核日期" type="date" />
        </label>
        <div class="form-actions">
          <button class="btn primary" type="submit">提交登记</button>
          <button class="btn ghost" type="button" @click="showForm = false">收起</button>
        </div>
      </form>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDetail(row)">查看</button>
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">{{ emptyHint }}</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条测绘控制点记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { downloadEntries, moduleMeta, runAction as applyAction } from '@/api/local-service'
import {
  EAST_RANGE,
  EMPTY_QUERY,
  NORTH_RANGE,
  SURVEY_LEVELS,
  deprecateSurveyPoint,
  searchSurveyPoints,
  upsertSurveyPoint,
} from '@/api/survey-service'
import type { SurveyPointInput, SurveyQuery } from '@/api/survey-service'
import { listRows } from '@/data/local-store'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('survey')
const columns = ["点位编号", "控制等级", "北坐标", "东坐标", "高程值", "布设日期", "校核日期", "点位状态"]
const actions = ["提交布设", "送交校核", "登记废弃"]
const statuses = ["待布设", "可使用", "待校核", "已废弃"]
const levels = SURVEY_LEVELS
const northRange = NORTH_RANGE
const eastRange = EAST_RANGE

const route = useRoute()
const router = useRouter()

const rows = ref<EntryRow[]>([])
const allRows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
const invalidNotice = ref('')
const queryError = ref('')
const blockers = ref<string[]>([])
const conditionStats = ref<{ label: string; matched: number }[]>([])
const filters = ref<SurveyQuery>({ ...EMPTY_QUERY, levels: [] })

const showForm = ref(false)
const blankForm = (): SurveyPointInput => ({
  点位编号: '',
  控制等级: SURVEY_LEVELS[0],
  北坐标: '',
  东坐标: '',
  高程值: '',
  布设日期: '',
  校核日期: '',
})
const form = ref<SurveyPointInput>(blankForm())

const stats = computed(() => [
  { label: '可使用点位', value: allRows.value.filter((row) => String(row.status) === '可使用').length },
  { label: '待校核点位', value: allRows.value.filter((row) => String(row.status) === '待校核').length },
  { label: '已废弃点位', value: allRows.value.filter((row) => String(row.status) === '已废弃').length },
])
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: allRows.value.filter((row) => String(row.status) === status).length,
  })),
)
const hasConditions = computed(
  () =>
    filters.value.code.trim() !== '' ||
    filters.value.levels.length > 0 ||
    filters.value.northMin.trim() !== '' ||
    filters.value.northMax.trim() !== '' ||
    filters.value.eastMin.trim() !== '' ||
    filters.value.eastMax.trim() !== '',
)
// 命中为空时写明是哪个条件卡住的：单独就无命中的条件直接点名，
// 各自都有命中但交集为空时列出每个条件单独的命中数。
const emptyHint = computed(() => {
  if (queryError.value) {
    return '检索条件有误，请按提示调整后再查'
  }
  if (!hasConditions.value) {
    return '暂无测绘控制点数据，可先登记测绘控制点'
  }
  if (blockers.value.length > 0) {
    return `没有命中任何点位，是以下条件卡住的：${blockers.value.join('；')}。请放宽后重试`
  }
  const detail = conditionStats.value
    .map((stat) => `「${stat.label}」单独可命中 ${stat.matched} 条`)
    .join('，')
  return `没有命中任何点位：${detail}，但几项条件取交集后为空，请放宽其中一项`
})

function toggleLevel(level: string) {
  const index = filters.value.levels.indexOf(level)
  if (index >= 0) {
    filters.value.levels.splice(index, 1)
  } else {
    filters.value.levels.push(level)
  }
}

function queryFromRoute(): SurveyQuery {
  const query = route.query
  const text = (key: string) => {
    const value = query[key]
    return typeof value === 'string' ? value : ''
  }
  const levelsRaw = text('levels')
  return {
    code: text('code'),
    levels: levelsRaw ? levelsRaw.split(',').filter((item) => SURVEY_LEVELS.includes(item)) : [],
    northMin: text('nmin'),
    northMax: text('nmax'),
    eastMin: text('emin'),
    eastMax: text('emax'),
  }
}

// 检索条件写进地址栏：从详情页退回列表时，原来这组条件还在。
function applySearch() {
  const query: Record<string, string> = {}
  if (filters.value.code.trim()) query.code = filters.value.code.trim()
  if (filters.value.levels.length > 0) query.levels = filters.value.levels.join(',')
  if (filters.value.northMin.trim()) query.nmin = filters.value.northMin.trim()
  if (filters.value.northMax.trim()) query.nmax = filters.value.northMax.trim()
  if (filters.value.eastMin.trim()) query.emin = filters.value.eastMin.trim()
  if (filters.value.eastMax.trim()) query.emax = filters.value.eastMax.trim()
  router.replace({ query })
  reload()
}

function resetFilters() {
  filters.value = { ...EMPTY_QUERY, levels: [] }
  router.replace({ query: {} })
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  showForm.value = !showForm.value
  if (showForm.value) {
    form.value = blankForm()
  }
}

function submitForm() {
  errorMessage.value = ''
  noticeMessage.value = ''
  invalidNotice.value = ''
  const result = upsertSurveyPoint(form.value)
  if (!result.ok) {
    if (result.invalidCoordinates) {
      invalidNotice.value = result.message
    } else {
      errorMessage.value = result.message
    }
    return
  }
  noticeMessage.value = result.message
  showForm.value = false
  reload()
}

function openDetail(row: EntryRow) {
  router.push({ name: 'survey-detail', params: { id: row.id } })
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  noticeMessage.value = ''
  invalidNotice.value = ''
  if (action === '登记废弃') {
    const result = deprecateSurveyPoint(Number(row.id))
    if (!result.ok) {
      if (result.invalidCoordinates) {
        invalidNotice.value = result.message
      } else {
        errorMessage.value = result.message
      }
      return
    }
    noticeMessage.value = result.message
    reload()
    return
  }
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  reload()
}

function reload() {
  errorMessage.value = ''
  queryError.value = ''
  try {
    const outcome = searchSurveyPoints(filters.value)
    if (outcome.queryError) {
      queryError.value = outcome.queryError
      rows.value = []
      total.value = 0
      blockers.value = []
      conditionStats.value = []
    } else {
      rows.value = outcome.items
      total.value = outcome.total
      blockers.value = outcome.blockers
      conditionStats.value = outcome.conditionStats
    }
    allRows.value = [...listRows(meta.key)]
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '测绘控制点列表读取失败'
  }
}

onMounted(() => {
  filters.value = queryFromRoute()
  reload()
})
</script>
