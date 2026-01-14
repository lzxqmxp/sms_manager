import { app, BrowserWindow, shell, ipcMain, Menu, Tray } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
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
  setLogEnabled,
  getLogEnabled,
  getApiLogs,
  listApiActions,
  PhoneNumberRecord
} from '../database/index.js'
import { SmsActivateService, COUNTRY_CODES, SERVICE_CODES, OPERATOR_CODES } from '../services/sms-activate.js'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = require('../../package.json')

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
let tray: Tray | null = null
let isQuitting = false
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: `短信工具 v${pkg.version}`,
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

  // 隐藏/移除默认菜单栏
  win.removeMenu()

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

  // 关闭主窗口时最小化到托盘
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win?.hide()
    }
  })
}

function setupTray() {
  if (tray) return
  const basePublic = process.env.VITE_PUBLIC || path.join(process.env.APP_ROOT, 'public')
  const packagedIcon = path.join(process.resourcesPath || '', 'app.asar.unpacked', 'public', 'favicon.ico')
  const iconCandidates = [
    path.join(basePublic, 'favicon.ico'),
    packagedIcon,
  ]
  const iconPath = iconCandidates.find(p => p && fs.existsSync(p)) || iconCandidates[0]

  try {
    tray = new Tray(iconPath)
  } catch (e) {
    console.error('创建托盘失败，图标路径:', iconPath, e)
    return
  }
  tray.setToolTip(`短信工具 v${pkg.version}`)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (!win) {
      createWindow()
      return
    }
    win.show()
    win.focus()
  })

  tray.on('double-click', () => {
    if (!win) {
      createWindow()
      return
    }
    win.show()
    win.focus()
  })
}

// SMS-Activate 服务实例
let smsService: SmsActivateService | null = null

// 活跃的号码轮询定时器
const pollingTimers: Map<string, NodeJS.Timeout> = new Map()

// 自动释放定时器
const releaseTimers: Map<string, NodeJS.Timeout> = new Map()
// 到期完成定时器（超过释放时间 2 分钟后标记完成）
const completionTimers: Map<string, NodeJS.Timeout> = new Map()

// 记录已为某个激活ID触发过一次延迟重发请求，避免重复触发
const resendRequested: Set<string> = new Set()
// 记录已为某个激活ID保存过第一条短信，避免重复保存相同短信
const firstSmsSaved: Set<string> = new Set()

/**
 * 开始轮询短信
 */
function startSmsPolling(activationId: string, phoneNumber: string) {
  // 若已存在轮询，则不重复创建
  if (pollingTimers.has(activationId)) return
  // 每 5 秒检查一次短信
  const timer = setInterval(async () => {
    // 确保服务已初始化
    if (!smsService) {
      const cfg = getApiConfig()
      if (cfg?.api_key) {
        smsService = new SmsActivateService(cfg.api_key)
      } else {
        return
      }
    }
    
    try {
      const status = await smsService.getStatus(activationId)
      
      if (status.status === 'received' && status.message) {
        // 收到短信，保存到数据库（仅首次保存，避免重复保存同一条短信）
        if (!firstSmsSaved.has(activationId)) {
          saveSmsMessage({
            activation_id: activationId,
            phone_number: phoneNumber,
            message: status.message,
            received_at: Date.now()
          })
          firstSmsSaved.add(activationId)

          // 收到短信后立即取消自动释放定时器，避免误释放
          const releaseTimer = releaseTimers.get(activationId)
          if (releaseTimer) {
            clearTimeout(releaseTimer)
            releaseTimers.delete(activationId)
          }
          // 收到短信后仍保留完成定时器以便到期标记完成

          // 通知渲染进程（仅首次）
          win?.webContents.send('sms-received', {
            activationId,
            phoneNumber,
            message: status.message,
            receivedAt: Date.now()
          })
        }

        // 不执行完成激活动作；改为延迟5秒触发一次 requestOneMoreSms，且仅触发一次
        if (!resendRequested.has(activationId)) {
          resendRequested.add(activationId)
          setTimeout(async () => {
            try {
              await smsService.requestOneMoreSms(activationId)
            } catch (e) {
              console.error('延迟重发请求失败:', e)
            }
          }, 5000)
        }
      } else if (status.status === 'cancelled') {
        // 已取消
        updatePhoneNumberStatus(activationId, 'cancelled', Date.now())
        clearInterval(timer)
        pollingTimers.delete(activationId)
        // 清理标记
        resendRequested.delete(activationId)
        firstSmsSaved.delete(activationId)
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
  // 若已存在释放定时器，则不重复创建
  if (releaseTimers.has(activationId)) return
  // 在到期前 2 分钟释放号码
  const releaseTime = expiresAt - 2 * 60 * 1000
  const delay = releaseTime - Date.now()

  // 若已超过释放时间 2 分钟（即到期时间），直接标记为完成
  if (Date.now() >= expiresAt) {
    updatePhoneNumberStatus(activationId, 'completed', Date.now())
    return
  }
  
  if (delay > 0) {
    const timer = setTimeout(async () => {
      // 确保服务已初始化
      if (!smsService) {
        const cfg = getApiConfig()
        if (cfg?.api_key) {
          smsService = new SmsActivateService(cfg.api_key)
        } else {
          return
        }
      }
      
      try {
        // 检查是否已收到短信（本地 + 远端）
        const messages = getSmsMessages(activationId)
        let remoteReceived = false
        try {
          const st = await smsService.getStatus(activationId)
          remoteReceived = st.status === 'received'
        } catch (e) {
          // 远端状态获取失败时，不据此放行释放，以本地记录为准
        }
        if (messages.length === 0 && !remoteReceived) {
          // 本地无短信且远端未标记为已收，尝试取消激活
          const resp = await smsService.cancelActivation(activationId)
          const ok = typeof resp === 'string' && /^ACCESS_/i.test(resp)
          let confirmed = false
          // 短暂重试确认取消状态（最多 3 次，每次 1 秒）
          for (let i = 0; i < 3; i++) {
            try {
              const verify = await smsService.getStatus(activationId)
              if (verify.status === 'cancelled') {
                confirmed = true
                break
              }
            } catch {}
            await new Promise(r => setTimeout(r, 1000))
          }
          if (ok || confirmed) {
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

            // 释放后不再需要完成定时器
            const completionTimer = completionTimers.get(activationId)
            if (completionTimer) {
              clearTimeout(completionTimer)
              completionTimers.delete(activationId)
            }
          } else {
            console.warn('自动释放失败：远端未确认取消且返回非 ACCESS_* 响应', resp)
          }
        } else {
          // 已收到短信（本地或远端显示已收），不进行自动释放
          // 若远端已收但本地尚未保存，后续轮询会入库并完成
        }
      } catch (error) {
        console.error('自动释放错误:', error)
      }
      
      releaseTimers.delete(activationId)
    }, delay)
    
    releaseTimers.set(activationId, timer)
  } else {
    // 释放时间已过但未到到期时间，则仅安排完成定时器
  }

  // 安排到期完成定时器（释放时间后 2 分钟，即 expiresAt）
  const completeDelay = expiresAt - Date.now()
  if (completeDelay > 0 && !completionTimers.has(activationId)) {
    const completeTimer = setTimeout(() => {
      updatePhoneNumberStatus(activationId, 'completed', Date.now())
      completionTimers.delete(activationId)
    }, completeDelay)
    completionTimers.set(activationId, completeTimer)
  }
}

/**
 * 恢复数据库中已存在的活跃会话，重新启动轮询与自动释放
 */
function restoreActiveSessions() {
  try {
    const numbers = getActivePhoneNumbers()
    for (const n of numbers) {
      startSmsPolling(n.activation_id, n.phone_number)
      setAutoReleaseTimer(n.activation_id, n.expires_at)
    }
  } catch (e) {
    console.error('恢复活跃会话失败:', e)
  }
}

app.whenReady().then(() => {
  // 初始化数据库
  initDatabase()
  createWindow()
  setupTray()
  // 恢复已有活跃号码的轮询与释放定时器
  restoreActiveSessions()
})

app.on('window-all-closed', () => {
  // 关闭数据库
  closeDatabase()
  // 清理所有定时器
  pollingTimers.forEach(timer => clearInterval(timer))
  releaseTimers.forEach(timer => clearTimeout(timer))
  completionTimers.forEach(timer => clearTimeout(timer))
  
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
 * 获取/设置 API 日志开关
 */
ipcMain.handle('get-log-config', async () => {
  try {
    return { success: true, enabled: getLogEnabled() }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('set-log-enabled', async (_evt, enabled: boolean) => {
  try {
    setLogEnabled(!!enabled)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

/**
 * 获取 API 日志
 */
ipcMain.handle('get-api-logs', async (_evt, filters: { action?: string; start?: number; end?: number; limit?: number; offset?: number }) => {
  try {
    const rows = getApiLogs(filters || {})
    return { success: true, data: rows }
  } catch (error) {
    console.error('获取 API 日志错误:', error)
    return { success: false, error: String(error) }
  }
})

/**
 * 列出 API 动作
 */
ipcMain.handle('list-api-actions', async () => {
  try {
    const actions = listApiActions()
    return { success: true, data: actions }
  } catch (error) {
    console.error('列出 API 动作错误:', error)
    return { success: false, error: String(error) }
  }
})

/**
 * 请求号码
 */
ipcMain.handle('request-number', async (_, service: string, country: string, options?: { operators?: string[]; maxPrice?: number; ref?: string }) => {
  try {
    if (!smsService) {
      const config = getApiConfig()
      if (!config?.api_key) {
        throw new Error('未配置 API Key')
      }
      smsService = new SmsActivateService(config.api_key)
    }
    
    // 获取国家代码：若前端已传入纯数字代码（如 '187'），则直接透传；否则按映射表转换
    const countryTrim = String(country || '').trim()
    const countryCode = /^\d+$/.test(countryTrim) ? countryTrim : (COUNTRY_CODES[countryTrim] || '12')
    
    // 获取服务代码
    const serviceCode = SERVICE_CODES[service] || service
    
    // v2 支持多个运营商优先顺序，组合为 CSV（可来自前端 options）
    const fallbackOps = ['tmobile', 'at_t']
    const opList = Array.isArray(options?.operators) && options!.operators!.length > 0 ? options!.operators! : fallbackOps
    const operatorCsv = opList.map(op => OPERATOR_CODES[op] || op).filter(Boolean).join(',')

    // 使用 API v2 获取号码（透传 maxPrice/ref）
    const result: any = await smsService.getNumberV2(
      serviceCode,
      countryCode,
      operatorCsv,
      { maxPrice: options?.maxPrice, ref: options?.ref }
    )
    
    // 时间按本地语义：创建时间=当前时刻；到期时间=创建时间+20分钟
    const createdAt = Date.now()
    const expiresAt = createdAt + 20 * 60 * 1000
    
    const record: PhoneNumberRecord = {
      activation_id: result.activationId,
      phone_number: result.phoneNumber,
      service,
      // 以接口返回为准（countryCode 为数字字符串）
      country: (result.countryCode ? String(result.countryCode) : country),
      // 以接口返回为准
      operator: (result.activationOperator || (result as any).operator || (operatorCsv ? operatorCsv.split(',')[0] : undefined)),
      status: 'active',
      // 以接口返回成本为准
      cost: typeof result.activationCost === 'number' ? result.activationCost : (result.price as number | undefined),
      created_at: createdAt,
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
 * 列出服务、国家、运营商（从服务层取）
 */
ipcMain.handle('list-services', async () => {
  try {
    if (!smsService) {
      const config = getApiConfig()
      if (!config?.api_key) throw new Error('未配置 API Key')
      smsService = new SmsActivateService(config.api_key)
    }
    const data = await smsService.getServicesList()
    return { success: true, data }
  } catch (error) {
    console.error('获取服务列表错误:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('list-countries', async () => {
  try {
    if (!smsService) {
      const config = getApiConfig()
      if (!config?.api_key) throw new Error('未配置 API Key')
      smsService = new SmsActivateService(config.api_key)
    }
    const data = await smsService.getCountries()
    return { success: true, data }
  } catch (error) {
    console.error('获取国家列表错误:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('list-operators', async (_evt, country: string) => {
  try {
    if (!smsService) {
      const config = getApiConfig()
      if (!config?.api_key) throw new Error('未配置 API Key')
      smsService = new SmsActivateService(config.api_key)
    }
    const data = await smsService.getOperators(country)
    return { success: true, data }
  } catch (error) {
    console.error('获取运营商列表错误:', error)
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
    // 先请求取消，依据返回值判断；再进行短暂校验
    const resp = await smsService.cancelActivation(activationId)
    const ok = typeof resp === 'string' && /^ACCESS_/i.test(resp)
    if (!ok) {
      throw new Error('取消失败：' + String(resp))
    }
    // 校验（不阻塞释放，最多重试 3 次）
    for (let i = 0; i < 3; i++) {
      try {
        const verify = await smsService.getStatus(activationId)
        if (verify.status === 'cancelled') break
      } catch {}
      await new Promise(r => setTimeout(r, 500))
    }
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

    // 取消完成定时器
    const completionTimer = completionTimers.get(activationId)
    if (completionTimer) {
      clearTimeout(completionTimer)
      completionTimers.delete(activationId)
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
