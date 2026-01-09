import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { 
  initDatabase, 
  closeDatabase, 
  savePhoneNumber, 
  updatePhoneNumberStatus,
  getActivePhoneNumbers,
  saveSmsMessage,
  getSmsMessages,
  saveApiConfig,
  getApiConfig,
  PhoneNumberRecord
} from '../database/index.js'
import { SmsActivateService, COUNTRY_CODES } from '../services/sms-activate.js'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: 'SMS Manager - 短信接码管理器',
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
  // win.webContents.on('will-navigate', (event, url) => { }) #344
}

// SMS-Activate 服务实例
let smsService: SmsActivateService | null = null

// 活跃的号码轮询定时器
const pollingTimers: Map<string, NodeJS.Timeout> = new Map()

// 自动释放定时器
const releaseTimers: Map<string, NodeJS.Timeout> = new Map()

/**
 * 开始轮询短信
 */
function startSmsPolling(activationId: string, phoneNumber: string) {
  // 每 5 秒检查一次短信
  const timer = setInterval(async () => {
    if (!smsService) return
    
    try {
      const status = await smsService.getStatus(activationId)
      
      if (status.status === 'received' && status.message) {
        // 收到短信，保存到数据库
        saveSmsMessage({
          activation_id: activationId,
          phone_number: phoneNumber,
          message: status.message,
          received_at: Date.now()
        })
        
        // 通知渲染进程
        win?.webContents.send('sms-received', {
          activationId,
          phoneNumber,
          message: status.message,
          receivedAt: Date.now()
        })
        
        // 完成激活
        await smsService.finishActivation(activationId)
        updatePhoneNumberStatus(activationId, 'completed')
        
        // 停止轮询
        clearInterval(timer)
        pollingTimers.delete(activationId)
      } else if (status.status === 'cancelled') {
        // 已取消
        updatePhoneNumberStatus(activationId, 'cancelled', Date.now())
        clearInterval(timer)
        pollingTimers.delete(activationId)
      }
    } catch (error) {
      console.error('轮询短信错误:', error)
    }
  }, 5000)
  
  pollingTimers.set(activationId, timer)
}

/**
 * 设置自动释放定时器
 */
function setAutoReleaseTimer(activationId: string, expiresAt: number) {
  // 在到期前 2 分钟释放号码
  const releaseTime = expiresAt - 2 * 60 * 1000
  const delay = releaseTime - Date.now()
  
  if (delay > 0) {
    const timer = setTimeout(async () => {
      if (!smsService) return
      
      try {
        // 检查是否已收到短信
        const messages = getSmsMessages(activationId)
        if (messages.length === 0) {
          // 未收到短信，取消激活
          await smsService.cancelActivation(activationId)
          updatePhoneNumberStatus(activationId, 'released', Date.now())
          
          // 通知渲染进程
          win?.webContents.send('number-released', {
            activationId,
            reason: 'auto-release'
          })
          
          // 停止轮询
          const pollingTimer = pollingTimers.get(activationId)
          if (pollingTimer) {
            clearInterval(pollingTimer)
            pollingTimers.delete(activationId)
          }
        }
      } catch (error) {
        console.error('自动释放错误:', error)
      }
      
      releaseTimers.delete(activationId)
    }, delay)
    
    releaseTimers.set(activationId, timer)
  }
}

app.whenReady().then(() => {
  // 初始化数据库
  initDatabase()
  createWindow()
})

app.on('window-all-closed', () => {
  // 关闭数据库
  closeDatabase()
  // 清理所有定时器
  pollingTimers.forEach(timer => clearInterval(timer))
  releaseTimers.forEach(timer => clearTimeout(timer))
  
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

// ==================== SMS Manager IPC 处理器 ====================

/**
 * 保存 API Key
 */
ipcMain.handle('save-api-key', async (_, apiKey: string) => {
  try {
    saveApiConfig({ api_key: apiKey })
    smsService = new SmsActivateService(apiKey)
    return { success: true }
  } catch (error) {
    console.error('保存 API Key 错误:', error)
    return { success: false, error: String(error) }
  }
})

/**
 * 获取 API Key
 */
ipcMain.handle('get-api-key', async () => {
  try {
    const config = getApiConfig()
    return { success: true, apiKey: config?.api_key || '' }
  } catch (error) {
    console.error('获取 API Key 错误:', error)
    return { success: false, error: String(error) }
  }
})

/**
 * 获取账户余额
 */
ipcMain.handle('get-balance', async () => {
  try {
    if (!smsService) {
      const config = getApiConfig()
      if (!config?.api_key) {
        throw new Error('未配置 API Key')
      }
      smsService = new SmsActivateService(config.api_key)
    }
    
    const balance = await smsService.getBalance()
    
    // 更新数据库中的余额
    const config = getApiConfig()
    if (config) {
      saveApiConfig({ ...config, balance, last_updated: Date.now() })
    }
    
    return { success: true, balance }
  } catch (error) {
    console.error('获取余额错误:', error)
    return { success: false, error: String(error) }
  }
})

/**
 * 请求号码
 */
ipcMain.handle('request-number', async (_, service: string, country: string) => {
  try {
    if (!smsService) {
      const config = getApiConfig()
      if (!config?.api_key) {
        throw new Error('未配置 API Key')
      }
      smsService = new SmsActivateService(config.api_key)
    }
    
    // 获取国家代码
    const countryCode = COUNTRY_CODES[country] || '12'
    
    // 请求号码
    const result = await smsService.getNumber(service, countryCode)
    
    // 保存到数据库
    const now = Date.now()
    const expiresAt = now + 20 * 60 * 1000 // 20 分钟后到期
    
    const record: PhoneNumberRecord = {
      activation_id: result.activationId,
      phone_number: result.phoneNumber,
      service,
      country,
      status: 'active',
      created_at: now,
      expires_at: expiresAt
    }
    
    savePhoneNumber(record)
    
    // 开始轮询短信
    startSmsPolling(result.activationId, result.phoneNumber)
    
    // 设置自动释放定时器
    setAutoReleaseTimer(result.activationId, expiresAt)
    
    return { 
      success: true, 
      data: {
        activationId: result.activationId,
        phoneNumber: result.phoneNumber,
        expiresAt
      }
    }
  } catch (error) {
    console.error('请求号码错误:', error)
    return { success: false, error: String(error) }
  }
})

/**
 * 手动释放号码
 */
ipcMain.handle('release-number', async (_, activationId: string) => {
  try {
    if (!smsService) {
      throw new Error('SMS 服务未初始化')
    }
    
    await smsService.cancelActivation(activationId)
    updatePhoneNumberStatus(activationId, 'released', Date.now())
    
    // 停止轮询
    const pollingTimer = pollingTimers.get(activationId)
    if (pollingTimer) {
      clearInterval(pollingTimer)
      pollingTimers.delete(activationId)
    }
    
    // 取消自动释放定时器
    const releaseTimer = releaseTimers.get(activationId)
    if (releaseTimer) {
      clearTimeout(releaseTimer)
      releaseTimers.delete(activationId)
    }
    
    return { success: true }
  } catch (error) {
    console.error('释放号码错误:', error)
    return { success: false, error: String(error) }
  }
})

/**
 * 获取活跃的号码
 */
ipcMain.handle('get-active-numbers', async () => {
  try {
    const numbers = getActivePhoneNumbers()
    return { success: true, data: numbers }
  } catch (error) {
    console.error('获取活跃号码错误:', error)
    return { success: false, error: String(error) }
  }
})

/**
 * 获取短信记录
 */
ipcMain.handle('get-sms-messages', async (_, activationId: string) => {
  try {
    const messages = getSmsMessages(activationId)
    return { success: true, data: messages }
  } catch (error) {
    console.error('获取短信记录错误:', error)
    return { success: false, error: String(error) }
  }
})

/**
 * 请求重新发送短信
 */
ipcMain.handle('request-resend-sms', async (_, activationId: string) => {
  try {
    if (!smsService) {
      throw new Error('SMS 服务未初始化')
    }
    
    await smsService.requestOneMoreSms(activationId)
    return { success: true }
  } catch (error) {
    console.error('请求重发短信错误:', error)
    return { success: false, error: String(error) }
  }
})
