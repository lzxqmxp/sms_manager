<!-- SMS Manager 主界面组件 -->
<template>
  <div class="sms-manager">
    <!-- 顶部导航栏 -->
    <div class="header">
      <h1 class="title">📱 SMS Manager - 短信接码管理器</h1>
      <div class="header-right">
        <div class="balance" v-if="balance !== null">
          <span class="balance-label">账户余额:</span>
          <span class="balance-value">${{ balance.toFixed(2) }}</span>
          <button @click="refreshBalance" class="btn-refresh" :disabled="loading">
            🔄 刷新
          </button>
        </div>
      </div>
    </div>

    <!-- API Key 配置区域 -->
    <div class="config-section" v-if="!hasApiKey">
      <div class="config-card">
        <h2>⚙️ API 配置</h2>
        <p class="help-text">请输入您的 SMS-Activate API Key 以开始使用</p>
        <div class="input-group">
          <input 
            v-model="apiKeyInput" 
            type="text" 
            placeholder="请输入 API Key"
            class="input-field"
            @keyup.enter="saveApiKey"
          />
          <button @click="saveApiKey" class="btn-primary" :disabled="!apiKeyInput || loading">
            保存并连接
          </button>
        </div>
      </div>
    </div>

    <!-- 主功能区域 -->
    <div class="main-content" v-else>
      <!-- 请求号码区域 -->
      <div class="request-section">
        <div class="section-card">
          <h2>🎯 请求号码</h2>
          <div class="form-group">
            <label>服务商:</label>
            <select v-model="selectedService" class="select-field">
              <option value="tinder">Tinder</option>
              <option value="telegram">Telegram</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="google">Google</option>
              <option value="facebook">Facebook</option>
            </select>
          </div>
          <div class="form-group">
            <label>国家:</label>
            <select v-model="selectedCountry" class="select-field">
              <option value="USA">美国 (USA)</option>
              <option value="Russia">俄罗斯</option>
              <option value="Ukraine">乌克兰</option>
              <option value="Philippines">菲律宾</option>
              <option value="Indonesia">印度尼西亚</option>
            </select>
          </div>
          <button 
            @click="requestNumber" 
            class="btn-primary btn-large"
            :disabled="loading || requestingNumber"
          >
            {{ requestingNumber ? '⏳ 请求中...' : '🚀 请求号码' }}
          </button>
        </div>
      </div>

      <!-- 活跃号码列表 -->
      <div class="numbers-section">
        <h2>📋 活跃号码列表</h2>
        
        <div v-if="activeNumbers.length === 0" class="empty-state">
          <p>暂无活跃号码</p>
          <p class="empty-hint">点击上方"请求号码"按钮获取新号码</p>
        </div>

        <div v-else class="numbers-list">
          <div 
            v-for="number in activeNumbers" 
            :key="number.activation_id"
            class="number-card"
            :class="{ 'has-sms': hasSms(number.activation_id) }"
          >
            <div class="number-header">
              <div class="number-info">
                <span class="phone-number">📞 {{ formatPhoneNumber(number.phone_number) }}</span>
                <span class="service-badge">{{ getServiceName(number.service) }}</span>
                <span class="country-badge">{{ number.country }}</span>
              </div>
              <div class="number-actions">
                <button 
                  @click="requestResendSms(number.activation_id)" 
                  class="btn-secondary btn-small"
                  :disabled="loading"
                  title="请求重新发送短信"
                >
                  📨 重发
                </button>
                <button 
                  @click="releaseNumber(number.activation_id)" 
                  class="btn-danger btn-small"
                  :disabled="loading"
                  title="手动释放号码"
                >
                  ❌ 释放
                </button>
              </div>
            </div>

            <!-- 倒计时 -->
            <div class="countdown">
              <span class="countdown-label">⏱️ 自动释放倒计时:</span>
              <span class="countdown-value">{{ getCountdown(number.expires_at) }}</span>
            </div>

            <!-- 短信内容 -->
            <div class="sms-content" v-if="getSmsForNumber(number.activation_id).length > 0">
              <h4 class="sms-header">💬 收到的短信:</h4>
              <div 
                v-for="(sms, index) in getSmsForNumber(number.activation_id)" 
                :key="sms.id"
                class="sms-message"
              >
                <div class="sms-index">第 {{ index + 1 }} 条</div>
                <div class="sms-text">{{ sms.message }}</div>
                <div class="sms-time">{{ formatTime(sms.received_at) }}</div>
              </div>
            </div>
            <div v-else class="waiting-sms">
              <span class="waiting-icon">⏳</span>
              <span class="waiting-text">等待接收短信...</span>
            </div>

            <!-- 号码详情 -->
            <div class="number-details">
              <span class="detail-item">
                <strong>激活ID:</strong> {{ number.activation_id }}
              </span>
              <span class="detail-item">
                <strong>状态:</strong> {{ getStatusText(number.status) }}
              </span>
              <span class="detail-item">
                <strong>创建时间:</strong> {{ formatTime(number.created_at) }}
              </span>
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
import { ref, onMounted, onUnmounted } from 'vue'

// 类型定义
interface PhoneNumber {
  id?: number
  activation_id: string
  phone_number: string
  service: string
  country: string
  operator?: string
  status: string
  cost?: number
  created_at: number
  expires_at: number
  released_at?: number
}

interface SmsMessage {
  id?: number
  activation_id: string
  phone_number: string
  message: string
  received_at: number
}

interface Notification {
  message: string
  type: 'success' | 'error' | 'info'
}

// 响应式状态
const apiKeyInput = ref('')
const hasApiKey = ref(false)
const balance = ref<number | null>(null)
const selectedService = ref('tinder')
const selectedCountry = ref('USA')
const activeNumbers = ref<PhoneNumber[]>([])
const smsMessages = ref<Map<string, SmsMessage[]>>(new Map())
const loading = ref(false)
const requestingNumber = ref(false)
const notification = ref<Notification | null>(null)

// 定时器
let countdownInterval: NodeJS.Timeout | null = null
let notificationTimeout: NodeJS.Timeout | null = null

/**
 * 显示通知
 */
function showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
  notification.value = { message, type }
  
  if (notificationTimeout) {
    clearTimeout(notificationTimeout)
  }
  
  notificationTimeout = setTimeout(() => {
    notification.value = null
  }, 3000)
}

/**
 * 保存 API Key
 */
async function saveApiKey() {
  if (!apiKeyInput.value) return
  
  loading.value = true
  try {
    const result = await window.ipcRenderer.invoke('save-api-key', apiKeyInput.value)
    if (result.success) {
      hasApiKey.value = true
      showNotification('API Key 保存成功！', 'success')
      await refreshBalance()
    } else {
      showNotification('保存失败: ' + result.error, 'error')
    }
  } catch (error) {
    showNotification('保存失败: ' + String(error), 'error')
  } finally {
    loading.value = false
  }
}

/**
 * 刷新余额
 */
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

/**
 * 请求号码
 */
async function requestNumber() {
  requestingNumber.value = true
  loading.value = true
  try {
    const result = await window.ipcRenderer.invoke(
      'request-number', 
      selectedService.value, 
      selectedCountry.value
    )
    
    if (result.success) {
      showNotification('号码获取成功！', 'success')
      await loadActiveNumbers()
      await refreshBalance()
    } else {
      showNotification('获取号码失败: ' + result.error, 'error')
    }
  } catch (error) {
    showNotification('获取号码失败: ' + String(error), 'error')
  } finally {
    requestingNumber.value = false
    loading.value = false
  }
}

/**
 * 释放号码
 */
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

/**
 * 加载活跃号码
 */
async function loadActiveNumbers() {
  try {
    const result = await window.ipcRenderer.invoke('get-active-numbers')
    if (result.success) {
      activeNumbers.value = result.data
      
      // 加载每个号码的短信
      for (const number of activeNumbers.value) {
        await loadSmsMessages(number.activation_id)
      }
    }
  } catch (error) {
    console.error('加载活跃号码失败:', error)
  }
}

/**
 * 加载短信记录
 */
async function loadSmsMessages(activationId: string) {
  try {
    const result = await window.ipcRenderer.invoke('get-sms-messages', activationId)
    if (result.success) {
      smsMessages.value.set(activationId, result.data)
    }
  } catch (error) {
    console.error('加载短信记录失败:', error)
  }
}

/**
 * 请求重发短信
 */
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

/**
 * 获取指定号码的短信
 */
function getSmsForNumber(activationId: string): SmsMessage[] {
  return smsMessages.value.get(activationId) || []
}

/**
 * 检查是否收到短信
 */
function hasSms(activationId: string): boolean {
  return getSmsForNumber(activationId).length > 0
}

/**
 * 格式化手机号
 */
function formatPhoneNumber(phone: string): string {
  return '+' + phone
}

/**
 * 获取服务名称
 */
function getServiceName(service: string): string {
  const names: Record<string, string> = {
    tinder: 'Tinder',
    telegram: 'Telegram',
    whatsapp: 'WhatsApp',
    google: 'Google',
    facebook: 'Facebook'
  }
  return names[service] || service
}

/**
 * 获取状态文本
 */
function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    active: '🟢 活跃',
    waiting: '⏳ 等待',
    completed: '✅ 完成',
    released: '🔴 已释放',
    cancelled: '❌ 已取消'
  }
  return texts[status] || status
}

/**
 * 获取倒计时
 */
function getCountdown(expiresAt: number): string {
  const now = Date.now()
  const releaseTime = expiresAt - 2 * 60 * 1000 // 提前2分钟释放
  const diff = releaseTime - now
  
  if (diff <= 0) {
    return '即将释放...'
  }
  
  const minutes = Math.floor(diff / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  
  return `${minutes}分${seconds}秒`
}

/**
 * 格式化时间
 */
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

/**
 * 监听短信接收事件
 */
function setupSmsListener() {
  window.ipcRenderer.on('sms-received', (_, data) => {
    showNotification(`收到新短信: ${data.message}`, 'success')
    loadSmsMessages(data.activationId)
  })
  
  window.ipcRenderer.on('number-released', (_, data) => {
    showNotification('号码已自动释放', 'info')
    loadActiveNumbers()
    refreshBalance()
  })
}

/**
 * 初始化
 */
onMounted(async () => {
  // 检查是否已配置 API Key
  const result = await window.ipcRenderer.invoke('get-api-key')
  if (result.success && result.apiKey) {
    hasApiKey.value = true
    apiKeyInput.value = result.apiKey
    await refreshBalance()
    await loadActiveNumbers()
  }
  
  // 设置监听器
  setupSmsListener()
  
  // 启动倒计时定时器
  countdownInterval = setInterval(() => {
    // 强制更新倒计时显示
    activeNumbers.value = [...activeNumbers.value]
  }, 1000)
  
  // 每30秒自动刷新活跃号码列表
  const refreshInterval = setInterval(() => {
    loadActiveNumbers()
  }, 30000)
  
  // 保存定时器引用以便清理
  onUnmounted(() => {
    clearInterval(refreshInterval)
  })
})

/**
 * 清理
 */
onUnmounted(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval)
  }
  if (notificationTimeout) {
    clearTimeout(notificationTimeout)
  }
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
