<template>
  <section class="page survey-detail">
    <header class="page-head">
      <div>
        <h2>测绘控制点详情</h2>
        <p class="page-desc">查看单个点位的登记信息、坐标取值与状态流转记录。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="goBack">返回检索结果</button>
      </div>
    </header>

    <div v-if="!point" class="empty-panel">
      <p class="error-text">没有找到编号为 {{ pointId }} 的测绘控制点，可能已被重置。</p>
      <button class="btn primary" type="button" @click="goBack">返回检索结果</button>
    </div>

    <template v-else>
      <div class="stat-row">
        <article class="stat-card">
          <span class="stat-label">点位编号</span>
          <strong class="stat-value">{{ point['点位编号'] }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">控制等级</span>
          <strong class="stat-value">{{ point['控制等级'] }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">当前状态</span>
          <strong class="stat-value" :class="{ 'retired-tag': point.status === '已废弃' }">{{ point.status }}</strong>
        </article>
      </div>

      <table class="data-table detail-table">
        <tbody>
          <tr v-for="field in detailFields" :key="field">
            <th>{{ field }}</th>
            <td>{{ point[field] === '' || point[field] === undefined ? '—' : point[field] }}</td>
          </tr>
        </tbody>
      </table>

      <div v-if="point.status === '已废弃'" class="callout">
        该点位已废弃：坐标按废弃当时的取值保留（北坐标 {{ point['北坐标'] }}、东坐标 {{ point['东坐标'] }}），不再随登记修改。
        <template v-if="todoCode">
          废弃批复已落到探方台账待办，台账编号「{{ todoCode }}」。
        </template>
      </div>

      <div class="detail-actions">
        <button
          v-for="action in availableActions"
          :key="action"
          class="btn"
          :class="{ primary: action === '提交布设' }"
          type="button"
          @click="runAction(action)"
        >
          {{ action }}
        </button>
      </div>

      <footer class="page-foot">
        <span v-if="message" :class="messageKind">{{ message }}</span>
      </footer>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  abandonTodoExists,
  changeSurveyStatus,
  getSurveyPoint,
} from '@/api/survey-service'
import type { EntryRow } from '@/data/types'

const route = useRoute()
const router = useRouter()

const pointId = Number(route.params.id)
const point = ref<EntryRow | null>(null)
const message = ref('')
const messageKind = ref('muted-text')

const detailFields = ['控制等级', '北坐标', '东坐标', '高程值', '布设日期', '校核日期', '点位状态']

const availableActions = computed(() =>
  point.value && String(point.value.status) !== '已废弃'
    ? ['提交布设', '送交校核', '登记废弃']
    : [],
)

const todoCode = computed(() => {
  if (!point.value || String(point.value.status) !== '已废弃') {
    return ''
  }
  const code = String(point.value['点位编号'] ?? '')
  return abandonTodoExists(code) ? `废弃批复-${code}` : ''
})

function refresh() {
  point.value = getSurveyPoint(pointId)
}

// 返回列表：列表页会从快照恢复原来的检索条件与结果。
function goBack() {
  router.push({ name: 'survey' })
}

function runAction(action: string) {
  message.value = ''
  const result = changeSurveyStatus(pointId, action)
  if (!result.ok) {
    message.value = result.message
    messageKind.value = 'error-text'
    return
  }
  message.value = result.message
  messageKind.value = 'muted-text'
  refresh()
}

onMounted(() => {
  refresh()
})
</script>
