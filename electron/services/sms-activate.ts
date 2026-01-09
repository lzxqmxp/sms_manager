// SMS-Activate API 服务模块
import axios, { AxiosInstance } from 'axios'
import { saveApiLog, getLogEnabled } from '../database/index.js'

/**
 * SMS-Activate API 客户端
 */
export class SmsActivateService {
  private apiKey: string
  private client: AxiosInstance
  private baseURL = 'https://hero-sms.com/stubs/handler_api.php'

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.client = axios.create({
      timeout: 30000,
    })
  }

  /**
   * 掩码 URL 中的 api_key，避免敏感信息写入日志
   */
  private maskUrl(urlStr: string): string {
    try {
      const u = new URL(urlStr)
      if (u.searchParams.has('api_key')) {
        u.searchParams.set('api_key', '***')
      }
      return u.toString()
    } catch {
      return urlStr
    }
  }

  /**
   * 条件记录 API 日志
   */
  private logApi(action: string, url: string, params: Record<string, any>, response: any, success: boolean, extra?: { service?: string; country?: string; operator?: string; activation_id?: string }) {
    try {
      if (!getLogEnabled()) return
      const respStr = this.toLogString(response)
      saveApiLog({
        timestamp: Date.now(),
        action,
        url: this.maskUrl(url),
        params,
        response: respStr,
        success,
        service: extra?.service,
        country: extra?.country,
        operator: extra?.operator,
        activation_id: extra?.activation_id,
      })
    } catch {
      // 若日志写入失败，不影响主流程
    }
  }

  /**
   * 将对象安全序列化为字符串
   */
  private toLogString(obj: any): string {
    if (obj == null) return ''
    if (typeof obj === 'string') return obj
    try {
      return JSON.stringify(obj)
    } catch {
      try {
        // 循环引用等场景，做浅拷贝尝试
        const plain: Record<string, any> = {}
        for (const k in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) {
            const v = (obj as any)[k]
            if (typeof v !== 'object') plain[k] = v
          }
        }
        return JSON.stringify(plain)
      } catch {
        return String(obj)
      }
    }
  }

  /**
   * 构建请求 URL
   */
  private buildUrl(action: string, params: Record<string, string> = {}): string {
    const url = new URL(this.baseURL)
    url.searchParams.append('api_key', this.apiKey)
    url.searchParams.append('action', action)
    
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value)
    }
    
    return url.toString()
  }

  /**
   * 获取账户余额
   * @returns 余额金额
   */
  async getBalance(): Promise<number> {
    try {
      const url = this.buildUrl('getBalance')
      const response = await this.client.get(url)
      
      if (response.data.startsWith('ACCESS_BALANCE:')) {
        const balance = parseFloat(response.data.split(':')[1])
        this.logApi('getBalance', url, {}, { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data }, true)
        return balance
      }
      
      const err = `获取余额失败: ${response.data}`
      this.logApi('getBalance', url, {}, { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data }, false)
      throw new Error(err)
    } catch (error) {
      console.error('获取余额错误:', error)
      try {
        const err: any = error
        const resp = err?.response
        const payload = resp ? { status: resp.status, statusText: resp.statusText, headers: resp.headers, data: resp.data } : { error: String(err?.message || error) }
        this.logApi('getBalance', this.buildUrl('getBalance'), {}, payload, false)
      } catch {}
      throw error
    }
  }

  /**
   * 获取可用的服务数量和价格
   * @param service 服务代码 (例如: 'tinder' 对应 Tinder)
   * @param country 国家代码 (例如: '12' 对应美国)
   * @returns 价格和数量信息
   */
  async getNumbersStatus(service: string, country: string): Promise<any> {
    try {
      const url = this.buildUrl('getNumbersStatus', {
        country,
        operator: 'any',
      })
      const response = await this.client.get(url)
      
      // 返回格式示例: {"tinder_0":{"cost":1.5,"count":100}}
      this.logApi('getNumbersStatus', url, { country, operator: 'any', service }, { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data }, true, { service, country, operator: 'any' })
      return response.data
    } catch (error) {
      console.error('获取号码状态错误:', error)
      try {
        const err: any = error
        const resp = err?.response
        const payload = resp ? { status: resp.status, statusText: resp.statusText, headers: resp.headers, data: resp.data } : { error: String(err?.message || error) }
        this.logApi('getNumbersStatus', this.buildUrl('getNumbersStatus', { country, operator: 'any' }), { country, operator: 'any', service }, payload, false, { service, country, operator: 'any' })
      } catch {}
      throw error
    }
  }

  /**
   * 获取服务列表（API 文档：getServicesList）
   */
  async getServicesList(): Promise<any> {
    const url = this.buildUrl('getServicesList')
    try {
      const response = await this.client.get(url)
      this.logApi('getServicesList', url, {}, { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data }, true)
      return response.data
    } catch (error) {
      console.error('获取服务列表错误:', error)
      try {
        const err: any = error
        const resp = err?.response
        const payload = resp ? { status: resp.status, statusText: resp.statusText, headers: resp.headers, data: resp.data } : { error: String(err?.message || error) }
        this.logApi('getServicesList', url, {}, payload, false)
      } catch {}
      throw error
    }
  }

  /**
   * 获取国家列表（API 文档：getCountries）
   */
  async getCountries(): Promise<any> {
    const url = this.buildUrl('getCountries')
    try {
      const response = await this.client.get(url)
      this.logApi('getCountries', url, {}, { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data }, true)
      return response.data
    } catch (error) {
      console.error('获取国家列表错误:', error)
      try {
        const err: any = error
        const resp = err?.response
        const payload = resp ? { status: resp.status, statusText: resp.statusText, headers: resp.headers, data: resp.data } : { error: String(err?.message || error) }
        this.logApi('getCountries', url, {}, payload, false)
      } catch {}
      throw error
    }
  }

  /**
   * 获取指定国家的可用运营商列表（API 可能为 getOperators 或在 getNumbersStatus 中体现）
   * 实现为优先请求 getOperators，不存在则回退为空数组。
   */
  async getOperators(country: string): Promise<string[]> {
    const url = this.buildUrl('getOperators', { country })
    try {
      const response = await this.client.get(url)
      this.logApi('getOperators', url, { country }, { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data }, true)
      // 预期返回数组或对象；统一转成字符串数组
      const data = response.data
      if (Array.isArray(data)) return data.map(String)
      if (data && typeof data === 'object') return Object.keys(data)
      return []
    } catch (error) {
      // 不一定每个端点都支持 getOperators，失败时返回空数组
      console.warn('获取运营商列表失败，返回空列表:', error)
      try {
        const err: any = error
        const resp = err?.response
        const payload = resp ? { status: resp.status, statusText: resp.statusText, headers: resp.headers, data: resp.data } : { error: String(err?.message || error) }
        this.logApi('getOperators', url, { country }, payload, false)
      } catch {}
      return []
    }
  }

  /**
   * 请求号码
   * @param service 服务代码
   * @param country 国家代码
   * @param operator 运营商代码 (可选, 默认 'any')
   * @returns 激活信息
   */
  async getNumber(
    service: string, 
    country: string, 
    operator: string = 'any'
  ): Promise<ActivationInfo> {
    try {
      const url = this.buildUrl('getNumber', {
        service,
        country,
        operator,
      })
      const response = await this.client.get(url)
      
      // 返回格式: ACCESS_NUMBER:activationId:phoneNumber
      if (response.data.startsWith('ACCESS_NUMBER:')) {
        const parts = response.data.split(':')
        this.logApi('getNumber', url, { service, country, operator }, { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data }, true, { service, country, operator, activation_id: parts[1] })
        return {
          activationId: parts[1],
          phoneNumber: parts[2],
        }
      }
      
      const err = `请求号码失败: ${response.data}`
      this.logApi('getNumber', url, { service, country, operator }, { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data }, false, { service, country, operator })
      throw new Error(err)
    } catch (error) {
      console.error('请求号码错误:', error)
      try {
        const err: any = error
        const resp = err?.response
        const payload = resp ? { status: resp.status, statusText: resp.statusText, headers: resp.headers, data: resp.data } : { error: String(err?.message || error) }
        this.logApi('getNumber', this.buildUrl('getNumber', { service, country, operator }), { service, country, operator }, payload, false, { service, country, operator })
      } catch {}
      throw error
    }
  }

  /**
   * 使用 API v2 获取号码
   * @param service 服务代码
   * @param country 国家代码
   * @param operatorsCsv 运营商列表，逗号分隔（例如："tmobile,att"），可空
   * @param options 其他可选参数：maxPrice, ref
   */
  async getNumberV2(
    service: string,
    country: string,
    operatorsCsv?: string,
    options?: { maxPrice?: number; ref?: string }
  ): Promise<ActivationInfo & { operator?: string; price?: number }> {
    const params: Record<string, string> = { service, country }
    if (operatorsCsv && operatorsCsv.trim()) params.operator = operatorsCsv
    if (options?.maxPrice != null) params.maxPrice = String(options.maxPrice)
    if (options?.ref) params.ref = options.ref

    const url = this.buildUrl('getNumberV2', params)
    try {
      const response = await this.client.get(url)
      const raw = response.data
      
      // JSON 响应优先
      if (raw && typeof raw === 'object') {
        const data: any = raw
        const activationId = data.activationId || data.activation_id || data.id || data.activation
        const phoneNumber = data.phoneNumber || data.phone_number || data.number || data.phone
        if (activationId && phoneNumber) {
          const result = { activationId: String(activationId), phoneNumber: String(phoneNumber), operator: data.operator, price: data.price ?? data.cost }
          this.logApi('getNumberV2', url, params, { status: response.status, statusText: response.statusText, headers: response.headers, data: raw }, true, { service, country, operator: data.operator, activation_id: result.activationId })
          return result
        }
        // 未能解析出必要字段则视为失败
        this.logApi('getNumberV2', url, params, { status: response.status, statusText: response.statusText, headers: response.headers, data: raw }, false, { service, country })
        throw new Error('getNumberV2 响应不包含必要字段')
      }

      // 兼容字符串响应（例如 ACCESS_NUMBER:...）
      if (typeof raw === 'string' && raw.startsWith('ACCESS_NUMBER:')) {
        const parts = raw.split(':')
        const result = { activationId: parts[1], phoneNumber: parts[2] }
        this.logApi('getNumberV2', url, params, { status: response.status, statusText: response.statusText, headers: response.headers, data: raw }, true, { service, country, activation_id: result.activationId })
        return result
      }

      // 其他字符串内容按错误处理
      const err = `getNumberV2 失败: ${String(raw)}`
      this.logApi('getNumberV2', url, params, { status: response.status, statusText: response.statusText, headers: response.headers, data: raw }, false, { service, country })
      throw new Error(err)
    } catch (error) {
      console.error('请求号码(v2)错误:', error)
      try {
        const err: any = error
        const resp = err?.response
        const payload = resp ? { status: resp.status, statusText: resp.statusText, headers: resp.headers, data: resp.data } : { error: String(err?.message || error) }
        this.logApi('getNumberV2', url, params, payload, false, { service, country })
      } catch {}
      throw error
    }
  }

  /**
   * 设置激活状态
   * @param activationId 激活ID
   * @param status 状态码
   * @returns 响应信息
   */
  async setStatus(activationId: string, status: number): Promise<string> {
    try {
      const url = this.buildUrl('setStatus', {
        id: activationId,
        status: status.toString(),
      })
      const response = await this.client.get(url)
      this.logApi('setStatus', url, { id: activationId, status }, { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data }, true, { activation_id: activationId })
      return response.data
    } catch (error) {
      console.error('设置状态错误:', error)
      try {
        const err: any = error
        const resp = err?.response
        const payload = resp ? { status: resp.status, statusText: resp.statusText, headers: resp.headers, data: resp.data } : { error: String(err?.message || error) }
        this.logApi('setStatus', this.buildUrl('setStatus', { id: activationId, status: status.toString() }), { id: activationId, status }, payload, false, { activation_id: activationId })
      } catch {}
      throw error
    }
  }

  /**
   * 获取短信验证码
   * @param activationId 激活ID
   * @returns 短信内容或状态
   */
  async getStatus(activationId: string): Promise<SmsStatus> {
    try {
      const url = this.buildUrl('getStatus', {
        id: activationId,
      })
      const response = await this.client.get(url)
      
      const data = response.data as string
      
      // STATUS_WAIT_CODE: 等待短信
      if (data === 'STATUS_WAIT_CODE') {
        this.logApi('getStatus', url, { id: activationId }, { status: response.status, statusText: response.statusText, headers: response.headers, data }, true, { activation_id: activationId })
        return { status: 'waiting', message: null }
      }
      
      // STATUS_OK:code - 收到短信
      if (data.startsWith('STATUS_OK:')) {
        const code = data.split(':')[1]
        this.logApi('getStatus', url, { id: activationId }, { status: response.status, statusText: response.statusText, headers: response.headers, data }, true, { activation_id: activationId })
        return { status: 'received', message: code }
      }
      
      // STATUS_CANCEL - 已取消
      if (data === 'STATUS_CANCEL') {
        this.logApi('getStatus', url, { id: activationId }, { status: response.status, statusText: response.statusText, headers: response.headers, data }, true, { activation_id: activationId })
        return { status: 'cancelled', message: null }
      }
      
      this.logApi('getStatus', url, { id: activationId }, { status: response.status, statusText: response.statusText, headers: response.headers, data }, false, { activation_id: activationId })
      return { status: 'unknown', message: data }
    } catch (error) {
      console.error('获取状态错误:', error)
      try {
        const err: any = error
        const resp = err?.response
        const payload = resp ? { status: resp.status, statusText: resp.statusText, headers: resp.headers, data: resp.data } : { error: String(err?.message || error) }
        this.logApi('getStatus', this.buildUrl('getStatus', { id: activationId }), { id: activationId }, payload, false, { activation_id: activationId })
      } catch {}
      throw error
    }
  }

  /**
   * 取消激活（释放号码）
   * @param activationId 激活ID
   * @returns 响应信息
   */
  async cancelActivation(activationId: string): Promise<string> {
    return this.setStatus(activationId, 8) // 8 = 取消激活
  }

  /**
   * 完成激活
   * @param activationId 激活ID
   * @returns 响应信息
   */
  async finishActivation(activationId: string): Promise<string> {
    return this.setStatus(activationId, 6) // 6 = 完成激活
  }

  /**
   * 请求重新发送短信
   * @param activationId 激活ID
   * @returns 响应信息
   */
  async requestOneMoreSms(activationId: string): Promise<string> {
    return this.setStatus(activationId, 3) // 3 = 请求重新发送
  }
}

/**
 * 激活信息接口
 */
export interface ActivationInfo {
  activationId: string
  phoneNumber: string
}

/**
 * 短信状态接口
 */
export interface SmsStatus {
  status: 'waiting' | 'received' | 'cancelled' | 'unknown'
  message: string | null
}

/**
 * 服务代码映射
 */
export const SERVICE_CODES: Record<string, string> = {
  'tinder': 'oi', // Tinder 正确的服务代码
  'telegram': 'tg',
  'whatsapp': 'wa',
  'google': 'go',
  'facebook': 'fb',
  'instagram': 'ig',
  'twitter': 'tw',
}

/**
 * 国家代码映射
 */
export const COUNTRY_CODES: Record<string, string> = {
  'USA': '187',
  'Russia': '0',
  'Ukraine': '1',
  'Kazakhstan': '2',
  'China': '3',
  'Philippines': '4',
  'Myanmar': '5',
  'Indonesia': '6',
  'Malaysia': '7',
  'Kenya': '8',
  'Tanzania': '9',
  'Vietnam': '10',
  'Kyrgyzstan': '11',
}

/**
 * 运营商代码映射（包含常见别名）
 * - 一些兼容端点将 AT&T 表示为 `att`，因此将 `at_t` 归一至 `att`
 */
export const OPERATOR_CODES: Record<string, string> = {
  // 标准与别名
  'any': 'any',
  'tmobile': 'tmobile',
  'att': 'att',
  'at_t': 'att',
  // 常见其他运营商（可按需扩展）
  'verizon': 'verizon',
  'sprint': 'sprint',
}
