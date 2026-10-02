import { defineStore } from 'pinia'

import { emptySurveyFilters, type SurveyFilters } from '@/api/survey-service'

// 测绘控制点最近一次提交的检索条件快照：多个入口、列表与详情页之间共享。
// 从详情页退回列表时恢复这份条件，就能回到原来的检索结果。
export const useSurveyStore = defineStore('survey', {
  state: () => ({
    filters: emptySurveyFilters(),
    hasApplied: false,
  }),
  actions: {
    clone(): SurveyFilters {
      return { ...this.filters, grades: [...this.filters.grades] }
    },
    apply(filters: SurveyFilters) {
      this.filters = { ...filters, grades: [...filters.grades] }
      this.hasApplied = true
    },
    reset() {
      this.filters = emptySurveyFilters()
      this.hasApplied = false
    },
  },
})
