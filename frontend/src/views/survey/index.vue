<template>
  <section class="page" data-module="survey">
    <header class="page-head">
      <div>
        <h2>测绘控制点管理</h2>
        <p class="page-desc">维护测绘控制点，围绕点位编号、控制等级、北坐标、东坐标做登记、筛选与状态流转。</p>
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

    <form class="filter-bar survey-filter" @submit.prevent="submitQuery">
      <label class="filter-item">
        <span>点位编号</span>
        <input v-model="form.code" placeholder="按点位编号检索" />
      </label>
      <fieldset class="filter-item grade-picker">
        <legend>控制等级（可多选，取并集）</legend>
        <label v-for="grade in grades" :key="grade" class="grade-chip" :class="{ active: form.grades.includes(grade) }">
          <input v-model="form.grades" type="checkbox" :value="grade" />
          {{ grade }}
        </label>
      </fieldset>
      <div class="filter-item range-field">
        <span>北坐标区间</span>
        <div class="range-inputs">
          <input v-model="form.northMin" inputmode="decimal" placeholder="下限" />
          <em>至</em>
          <input v-model="form.northMax" inputmode="decimal" placeholder="上限" />
        </div>
      </div>
      <div class="filter-item range-field">
        <span>东坐标区间</span>
        <div class="range-inputs">
          <input v-model="form.eastMin" inputmode="decimal" placeholder="下限" />
          <em>至</em>
          <input v-model="form.eastMax" inputmode="decimal" placeholder="上限" />
        </div>
      </div>
      <div class="filter-actions">
        <button class="btn primary" type="submit">查询</button>
        <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
      </div>
      <p class="filter-hint">多组条件同时给出时取交集；坐标只填一侧即按单边过滤。</p>
    </form>

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
          <td>
            <RouterLink class="link point-code" :to="{ name: 'survey-detail', params: { id: row.id } }">
              {{ row['点位编号'] }}
            </RouterLink>
          </td>
          <td v-for="column in columns.slice(1)" :key="column">{{ row[column] ?? '—' }}</td>
          <td>
            <span :class="{ 'retired-tag': row.status === '已废弃' }">{{ row.status }}</span>
          </td>
          <td class="row-actions">
            <button
              v-for="action in actionsFor(row)"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
            <span v-if="row.status === '已废弃'" class="muted-text">历史坐标已锁定</span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">
            <template v-if="culprit">
              <strong class="error-text">未命中任何点位：</strong>{{ culprit.message }}
            </template>
            <template v-else>暂无测绘控制点数据，可先登记测绘控制点</template>
          </td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条测绘控制点记录</span>
      <span v-if="notice" :class="noticeKind">{{ notice }}</span>
    </footer>

    <div v-if="creating" class="modal-mask" @click.self="closeCreate">
      <form class="modal-card" @submit.prevent="submitCreate">
        <h3>登记测绘控制点</h3>
        <p class="modal-hint">同一 点位编号 再次提交只保留一条：已存在的未废弃点位会更新字段，已废弃点位沿用历史坐标、不覆盖。</p>
        <label class="modal-field">
          <span>点位编号 *</span>
          <input v-model="form2.code" placeholder="如 SURV-0101" />
        </label>
        <label class="modal-field">
          <span>控制等级 *</span>
          <select v-model="form2.grade">
            <option value="" disabled>请选择控制等级</option>
            <option v-for="grade in grades" :key="grade" :value="grade">{{ grade }}</option>
          </select>
        </label>
        <div class="modal-grid">
          <label class="modal-field">
            <span>北坐标 *</span>
            <input v-model="form2.north" inputmode="decimal" placeholder="3000000 ~ 4500000" />
          </label>
          <label class="modal-field">
            <span>东坐标 *</span>
            <input v-model="form2.east" inputmode="decimal" placeholder="100000 ~ 900000" />
          </label>
          <label class="modal-field">
            <span>高程值</span>
            <input v-model="form2.elevation" inputmode="decimal" placeholder="选填" />
          </label>
          <label class="modal-field">
            <span>布设日期</span>
            <input v-model="form2.layoutDate" type="date" />
          </label>
        </div>
        <p v-if="createNotice" class="error-text">{{ createNotice }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="closeCreate">取消</button>
          <button class="btn primary" type="submit">提交登记</button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  SURVEY_GRADES,
  changeSurveyStatus,
  emptySurveyFilters,
  querySurveyPoints,
  surveyStats,
  upsertSurveyPoint,
  type SurveyFilters,
} from '@/api/survey-service'
import { downloadEntries as downloadGeneric } from '@/api/local-service'
import type { EntryRow } from '@/data/types'
import { useSurveyStore } from '@/stores/survey'

const route = useRoute()
const surveyStore = useSurveyStore()

const columns = ['点位编号', '控制等级', '北坐标', '东坐标', '高程值', '布设日期', '校核日期', '点位状态']
const actions = ['提交布设', '送交校核', '登记废弃']
const statuses = ['待布设', '可使用', '待校核', '已废弃']
const grades = SURVEY_GRADES

const rows = ref<EntryRow[]>([])
const total = ref(0)
const culprit = ref<{ name: string; message: string } | null>(null)
const notice = ref('')
const noticeKind = ref('muted-text')
const stats = ref(surveyStats())

const form = ref<SurveyFilters>(emptySurveyFilters())

function filtersFromRoute(): SurveyFilters | null {
  const query = route.query
  const gradeValue = query.g
  const gradeList = Array.isArray(gradeValue)
    ? gradeValue.map(String)
    : gradeValue !== undefined
      ? String(gradeValue).split(',').filter(Boolean)
      : []
  const picked = {
    code: query.q !== undefined ? String(query.q) : '',
    grades: gradeList.filter((grade) => grades.includes(grade as (typeof grades)[number])),
    northMin: query.nmin !== undefined ? String(query.nmin) : '',
    northMax: query.nmax !== undefined ? String(query.nmax) : '',
    eastMin: query.emin !== undefined ? String(query.emin) : '',
    eastMax: query.emax !== undefined ? String(query.emax) : '',
  }
  const hasAny =
    picked.code !== '' ||
    picked.grades.length > 0 ||
    picked.northMin !== '' ||
    picked.northMax !== '' ||
    picked.eastMin !== '' ||
    picked.eastMax !== ''
  return hasAny ? picked : null
}

function reload() {
  const payload = querySurveyPoints(form.value)
  rows.value = payload.items
  total.value = payload.total
  culprit.value = payload.culprit
  stats.value = surveyStats()
  if (payload.culprit) {
    notice.value = payload.culprit.message
    noticeKind.value = 'error-text'
  } else {
    notice.value = ''
  }
}

function submitQuery() {
  surveyStore.apply(form.value)
  reload()
}

function resetFilters() {
  form.value = emptySurveyFilters()
  surveyStore.reset()
  reload()
}

function exportRows() {
  downloadGeneric('survey')
}

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function actionsFor(row: EntryRow): string[] {
  // 已废弃点位的状态与坐标都已锁定，不再给出动作入口。
  return String(row.status) === '已废弃' ? [] : actions
}

function runAction(action: string, row: EntryRow) {
  const result = changeSurveyStatus(Number(row.id), action)
  if (!result.ok) {
    notice.value = result.message
    noticeKind.value = 'error-text'
    return
  }
  notice.value = result.message
  noticeKind.value = 'muted-text'
  reload()
}

// 登记弹层
const creating = ref(false)
const blankForm = () => ({
  code: '',
  grade: '',
  north: '',
  east: '',
  elevation: '',
  layoutDate: '',
})
const form2 = ref(blankForm())
const createNotice = ref('')

function openCreate() {
  form2.value = blankForm()
  createNotice.value = ''
  creating.value = true
}

function closeCreate() {
  creating.value = false
}

function submitCreate() {
  createNotice.value = ''
  const result = upsertSurveyPoint(form2.value)
  if (!result.ok) {
    // 坐标超范围、编号为空等无效值在这里另行提示，数据不落库。
    createNotice.value = result.message
    return
  }
  creating.value = false
  notice.value = result.message
  noticeKind.value = 'muted-text'
  reload()
}

onMounted(() => {
  // 入口优先级：带条件的深链（如概览页快查）> 最近一次提交的条件快照 > 无条件。
  const fromRoute = filtersFromRoute()
  if (fromRoute) {
    form.value = fromRoute
    surveyStore.apply(fromRoute)
  } else if (surveyStore.hasApplied) {
    form.value = surveyStore.clone()
  }
  reload()
})
</script>
