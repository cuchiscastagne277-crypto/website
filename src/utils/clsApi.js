/**
 * CLS 接口统一请求层
 * - getClsSignature: 从 SDK 获取签名
 * - getTradingDays: 获取区间内交易日（YYYYMMDD）
 * - fetchPlateUpDownAnalysis: 带 sign 请求板块涨跌分析
 */

const CORS_PROXY = 'https://corsproxy.io/?'

function withProxy(url) {
  return CORS_PROXY + encodeURIComponent(url)
}

const signatureCache = new Map() // url -> { signature, time }
const SIGNATURE_CACHE_MS = 5 * 60 * 1000

/**
 * 获取 CLS 签名
 * @param {string} [targetRequestUrl] - 可选，要请求的完整 URL（若后端按 URL 校验则传 up_down_analysis 的完整 URL）
 * @returns {Promise<string>} signature
 */
export async function getClsSignature(targetRequestUrl) {
  const urlToSign = targetRequestUrl || 'https://api3.cls.cn/share/quote/analysis?os=ios&sv=8.6.9'
  const cached = signatureCache.get(urlToSign)
  if (cached && Date.now() - cached.time < SIGNATURE_CACHE_MS) {
    return cached.signature
  }
  const sdkUrl = `https://api3.cls.cn/v2/js/sdk/cls?url=${encodeURIComponent(urlToSign)}`
  const res = await fetch(withProxy(sdkUrl))
  const json = await res.json()
  if (json.errno !== 0 || !json.data?.signature) {
    throw new Error(json.msg || '获取签名失败')
  }
  signatureCache.set(urlToSign, { signature: json.data.signature, time: Date.now() })
  return json.data.signature
}

/**
 * 获取区间内交易日
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<string[]>} YYYYMMDD 数组
 */
export async function getTradingDays(startDate, endDate) {
  const url = `https://x-quote.cls.cn/v2/quote/a/stock/range_trading_days?start_date=${startDate}&end_date=${endDate}`
  const res = await fetch(withProxy(url))
  const json = await res.json()
  if (json.code !== 200 || !Array.isArray(json.data)) {
    throw new Error(json.msg || '获取交易日失败')
  }
  return json.data.map((d) => d.replace(/-/g, ''))
}

/**
 * 请求板块涨跌分析（带 sign）
 * @param {{ date: string, upLimit: number, signature: string }} options - date: YYYYMMDD, upLimit: 0|1
 * @returns {Promise<{ code: number, data: { plate_stock: any[], continuous_limit_up?: any[] } }>}
 */
export async function fetchPlateUpDownAnalysis({ date, upLimit, signature }) {
  const url = `https://x-quote.cls.cn/v2/quote/a/plate/up_down_analysis?up_limit=${upLimit}&date=${date}&sign=${signature}`
  const res = await fetch(withProxy(url))
  const json = await res.json()
  if (json.code !== 200) {
    throw new Error(json.msg || '请求板块数据失败')
  }
  return json
}

/**
 * 返回当天 YYYYMMDD（本地日期）
 */
export function getTodayYYYYMMDD() {
  const now = new Date()
  return now.toISOString().split('T')[0].replace(/-/g, '')
}
