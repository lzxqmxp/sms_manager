<!-- API 日志查看页面 -->
<template>
  <div class="api-logs">
    <div class="filters">
      <div class="filter-item">
        <label>Action:</label>
        <select v-model="selectedAction" class="select-field" @change="reload">
          <option value="all">全部</option>
          <option v-for="a in actions" :key="a" :value="a">{{ a }}</option>
        </select>
      </div>
      <div class="filter-item">
        <label>开始时间:</label>
        <input type="datetime-local" v-model="start" class="input-field" @change="reload" />
      </div>
      <div class="filter-item">
        <label>结束时间:</label>
        <input type="datetime-local" v-model="end" class="input-field" @change="reload" />
      </div>
      <div class="filter-item">
        <label>&nbsp;</label>
        <button class="btn-primary" @click="reload" :disabled="loading">查询</button>
      </div>
    </div>

    <div class="result">
      <div class="summary">
        共 {{ logs.length }} 条（最多显示 {{ limit }} 条）
      </div>
      <div class="log-table">
        <div class="log-header">
          <div class="col time">时间</div>
          <div class="col action">Action</div>
          <div class="col success">成功</div>
          <div class="col status">状态</div>
          <div class="col url">URL</div>
          <div class="col ops">详情</div>
        </div>
        <div v-for="row in logs" :key="row.id" class="log-row">
          <div class="col time">{{ formatTime(row.timestamp) }}</div>
          <div class="col action">{{ row.action }}</div>
          <div class="col success">
            <span :class="row.success ? 'ok' : 'fail'">{{ row.success ? '是' : '否' }}</span>
          </div>
          <div class="col status">{{ getStatusFromResponse(row.response) }}</div>
          <div class="col url" :title="row.url">{{ row.url }}</div>
          <div class="col ops">
            <button class="btn-secondary btn-small" @click="toggle(row.id)">{{ expanded.has(row.id) ? '收起' : '展开' }}</button>
          </div>
          <div class="col details" v-if="expanded.has(row.id)">
            <div class="detail-block"><strong>Params:</strong><pre>{{ pretty(row.params) }}</pre></div>
            <div class="detail-block"><strong>Response:</strong><pre>{{ pretty(row.response) }}</pre></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface ApiLogRow {
  id: number
  timestamp: number
  action: string
  url?: string
  params?: string
  response?: string
  success: 0 | 1
  service?: string
  country?: string
  operator?: string
  activation_id?: string
}

const actions = ref<string[]>([])
const selectedAction = ref<string>('all')
const start = ref<string>('')
const end = ref<string>('')
const logs = ref<ApiLogRow[]>([])
const loading = ref(false)
const expanded = ref<Set<number>>(new Set())
const limit = 200

function toTs(v: string | null | undefined): number | undefined {
  if (!v) return undefined
  const d = new Date(v)
  const t = d.getTime()
  return isNaN(t) ? undefined : t
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const Y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${Y}-${M}-${D} ${h}:${m}:${s}`
}

function pretty(v?: string): string {
  if (!v) return ''
  try {
    return JSON.stringify(JSON.parse(v), null, 2)
  } catch {
    return v
  }
}

function getStatusFromResponse(resp?: string): string {
  if (!resp) return ''
  try {
    const obj = JSON.parse(resp)
    if (obj && typeof obj === 'object' && 'status' in obj) {
      return `${obj.status}${obj.statusText ? ' ' + obj.statusText : ''}`
    }
  } catch {}
  return ''
}

function toggle(id: number) {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
  expanded.value = new Set(expanded.value)
}

async function reload() {
  loading.value = true
  try {
    const res = await window.ipcRenderer.invoke('get-api-logs', {
      action: selectedAction.value,
      start: toTs(start.value),
      end: toTs(end.value),
      limit,
      offset: 0,
    })
    if (res?.success) {
      logs.value = res.data || []
    }
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    const r = await window.ipcRenderer.invoke('list-api-actions')
    if (r?.success) actions.value = r.data || []
  } catch {}
  reload()
})
</script>

<style scoped>
.api-logs {
  padding: 20px;
}

.filters {
  display: flex;
  gap: 12px;
  align-items: end;
  margin-bottom: 16px;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-field,
.select-field {
  width: 220px;
  padding: 8px 10px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
}

.btn-primary,
.btn-secondary,
.btn-small {
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary { background: #667eea; color: #fff; }
.btn-secondary { background: #4CAF50; color: #fff; }
.btn-small { padding: 6px 10px; font-size: 12px; }

.result .summary { margin-bottom: 8px; color: #666; }

.log-table {
  background: white;
  border-radius: 12px;
  border: 2px solid #e0e0e0;
}

.log-header, .log-row {
  display: grid;
  grid-template-columns: 170px 140px 70px 120px 1fr 80px;
  align-items: center;
}

.log-header {
  background: #f5f5f5;
  font-weight: 700;
  padding: 10px;
}

.log-row { padding: 10px; border-top: 1px solid #eee; }

.col { padding-right: 10px; }
.col.url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ok { color: #2e7d32; font-weight: 700; }
.fail { color: #c62828; font-weight: 700; }

.col.details { grid-column: 1 / -1; margin-top: 8px; }
.detail-block { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 8px; margin-bottom: 8px; }
.detail-block pre { margin: 6px 0 0 0; white-space: pre-wrap; word-break: break-all; }
</style>
