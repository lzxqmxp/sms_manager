<!-- SMS Manager 主界面组件（修复标签不对应与结构重复问题） -->
<template>
  <div class="sms-manager">
    <!-- 顶部导航栏 -->
    <div class="header">
      <h1 class="title">📱 SMS Manager - 短信接码管理器</h1>
      <div class="header-right">
        <div class="balance" v-if="balance !== null">
          <span class="balance-label">账户余额:</span>
          <span class="balance-value">${{ balance !== null ? balance.toFixed(2) : '0.00' }}</span>
          <button @click="refreshBalance" class="btn-refresh" :disabled="loading">🔄 刷新</button>
        </div>
        <div class="log-toggle">
          <label class="switch">
            <input type="checkbox" v-model="logEnabled" @change="applyLogEnabled" />
            <span class="slider"></span>
          </label>
          <span class="log-label">API 日志</span>
        </div>
        <button class="cache-btn" @click="clearCache">🧹 清空缓存</button>
      </div>
    </div>

    <!-- API Key 配置区域（未配置时显示） -->
    <div class="config-section" v-if="!hasApiKey">
      <div class="config-card">
        <h2>⚙️ API 配置</h2>
        <p class="help-text">请输入您的 SMS-Activate API Key 以开始使用</p>
        <div class="input-group">
          <input v-model="apiKeyInput" class="input-field" type="password" placeholder="输入 API Key" />
          <button class="btn-primary" @click="saveApiKey" :disabled="loading">保存</button>
        </div>
      </div>
    </div>

    <!-- 主功能区域（已配置时显示） -->
    <div class="main-content" v-else>
      <!-- 左侧：请求号码 -->
      <div class="request-section">
        <div class="section-card">
          <h2>🎯 请求号码</h2>
          <div class="form-group">
            <label>服务:</label>
            <!-- 合一型搜索下拉（类似 select2） -->
            <div class="search-select" ref="serviceDropdownRef">
              <input
                v-model="serviceSearch"
                class="input-field"
                type="text"
                placeholder="搜索并选择服务（如 tinder）"
                @focus="serviceOpen = true"
                @input="serviceOpen = true"
                @keydown.enter.prevent="onServiceEnter"
              />
              <div v-if="serviceOpen" class="dropdown">
                <div
                  v-for="s in filteredServices"
                  :key="s.code"
                  class="dropdown-item"
                  @mousedown.prevent="onServiceSelect(s)"
                >
                  {{ s.code }} {{ s.name || s.code }}
                </div>
                <div v-if="filteredServices.length === 0" class="dropdown-empty">无匹配项</div>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label>国家:</label>
            <select v-model="selectedCountry" class="select-field" @change="onCountryChange">
              <option v-for="c in countries" :key="c.code" :value="c.code">{{ c.code }} {{ c.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>运营商（可多选，优先从左到右）:</label>
            <div class="operator-list">
              <label v-for="op in operators" :key="op" class="op-item">
                <input type="checkbox" :value="op" v-model="selectedOperators" />
                <span>{{ op }} {{ formatOperator(op) }}</span>
              </label>
            </div>
          </div>
          <div class="form-group inline">
            <div>
              <label>最高价格（可选）:</label>
              <input type="number" min="0" step="0.01" v-model.number="maxPrice" class="input-field" placeholder="例如 2" />
            </div>
            <div>
              <label>Ref（可选）:</label>
              <input type="text" v-model="refCode" class="input-field" placeholder="推荐码/来源标识" />
            </div>
          </div>
          <div class="form-group price-row">
            <label>预计费用:</label>
            <div class="price-box">
              <span v-if="priceLoading">查询中...</span>
              <span v-else-if="estimatedPrice !== null">约 {{ estimatedPrice.toFixed(3) }}</span>
              <span v-else>尚未获取</span>
              <button class="btn-secondary btn-small" @click="fetchEstimatedPrice" :disabled="priceLoading || loading">🔍 查询价格</button>
            </div>
            <div class="price-hint" v-if="priceError">{{ priceError }}</div>
            <div class="price-hint" v-else>数据来源: getPrices</div>
          </div>
          <button @click="requestNumber" class="btn-primary btn-large" :disabled="loading || requestingNumber">
            {{ requestingNumber ? '⏳ 请求中...' : '🚀 请求号码' }}
          </button>
        </div>
      </div>

      <!-- 右侧：活跃号码列表 -->
      <div class="numbers-section">
        <h2>📋 活跃号码列表</h2>
        <div v-if="activeNumbers.length === 0" class="empty-state">
          <p>暂无活跃号码</p>
          <p class="empty-hint">点击左侧“请求号码”按钮获取新号码</p>
        </div>
        <div v-else class="numbers-list">
          <div v-for="number in activeNumbers" :key="number.activation_id" class="number-card" :class="{ 'has-sms': hasSms(number.activation_id) }">
            <div class="number-header">
              <div class="number-info">
                <span class="phone-number">📞 {{ formatPhoneNumber(number.phone_number) }}</span>
                <span class="service-badge">{{ getServiceName(number.service) }}</span>
                <span class="country-badge">{{ getCountryLabel(number.country) }}</span>
                <span class="operator-badge" v-if="number.operator">{{ formatOperator(number.operator || '') }}</span>
                <span class="cost-badge" v-if="typeof number.cost === 'number'">💲 {{ Number(number.cost).toFixed(2) }}</span>
              </div>
              <div class="number-actions">
                <button @click="requestResendSms(number.activation_id)" class="btn-secondary btn-small" :disabled="loading" title="请求重新发送短信">📨 重发</button>
                <button @click="releaseNumber(number.activation_id)" class="btn-danger btn-small" :disabled="loading" title="手动释放号码">❌ 释放</button>
              </div>
            </div>
            <div class="countdown">
              <span class="countdown-label">⏱️ 自动释放倒计时:</span>
              <span class="countdown-value">{{ getCountdown(number.expires_at) }}</span>
            </div>
            <div class="sms-content" v-if="getSmsForNumber(number.activation_id).length > 0">
              <h4 class="sms-header">💬 收到的短信:</h4>
              <div v-for="(sms, index) in getSmsForNumber(number.activation_id)" :key="sms.id" class="sms-message">
                <div class="sms-index">第 {{ index + 1 }} 条</div>
                <div class="sms-text">{{ sms.message }}</div>
                <div class="sms-time">{{ formatTime(sms.received_at) }}</div>
              </div>
            </div>
            <div v-else class="waiting-sms">
              <span class="waiting-icon">⏳</span>
              <span class="waiting-text">等待接收短信...</span>
            </div>
            <div class="number-details">
              <span class="detail-item"><strong>激活ID:</strong> {{ number.activation_id }}</span>
              <span class="detail-item"><strong>状态:</strong> {{ getStatusText(number.status) }}</span>
              <span class="detail-item"><strong>创建时间:</strong> {{ formatTime(number.created_at) }}</span>
              <span class="detail-item" v-if="number.operator"><strong>运营商:</strong> {{ formatOperator(number.operator || '') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 加载遮罩 -->
    <div class="loading-overlay" v-if="loading">
      <div class="spinner"></div>
    </div>

    <!-- 通知消息 -->
    <div class="notification" v-if="notification" :class="notification.type">
      {{ notification.message }}
    </div>
  </div>
  
</template>

<script setup lang="ts">
// 仅在渲染进程中使用的 Vue 组合式 API
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

// ---------------- 类型声明 ----------------
// 短信消息
interface SmsMessage {
  id: string | number
  message: string
  received_at: number
}

// 活跃号码
interface ActiveNumber {
  activation_id: string
  phone_number: string
  service: string
  country: string
  operator?: string
  status: string
  cost?: number
  created_at: number
  expires_at: number
}

// ---------------- 响应式状态 ----------------
const loading = ref(false)
const requestingNumber = ref(false)
const balance = ref<number | null>(null)
const logEnabled = ref(false)

const hasApiKey = ref(false)
const apiKeyInput = ref('')

const services = ref<Array<{ code: string; name: string }>>([])
// 服务搜索关键字，用于过滤服务下拉选项
const serviceSearch = ref('')
const countries = ref<Array<{ code: string; name: string }>>([])
// 运营商改为对象数组，兼容 { code, name }
const operators = ref<string[]>([])

const selectedService = ref('')
const selectedCountry = ref('')
// 实际用于请求号码的国家代码（以 getOperators 返回为准）
const countryForRequest = ref('')
const selectedOperators = ref<string[]>([])
const maxPrice = ref<number | null>(null)
const refCode = ref('')
const estimatedPrice = ref<number | null>(null)
const priceLoading = ref(false)
const priceError = ref('')

const activeNumbers = ref<ActiveNumber[]>([])
const smsMessages = ref<Map<string, SmsMessage[]>>(new Map())
// 计算属性：根据搜索关键字过滤服务列表（按 code 或 name 匹配）
const filteredServices = computed(() => {
  const kw = serviceSearch.value.trim().toLowerCase()
  if (!kw) return services.value
  return services.value.filter(s => {
    const code = String(s.code || '').toLowerCase()
    const name = String(s.name || '').toLowerCase()
    return code.includes(kw) || name.includes(kw)
  })
})

// 服务搜索下拉开关与容器引用
const serviceOpen = ref(false)
const serviceDropdownRef = ref<HTMLElement | null>(null)

// 选择服务：写入选中值并同步搜索框显示文本
function onServiceSelect(s: { code: string; name?: string }) {
  selectedService.value = s.code
  serviceSearch.value = `${s.code} ${s.name || s.code}`
  serviceOpen.value = false
}

// 按回车选择第一个匹配项
function onServiceEnter() {
  const first = filteredServices.value[0]
  if (first) onServiceSelect(first)
}

// 点击空白处关闭下拉
function onDocClick(e: MouseEvent) {
  const el = serviceDropdownRef.value
  if (!el) return
  const target = e.target as Node
  if (!el.contains(target)) serviceOpen.value = false
}

// 同步：当选中服务变化时，更新输入框显示文本
watch(selectedService, (val) => {
  const item = services.value.find(s => s.code === val)
  if (item) serviceSearch.value = `${item.code} ${item.name || item.code}`
})

watch([selectedService, countryForRequest], () => {
  if (hasApiKey.value) fetchEstimatedPrice()
})

watch(hasApiKey, (val) => {
  if (val) fetchEstimatedPrice()
})

const notification = ref<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
let notificationTimeout: ReturnType<typeof setTimeout> | null = null
let countdownInterval: ReturnType<typeof setInterval> | null = null

// 本地缓存配置（10 分钟过期）
const CACHE_KEY_SERVICES = 'smsmgr_services_cache'
const CACHE_KEY_COUNTRIES = 'smsmgr_countries_cache'
const CACHE_PREFIX_OPERATORS = 'smsmgr_ops_'
const CACHE_TTL = 10 * 60 * 1000

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const obj = JSON.parse(raw) as { expiresAt: number; data: T }
    if (!obj || typeof obj !== 'object') return null
    if (typeof obj.expiresAt !== 'number' || Date.now() > obj.expiresAt) return null
    return obj.data
  } catch {
    return null
  }
}

function writeCache<T>(key: string, data: T) {
  try {
    const payload = { expiresAt: Date.now() + CACHE_TTL, data }
    localStorage.setItem(key, JSON.stringify(payload))
  } catch {}
}

// ---------------- 工具函数 ----------------
function showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
  notification.value = { message, type }
  if (notificationTimeout) clearTimeout(notificationTimeout)
  notificationTimeout = setTimeout(() => {
    notification.value = null
  }, 2500)
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY_SERVICES)
    localStorage.removeItem(CACHE_KEY_COUNTRIES)
    const toDelete: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(CACHE_PREFIX_OPERATORS)) toDelete.push(k)
    }
    toDelete.forEach(k => localStorage.removeItem(k))
  } catch {}
  showNotification('缓存已清空', 'info')
}

function getSmsForNumber(activationId: string): SmsMessage[] {
  return smsMessages.value.get(activationId) || []
}

function hasSms(activationId: string): boolean {
  return getSmsForNumber(activationId).length > 0
}

function formatPhoneNumber(phone: string): string {
  return '+' + phone
}

// 根据 getServicesList 返回的数据映射服务名称
function getServiceName(serviceCode: string): string {
  // 优先按 code 精确匹配
  const item = services.value.find(s => String(s.code) === String(serviceCode))
  if (item && item.name) return item.name
  // 兼容大小写差异
  const lower = String(serviceCode || '').toLowerCase()
  const item2 = services.value.find(s => String(s.code || '').toLowerCase() === lower)
  return (item2 && item2.name) || serviceCode
}

function formatOperator(op: string): string {
  const map: Record<string, string> = {
    tmobile: 'T-Mobile',
    att: 'AT&T',
    at_t: 'AT&T',
    verizon: 'Verizon',
    sprint: 'Sprint',
    any: '任意',
  }
  return map[op] || op
}

function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    active: '🟢 活跃',
    waiting: '⏳ 等待',
    completed: '✅ 完成',
    released: '🔴 已释放',
    cancelled: '❌ 已取消',
  }
  return texts[status] || status
}

function getCountdown(expiresAt: number): string {
  const now = Date.now()
  const releaseTime = expiresAt - 2 * 60 * 1000 // 提前2分钟释放
  const diff = releaseTime - now
  if (diff <= 0) return '即将释放...'
  const minutes = Math.floor(diff / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  return `${minutes}分${seconds}秒`
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

// 根据国家代码（键）获取中文名称（若无则回退英文/俄文/原值）
function getCountryLabel(code: string): string {
  const item = countries.value.find(c => c.code === String(code))
  return item?.name || String(code)
}

// ---------------- IPC 调用 ----------------
async function saveApiKey() {
  loading.value = true
  try {
    const result = await window.ipcRenderer.invoke('save-api-key', apiKeyInput.value)
    if (result.success) {
      hasApiKey.value = true
      showNotification('API Key 已保存', 'success')
      await refreshBalance()
      await loadActiveNumbers()
    } else {
      showNotification('保存失败: ' + (result.error || ''), 'error')
    }
  } catch (error) {
    showNotification('保存失败: ' + String(error), 'error')
  } finally {
    loading.value = false
  }
}

async function refreshBalance() {
  loading.value = true
  try {
    const result = await window.ipcRenderer.invoke('get-balance')
    if (result.success) {
      balance.value = result.balance
    } else {
      showNotification('获取余额失败: ' + result.error, 'error')
    }
  } catch (error) {
    showNotification('获取余额失败: ' + String(error), 'error')
  } finally {
    loading.value = false
  }
}

async function applyLogEnabled() {
  try {
    await window.ipcRenderer.invoke('set-log-enabled', logEnabled.value)
    showNotification(`API 日志已${logEnabled.value ? '开启' : '关闭'}`, 'info')
  } catch (error) {
    showNotification('设置日志开关失败: ' + String(error), 'error')
  }
}

async function fetchEstimatedPrice() {
  if (!hasApiKey.value) return
  const svc = String(selectedService.value || '').trim()
  const ctry = String(countryForRequest.value || selectedCountry.value || '').trim()
  if (!svc || !ctry) {
    estimatedPrice.value = null
    return
  }

  priceLoading.value = true
  priceError.value = ''
  try {
    const res = await window.ipcRenderer.invoke('get-prices', { service: svc, country: ctry })
    if (res?.success) {
      if (res.price === null || res.price === undefined) {
        estimatedPrice.value = null
        priceError.value = '未返回费用数据'
      } else {
        estimatedPrice.value = Number(res.price)
      }
    } else {
      estimatedPrice.value = null
      priceError.value = res?.error ? String(res.error) : '查询失败'
    }
  } catch (error) {
    estimatedPrice.value = null
    priceError.value = String(error)
  } finally {
    priceLoading.value = false
  }
}

async function requestNumber() {
  requestingNumber.value = true
  loading.value = true
  try {
    // 将 Vue 的响应式数据转换为可结构化克隆的纯数据，避免 Electron IPC 报错
    const plainOperators = Array.isArray(selectedOperators.value)
      ? Array.from((selectedOperators.value as unknown as string[]))
      : []
    const payload = {
      operators: plainOperators,
      maxPrice: typeof maxPrice.value === 'number' ? maxPrice.value : undefined,
      ref: refCode.value ? String(refCode.value) : undefined,
    }
    const result = await window.ipcRenderer.invoke(
      'request-number',
      String(selectedService.value || ''),
      // 国家的取值优先使用 getOperators 阶段确定的代码
      String(countryForRequest.value || selectedCountry.value || ''),
      payload,
    )
    if (result.success) {
      showNotification('号码获取成功！', 'success')
      await loadActiveNumbers()
      await refreshBalance()
    } else {
      showNotification('获取号码失败: ' + result.error, 'error')
    }
  } catch (error) {
    console.error('获取号码失败:', error)
    showNotification('获取号码失败: ' + String(error), 'error')
  } finally {
    requestingNumber.value = false
    loading.value = false
  }
}

async function onCountryChange() {
  try {
    const cacheKey = `${CACHE_PREFIX_OPERATORS}${String(selectedCountry.value)}`
    const cachedOps = readCache<string[]>(cacheKey)
    if (cachedOps && Array.isArray(cachedOps)) {
      operators.value = cachedOps
      selectedOperators.value = []
      countryForRequest.value = String(selectedCountry.value)
      return
    }

    const res = await window.ipcRenderer.invoke('list-operators', selectedCountry.value)
    // 严格模式：假定返回为 Axios 响应结构 { status, data }
    const body: any = res?.data
    let list: string[] = []
    // 默认将请求用国家设为当前选择
    let effectiveCountry = String(selectedCountry.value)
    if (Array.isArray(body)) {
      // 主进程已按国家返回纯数组
      list = body.map(v => String(v))
      // 若是数组，说明服务端已按传入的国家筛选，此时直接沿用
      countryForRequest.value = effectiveCountry
    } else {
      // 从对象结构中读取指定国家（187）的数组
      const co: any = body?.countryOperators
      const key = String(selectedCountry.value)
      let arr = co?.[key]
      // 如果当前 key 未命中，但返回仅含一个国家键，则使用该唯一键
      if (!Array.isArray(arr) && co && typeof co === 'object') {
        const keys = Object.keys(co)
        if (keys.length === 1) {
          effectiveCountry = String(keys[0])
          arr = co[effectiveCountry]
        }
      }
      list = Array.isArray(arr) ? arr.map((v: any) => String(v)) : []
      // 以最终确定的国家代码作为后续请求的国家
      countryForRequest.value = effectiveCountry
    }

    operators.value = list
    selectedOperators.value = []

    if (list.length) {
      const finalKey = `${CACHE_PREFIX_OPERATORS}${countryForRequest.value || effectiveCountry}`
      writeCache(finalKey, list)
    }

    // 国家切换后保留当前服务；仅当当前值为空或已不存在时才回退默认项
    if (services.value.length) {
      const currentExists = services.value.some(it => String(it.code) === String(selectedService.value))
      if (!selectedService.value || !currentExists) {
        const tinderItem = services.value.find(it => String(it.name || '').toLowerCase() === 'tinder' || String(it.code || '').toLowerCase() === 'oi')
        const pick = tinderItem || services.value[0]
        selectedService.value = pick.code
      }
    }
  } catch (e) {
    operators.value = []
    selectedOperators.value = []
    countryForRequest.value = String(selectedCountry.value)
  }
}

async function releaseNumber(activationId: string) {
  if (!confirm('确定要手动释放这个号码吗？')) return
  loading.value = true
  try {
    const result = await window.ipcRenderer.invoke('release-number', activationId)
    if (result.success) {
      showNotification('号码已释放', 'success')
      await loadActiveNumbers()
      await refreshBalance()
    } else {
      showNotification('释放失败: ' + result.error, 'error')
    }
  } catch (error) {
    showNotification('释放失败: ' + String(error), 'error')
  } finally {
    loading.value = false
  }
}

async function loadActiveNumbers() {
  try {
    const result = await window.ipcRenderer.invoke('get-active-numbers')
    if (result.success) {
      activeNumbers.value = result.data as ActiveNumber[]
      for (const number of activeNumbers.value) {
        await loadSmsMessages(number.activation_id)
      }
    }
  } catch (error) {
    console.error('加载活跃号码失败:', error)
  }
}

async function loadSmsMessages(activationId: string) {
  try {
    const result = await window.ipcRenderer.invoke('get-sms-messages', activationId)
    if (result.success) {
      smsMessages.value.set(activationId, result.data as SmsMessage[])
    }
  } catch (error) {
    console.error('加载短信记录失败:', error)
  }
}

async function requestResendSms(activationId: string) {
  loading.value = true
  try {
    const result = await window.ipcRenderer.invoke('request-resend-sms', activationId)
    if (result.success) {
      showNotification('已请求重新发送短信', 'success')
    } else {
      showNotification('请求失败: ' + result.error, 'error')
    }
  } catch (error) {
    showNotification('请求失败: ' + String(error), 'error')
  } finally {
    loading.value = false
  }
}

function setupSmsListener() {
  window.ipcRenderer.on('sms-received', (_, data: { activationId: string; message: string }) => {
    showNotification(`收到新短信: ${data.message}`, 'success')
    loadSmsMessages(data.activationId)
  })
  window.ipcRenderer.on('number-released', () => {
    showNotification('号码已自动释放', 'info')
    loadActiveNumbers()
    refreshBalance()
  })
}

// ---------------- 生命周期 ----------------
onMounted(async () => {
  // 读取 API Key
  try {
    const result = await window.ipcRenderer.invoke('get-api-key')
    if (result.success && result.apiKey) {
      hasApiKey.value = true
      apiKeyInput.value = result.apiKey
      await refreshBalance()
      await loadActiveNumbers()
    }
  } catch {}

  // 日志配置
  try {
    const cfg = await window.ipcRenderer.invoke('get-log-config')
    if (cfg?.success) logEnabled.value = !!cfg.enabled
  } catch {}

  // 加载服务与国家（带缓存）
  try {
    const cachedServices = readCache<Array<{ code: string; name: string }>>(CACHE_KEY_SERVICES)
    const cachedCountries = readCache<Array<{ code: string; name: string }>>(CACHE_KEY_COUNTRIES)
    if (cachedServices) services.value = cachedServices
    if (cachedCountries) countries.value = cachedCountries

    const needServices = services.value.length === 0
    const needCountries = countries.value.length === 0

    const [sv, ct] = await Promise.all([
      needServices ? window.ipcRenderer.invoke('list-services') : Promise.resolve(null),
      needCountries ? window.ipcRenderer.invoke('list-countries') : Promise.resolve(null),
    ])

    if (needServices && sv?.success) {
      const raw = sv.data
      let arr: Array<{ code: string; name: string }> = []
      if (raw && typeof raw === 'object') {
        if (Array.isArray((raw as any).services)) {
          arr = (raw as any).services
            .map((it: any) => ({ code: String(it.code || it.value || ''), name: String(it.name || '') }))
            .filter((it: any) => !!it.code)
        } else {
          for (const k in raw as any) {
            const item = (raw as any)[k]
            arr.push({ code: k, name: item?.name || k })
          }
        }
      }
      services.value = arr
      if (arr.length) writeCache(CACHE_KEY_SERVICES, arr)
    }

    if (needCountries && ct?.success) {
      const raw = ct.data
      const arr: Array<{ code: string; name: string }> = []
      if (raw && typeof raw === 'object') {
        for (const k in raw as any) {
          const item = (raw as any)[k]
          const name = (item && (item.chn || item.eng || item.rus)) || String(k)
          arr.push({ code: String(k), name: String(name) })
        }
      }
      countries.value = arr
      if (arr.length) writeCache(CACHE_KEY_COUNTRIES, arr)
    }

    if (!selectedService.value && services.value.length) {
      const tinderItem = services.value.find(it => String(it.name || '').toLowerCase() === 'tinder' || String(it.code || '').toLowerCase() === 'oi')
      const displayItem = tinderItem || services.value[0]
      selectedService.value = displayItem.code
      serviceSearch.value = `${displayItem.code} ${displayItem.name || displayItem.code}`
    }

    if (!selectedCountry.value && countries.value.length) {
      const byCode = countries.value.find(it => String(it.code) === '187')
      const byName = countries.value.find(it => /美国|\busa\b|united states/i.test(String(it.name || '')))
      const pick = byCode || byName || countries.value[0]
      selectedCountry.value = pick.code
      await onCountryChange()
    }
  } catch {}

  // 设置事件监听
  setupSmsListener()

  // 注册全局点击监听以关闭服务下拉
  document.addEventListener('click', onDocClick)

  // 倒计时刷新
  countdownInterval = setInterval(() => {
    activeNumbers.value = [...activeNumbers.value]
  }, 1000)
})

onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval)
  if (notificationTimeout) clearTimeout(notificationTimeout)
  document.removeEventListener('click', onDocClick)
})
</script>

<style scoped>
/* 全局样式 */
.sms-manager {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

/* 顶部导航栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 20px 30px;
  border-radius: 15px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

.title {
  margin: 0;
  color: #667eea;
  font-size: 28px;
  font-weight: 700;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 15px;
}

.log-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-label {
  color: #000000;
  font-weight: 600;
}

.cache-btn {
  padding: 10px 14px;
  border: 1px solid #f0c88f;
  border-radius: 10px;
  background: #fff7e6;
  color: #c26b00;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.cache-btn:hover {
  background: #ffe3c2;
}

.price-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.price-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f5f7ff;
  border: 1px dashed #9aa7ff;
  padding: 10px 12px;
  border-radius: 8px;
  color: #2f3367;
  width: fit-content;
}

.price-hint {
  color: #4b5563;
  font-size: 12px;
  margin: 0;
}

/* 简易开关样式 */
.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.switch input { display: none; }

.slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: rgba(255,255,255,0.4);
  transition: .2s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px; width: 18px;
  left: 3px; bottom: 3px;
  background-color: white;
  transition: .2s;
  border-radius: 50%;
}

.switch input:checked + .slider {
  background-color: #4CAF50;
}

.switch input:checked + .slider:before {
  transform: translateX(20px);
}

.balance {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 25px;
  color: white;
}

.balance-label {
  font-weight: 600;
}

.balance-value {
  font-size: 20px;
  font-weight: 700;
}

/* API 配置区域 */
.config-section {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.config-card {
  background: white;
  padding: 40px;
  border-radius: 15px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  max-width: 500px;
  width: 100%;
}

.config-card h2 {
  margin-top: 0;
  color: #333;
  font-size: 24px;
}

.help-text {
  color: #666;
  margin-bottom: 20px;
}

.input-group {
  display: flex;
  gap: 10px;
}

/* 主功能区域 */
.main-content {
  display: grid;
  grid-template-columns: 350px 1fr;
  gap: 20px;
  align-items: start;
}

.request-section {
  position: sticky;
  top: 20px;
}

.section-card {
  background: white;
  padding: 25px;
  border-radius: 15px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.section-card h2 {
  margin-top: 0;
  color: #333;
  font-size: 20px;
  margin-bottom: 20px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  color: #555;
  font-weight: 600;
}

.form-group.inline {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.operator-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.op-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #f7f7f7;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

/* 合一型搜索下拉样式 */
.search-select {
  position: relative;
}
.search-select .dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border: 2px solid #e0e0e0;
  border-top: none;
  border-radius: 0 0 8px 8px;
  max-height: 220px;
  overflow-y: auto;
  z-index: 50;
}
.search-select .dropdown-item {
  padding: 10px 12px;
  cursor: pointer;
}
.search-select .dropdown-item:hover {
  background: #f7f7f7;
}
.search-select .dropdown-empty {
  padding: 10px 12px;
  color: #999;
}

/* 输入框和选择框 */
.input-field,
.select-field {
  width: 100%;
  padding: 12px 15px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.3s;
}

.input-field:focus,
.select-field:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

/* 按钮样式 */
.btn-primary,
.btn-secondary,
.btn-danger,
.btn-refresh {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
}

.btn-secondary {
  background: #4CAF50;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #45a049;
}

.btn-danger {
  background: #f44336;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #da190b;
}

.btn-refresh {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  padding: 5px 15px;
  font-size: 12px;
}

.btn-refresh:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.3);
}

.btn-large {
  width: 100%;
  padding: 15px;
  font-size: 16px;
  margin-top: 10px;
}

.btn-small {
  padding: 5px 12px;
  font-size: 12px;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 号码列表区域 */
.numbers-section {
  background: white;
  padding: 25px;
  border-radius: 15px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.numbers-section h2 {
  margin-top: 0;
  color: #333;
  font-size: 20px;
  margin-bottom: 20px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.empty-state p {
  margin: 10px 0;
  font-size: 16px;
}

.empty-hint {
  font-size: 14px;
  color: #bbb;
}

.numbers-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

/* 号码卡片 */
.number-card {
  background: #f8f9fa;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  padding: 20px;
  transition: all 0.3s;
}

.number-card.has-sms {
  border-color: #4CAF50;
  box-shadow: 0 0 15px rgba(76, 175, 80, 0.2);
}

.number-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.number-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.phone-number {
  font-size: 18px;
  font-weight: 700;
  color: #333;
}

.service-badge,
.country-badge {
  padding: 4px 12px;
  border-radius: 15px;
  font-size: 12px;
  font-weight: 600;
}

.service-badge {
  background: #667eea;
  color: white;
}

.country-badge {
  background: #f0f0f0;
  color: #666;
}

.operator-badge {
  background: #e0f7fa;
  color: #00796b;
  padding: 4px 12px;
  border-radius: 15px;
  font-size: 12px;
  font-weight: 600;
}

.cost-badge {
  background: #fff0f0;
  color: #c0392b;
  padding: 4px 12px;
  border-radius: 15px;
  font-size: 12px;
  font-weight: 700;
}

.number-actions {
  display: flex;
  gap: 8px;
}

/* 倒计时 */
.countdown {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: #fff3cd;
  border-radius: 8px;
  margin-bottom: 15px;
}

.countdown-label {
  font-weight: 600;
  color: #856404;
}

.countdown-value {
  font-size: 16px;
  font-weight: 700;
  color: #856404;
}

/* 短信内容 */
.sms-content {
  margin: 15px 0;
}

.sms-header {
  color: #4CAF50;
  margin: 0 0 10px 0;
  font-size: 14px;
}

.sms-message {
  background: white;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 10px;
  border-left: 4px solid #4CAF50;
}

.sms-index {
  font-size: 11px;
  color: #999;
  margin-bottom: 5px;
}

.sms-text {
  font-size: 15px;
  color: #333;
  font-weight: 600;
  margin-bottom: 5px;
  word-break: break-all;
}

.sms-time {
  font-size: 11px;
  color: #999;
}

.waiting-sms {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #e3f2fd;
  border-radius: 8px;
  color: #1976d2;
  margin: 15px 0;
}

.waiting-icon {
  font-size: 16px;
}

/* 号码详情 */
.number-details {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 15px;
  border-top: 1px solid #e0e0e0;
  font-size: 12px;
  color: #666;
}

.detail-item strong {
  color: #333;
}

/* 加载遮罩 */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 通知消息 */
.notification {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 15px 25px;
  border-radius: 8px;
  color: white;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 2000;
  animation: slideIn 0.3s ease-out;
}

.notification.success {
  background: #4CAF50;
}

.notification.error {
  background: #f44336;
}

.notification.info {
  background: #2196F3;
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .main-content {
    grid-template-columns: 1fr;
  }
  
  .request-section {
    position: static;
  }
}
</style>
