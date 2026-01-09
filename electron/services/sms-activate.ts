// SMS-Activate API 服务模块
import axios, { AxiosInstance } from 'axios'

/**
 * SMS-Activate API 客户端
 */
export class SmsActivateService {
  private apiKey: string
  private client: AxiosInstance
  private baseURL = 'https://api.sms-activate.org/stubs/handler_api.php'

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.client = axios.create({
      timeout: 30000,
    })
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
        return balance
      }
      
      throw new Error(`获取余额失败: ${response.data}`)
    } catch (error) {
      console.error('获取余额错误:', error)
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
      return response.data
    } catch (error) {
      console.error('获取号码状态错误:', error)
      throw error
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
        return {
          activationId: parts[1],
          phoneNumber: parts[2],
        }
      }
      
      throw new Error(`请求号码失败: ${response.data}`)
    } catch (error) {
      console.error('请求号码错误:', error)
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
      return response.data
    } catch (error) {
      console.error('设置状态错误:', error)
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
        return { status: 'waiting', message: null }
      }
      
      // STATUS_OK:code - 收到短信
      if (data.startsWith('STATUS_OK:')) {
        const code = data.split(':')[1]
        return { status: 'received', message: code }
      }
      
      // STATUS_CANCEL - 已取消
      if (data === 'STATUS_CANCEL') {
        return { status: 'cancelled', message: null }
      }
      
      return { status: 'unknown', message: data }
    } catch (error) {
      console.error('获取状态错误:', error)
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
  'tinder': 'ot', // Tinder 对应的服务代码
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
  'USA': '12',
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
