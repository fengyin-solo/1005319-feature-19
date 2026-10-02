<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">重新统计</button>
      </div>
    </header>
    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>
    <section class="quick-panel">
      <h3>测绘控制点快查</h3>
      <p class="quick-hint">与「测绘控制点」页读到的是同一份点位数据；这里给出条件后直接落到对应检索结果。</p>
      <form class="quick-form" @submit.prevent="goSurvey">
        <label class="filter-item">
          <span>点位编号</span>
          <input v-model="quick.code" placeholder="如 SURV-01" />
        </label>
        <label class="filter-item">
          <span>控制等级（多选）</span>
          <select v-model="quick.grades" multiple size="2" class="multi-select">
            <option v-for="grade in grades" :key="grade" :value="grade">{{ grade }}</option>
          </select>
        </label>
        <div class="filter-item">
          <span>北坐标区间</span>
          <div class="range-inputs">
            <input v-model="quick.northMin" inputmode="decimal" placeholder="下限" />
            <em>至</em>
            <input v-model="quick.northMax" inputmode="decimal" placeholder="上限" />
          </div>
        </div>
        <div class="filter-item">
          <span>东坐标区间</span>
          <div class="range-inputs">
            <input v-model="quick.eastMin" inputmode="decimal" placeholder="下限" />
            <em>至</em>
            <input v-model="quick.eastMax" inputmode="decimal" placeholder="上限" />
          </div>
        </div>
        <div class="filter-actions">
          <button class="btn primary" type="submit">带条件去定位</button>
          <RouterLink class="btn" :to="{ name: 'survey' }">打开全部点位</RouterLink>
        </div>
      </form>
    </section>

    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td>{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>
    <footer class="page-foot">
      <span>数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { loadOverview } from '@/api/local-service'
import { SURVEY_GRADES } from '@/api/survey-service'
import type { OverviewResult } from '@/data/types'

const router = useRouter()
const grades = SURVEY_GRADES

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])

const quick = reactive({
  code: '',
  grades: [] as string[],
  northMin: '',
  northMax: '',
  eastMin: '',
  eastMax: '',
})

// 把快查条件带进控制点列表页的深链，列表页据此恢复检索条件与结果。
function goSurvey() {
  const query: Record<string, string> = {}
  if (quick.code.trim() !== '') {
    query.q = quick.code.trim()
  }
  if (quick.grades.length > 0) {
    query.g = quick.grades.join(',')
  }
  if (quick.northMin.trim() !== '') {
    query.nmin = quick.northMin.trim()
  }
  if (quick.northMax.trim() !== '') {
    query.nmax = quick.northMax.trim()
  }
  if (quick.eastMin.trim() !== '') {
    query.emin = quick.eastMin.trim()
  }
  if (quick.eastMax.trim() !== '') {
    query.emax = quick.eastMax.trim()
  }
  router.push({ name: 'survey', query })
}

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
}

onMounted(refresh)
</script>
