<template>
  <section class="page" data-module="survey-detail">
    <header class="page-head">
      <div>
        <h2>测绘控制点详情</h2>
        <p class="page-desc">
          点位 {{ code }} 的登记信息，列表、台账待办等入口看到的都是这同一份数据。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="goBack">返回检索结果</button>
      </div>
    </header>

    <template v-if="point">
      <dl class="detail-grid">
        <div v-for="field in fields" :key="field" class="detail-item">
          <dt>{{ field }}</dt>
          <dd>{{ point[field] ?? '—' }}</dd>
        </div>
        <div class="detail-item">
          <dt>当前状态</dt>
          <dd>{{ point.status }}</dd>
        </div>
      </dl>
      <p v-if="deprecated" class="hint-banner info">
        该点位已废弃，坐标按废弃时的取值保留：北坐标 {{ point['废弃时北坐标'] ?? '—' }}、东坐标
        {{ point['废弃时东坐标'] ?? '—' }}（废弃日期 {{ point['废弃日期'] ?? '—' }}），后续重新提交同编号点位也不会改动这组历史坐标。
      </p>
    </template>
    <p v-else class="empty-state">没有找到这个测绘控制点，可能已被清理，请返回列表重新检索。</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getSurveyPoint } from '@/api/survey-service'

const fields = ["点位编号", "控制等级", "北坐标", "东坐标", "高程值", "布设日期", "校核日期", "点位状态"]

const route = useRoute()
const router = useRouter()

const point = computed(() => getSurveyPoint(Number(route.params.id)))
const code = computed(() => (point.value ? String(point.value['点位编号']) : `#${route.params.id}`))
const deprecated = computed(() => point.value !== undefined && String(point.value.status) === '已废弃')

function goBack() {
  // 从哪个入口进来就退回哪里；直接打开详情页时回退到控制点列表。
  if (window.history.state?.back) {
    router.back()
  } else {
    router.push({ name: 'survey' })
  }
}
</script>
