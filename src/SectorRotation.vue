<script setup>
/**
 * 旧版板块轮动页（无 DB 时也可用）。App 当前使用 components/SectorRotation.vue。
 * 已对齐 CLS 接口：getTradingDays + 当天不读 DB 直接请求 / 非当天先读 DB。
 */
import { ref, onMounted } from 'vue'
import { initDB, getPlateData, extractAndSaveAllData } from './utils/db.js'
import { getTradingDays, getClsSignature, fetchPlateUpDownAnalysis, getTodayYYYYMMDD } from './utils/clsApi.js'

const loading = ref(true)
const error = ref(null)
const dateData = ref([]) // array of { date: 'YYYYMMDD', plates: [{ name, change }] }

const formatPct = (v) => {
  if (v === null || v === undefined) return '--'
  return (v * 100).toFixed(2) + '%'
}

const formatDisplayDate = (yyyymmdd) => {
  return `${yyyymmdd.slice(4,6)}-${yyyymmdd.slice(6)}`
}

// deterministic color generator for plate names
const nameColorCache = {}
const hashCode = (str) => {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

const hsl = (h, s, l) => `hsl(${h} ${s}% ${l}%)`

// Fixed, distinct palette to ensure consistent and distinguishable plate colors
const PALETTE = [
  { bg: hsl(6, 85, 92), border: hsl(6,85,42), text: '#4b1a1a' },
  { bg: hsl(18, 85, 92), border: hsl(18,85,42), text: '#4a2b03' },
  { bg: hsl(48, 85, 92), border: hsl(48,85,40), text: '#3b2e03' },
  { bg: hsl(120, 60, 92), border: hsl(120,60,38), text: '#0f3b2d' },
  { bg: hsl(160, 60, 92), border: hsl(160,60,38), text: '#0a3b34' },
  { bg: hsl(190, 80, 92), border: hsl(190,80,38), text: '#07323b' },
  { bg: hsl(220, 80, 92), border: hsl(220,80,38), text: '#072246' },
  { bg: hsl(250, 70, 90), border: hsl(250,70,40), text: '#1e114a' },
  { bg: hsl(285, 70, 90), border: hsl(285,70,40), text: '#391344' },
  { bg: hsl(320, 75, 92), border: hsl(320,75,40), text: '#44102b' },
  { bg: hsl(345, 75, 92), border: hsl(345,75,40), text: '#4a0f18' },
  { bg: hsl(30, 60, 92), border: hsl(30,60,40), text: '#3b2b12' }
]

const getPaletteColor = (name) => {
  if (!name) return { bgLight: hsl(0, 0, 96), text: '#0f1724', border: 'rgba(15,23,36,0.06)' }
  const idx = hashCode(name) % PALETTE.length
  const p = PALETTE[idx]
  return { bgLight: p.bg, text: p.text, border: p.border }
} 

// Discrete bucket colors from pale blue → light blue → stronger blue → warm orange
const FREQUENCY_BUCKETS = [
  '#F0F8FF', // very pale blue
  '#CFEFFF',
  '#9FD9FF',
  '#5FB8FF',
  '#FF8A00'  // warm orange for highest frequency
]

const hexToRgb = (hex) => {
  const h = hex.replace('#','')
  return [parseInt(h.substring(0,2),16), parseInt(h.substring(2,4),16), parseInt(h.substring(4,6),16)]
}

const darkenHex = (hex, amt) => {
  const [r,g,b] = hexToRgb(hex)
  const nr = Math.max(0, r - amt)
  const ng = Math.max(0, g - amt)
  const nb = Math.max(0, b - amt)
  return '#' + [nr,ng,nb].map(x => x.toString(16).padStart(2,'0')).join('').toUpperCase()
}


const getPrevDate = (d) => {
  const dt = new Date(d)
  dt.setDate(dt.getDate() - 1)
  return dt
}

// Robust extraction for number of up-limit (涨停) stocks for a plate
const extractLimitCount = (p) => {
  if (!p) return undefined

  // check a bunch of common numeric fields first
  const numericFields = [
    'up_limit_count','up_limit_cnt','up_cnt','up_count','limit_count','limit_cnt','limit_total','limit','upCount','ztCount','zt_cnt','up_num'
  ]
  for (const k of numericFields) {
    if (k in p) {
      const v = p[k]
      const n = Number(v)
      if (!Number.isNaN(n)) return n
    }
  }

  // check nested fields that sometimes appear
  if (p.summary && typeof p.summary === 'object') {
    for (const k of numericFields) {
      if (k in p.summary) {
        const n = Number(p.summary[k])
        if (!Number.isNaN(n)) return n
      }
    }
  }

  // try to infer from lists of stocks (stock_list / stocks / stockList)
  const list = p.stock_list ?? p.stocks ?? p.stockList ?? p.stocks_list
  if (Array.isArray(list) && list.length > 0) {
    let count = 0
    for (const s of list) {
      if (!s) continue
      // direct flags
      if (s.limit === 1 || s.is_limit === true || s.up_limit === 1 || s.zdt === 1 || s.isZt === true) { count++; continue }

      // percent / change heuristics: many APIs report percent as a number (10 or 0.10) or a string '10.00%'
      const pctRaw = s.pct ?? s.pctChg ?? s.change_pct ?? s.changePercent ?? s.change ?? s.chg ?? s.increment ?? s.inc
      let pctNum
      if (typeof pctRaw === 'string') {
        const m = pctRaw.match(/-?[0-9]+\.?[0-9]*/)
        if (m) pctNum = parseFloat(m[0])
      } else if (typeof pctRaw === 'number') {
        pctNum = pctRaw
      }
      if (pctNum !== undefined) {
        // normalize: if pctNum > 3 it's probably in percent units (e.g., 10), convert to decimal
        if (Math.abs(pctNum) > 3) pctNum = pctNum / 100
        if (pctNum >= 0.089) { count++; continue }
      }
    }
    if (count > 0) return count
  }

  // If we reach here, we couldn't detect a count. Log a single sample of keys to help debugging (one-time per session).
  if (!extractLimitCount._warned) {
    try {
      console.warn('SectorRotation: could not detect limitCount fields for plate example, keys:', Object.keys(p).slice(0, 20))
    } catch (e) {}
    extractLimitCount._warned = true
  }

  return undefined
}

// name frequency tracking
import { computed } from 'vue'
const nameCounts = ref({})
const nameStats = ref({}) // { name: { total, up, down } }
const maxCount = ref(1)

const computeNameCounts = () => {
  const counts = {}
  const stats = {}
  const threshold = 0.01 // only count days where change > 1% (or < -1% for down)

  dateData.value.forEach(d => {
    d.plates.forEach(p => {
      const isUp = p.change > threshold
      const isDown = p.change < -threshold

      // frequency counts only consider meaningful moves (up > 1%)
      if (isUp) {
        counts[p.name] = (counts[p.name] || 0) + 1
      }

      if (!stats[p.name]) stats[p.name] = { total: 0, up: 0, down: 0 }
      if (isUp || isDown) {
        stats[p.name].total++
      }
      if (isUp) stats[p.name].up++
      else if (isDown) stats[p.name].down++
    })
  })

  nameCounts.value = counts
  nameStats.value = stats
  const vals = Object.values(counts)
  maxCount.value = vals.length ? Math.max(...vals) : 1
}

const getColorByFrequency = (name) => {
  // Continuous Blue -> White -> Orange mapping (two-stage)
  const c = nameCounts.value[name] || 0
  // frequency 0 -> neutral light gray background
  if (!c) {
    return { bg: '#808080', text: '#6B7280', border: '#E5E7EB', ratio: 0 }
  }

  const minOcc = 1
  const denom = Math.max(1, maxCount.value - minOcc)
  const rNorm = denom === 0 ? 0 : ((c - minOcc) / denom) // 0..1
  const r = Math.max(0, Math.min(1, rNorm))

  const START = '#5FB8FF' // blue
  const MID = '#FFFFFF'   // white
  const END = '#FF8A00'   // orange

  const [sr, sg, sb] = hexToRgb(START)
  const [mr, mg, mb] = hexToRgb(MID)
  const [er, eg, eb] = hexToRgb(END)

  const lerp = (a, b, t) => Math.round(a + (b - a) * t)
  let rr, rg, rb
  if (r <= 0.5) {
    const t = r / 0.5
    rr = lerp(sr, mr, t)
    rg = lerp(sg, mg, t)
    rb = lerp(sb, mb, t)
  } else {
    const t = (r - 0.5) / 0.5
    rr = lerp(mr, er, t)
    rg = lerp(mg, eg, t)
    rb = lerp(mb, eb, t)
  }

  const bg = '#' + [rr, rg, rb].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase()
  const border = darkenHex(bg, 30)
  const luminance = 0.2126 * rr + 0.7152 * rg + 0.0722 * rb
  const text = luminance > 180 ? '#000000' : '#FFFFFF'
  return { bg, text, border, ratio: r }
} 

function pushSectorDay(apiDate, plateData, plateStats = {}) {
  const plates = plateData
    .filter(p => p.secu_name && !p.secu_name.startsWith('ST') && !p.secu_name.startsWith('*ST') && !p.secu_name.includes('其他'))
    .map(p => ({ name: p.secu_name, change: p.change, raw: p }))
    .sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity))
  if (plates.length === 0) return
  const normalized = plates.map(p => ({
    name: p.name,
    change: p.change,
    limitCount: plateStats[p.name]?.plate_stock_up_num ?? extractLimitCount(p.raw)
  }))
  dateData.value.push({ date: apiDate, plates: normalized })
}

const fetchForSevenValidDates = async () => {
  loading.value = true
  error.value = null
  dateData.value = []

  try {
    await initDB()
  } catch (e) {
    console.error('数据库初始化失败:', e)
    error.value = '数据库初始化失败'
    loading.value = false
    return
  }

  const todayStr = getTodayYYYYMMDD()
  let dateList = []

  try {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 30)
    dateList = (await getTradingDays(start.toISOString().split('T')[0], end.toISOString().split('T')[0])).slice(0, 7)
  } catch (e) {
    console.warn('getTradingDays 失败，回退到本地推算', e)
    let dt = new Date()
    let attempts = 0
    while (dateList.length < 7 && attempts < 40) {
      const day = dt.getDay()
      if (day !== 0 && day !== 6) dateList.push(dt.toISOString().split('T')[0].replace(/-/g, ''))
      dt = getPrevDate(dt)
      attempts++
    }
  }

  const needFetchDates = []

  for (const apiDate of dateList) {
    const isToday = apiDate === todayStr
    let plateData = null
    let plateStats = {}

    if (!isToday) {
      try {
        const r = await getPlateData(apiDate)
        if (r?.plateData?.length > 0) {
          plateData = r.plateData
          plateStats = r.stats || {}
        }
      } catch (e) {
        console.warn('从本地数据库查询失败', apiDate, e)
      }
    }

    if (plateData?.length > 0) {
      pushSectorDay(apiDate, plateData, plateStats)
    } else {
      needFetchDates.push(apiDate)
    }
  }

  if (needFetchDates.length > 0) {
    let signature = null
    try {
      signature = await getClsSignature(`https://x-quote.cls.cn/v2/quote/a/plate/up_down_analysis?up_limit=1&date=${needFetchDates[0]}`)
    } catch (e) {
      console.warn('获取签名失败', e)
      error.value = '获取签名失败'
    }
    for (const apiDate of needFetchDates) {
      if (!signature) continue
      try {
        const json = await fetchPlateUpDownAnalysis({ date: apiDate, upLimit: 1, signature })
        if (json?.data?.plate_stock?.length > 0) {
          await extractAndSaveAllData(apiDate, json)
          const updated = await getPlateData(apiDate)
          const plateData = updated?.plateData || json.data.plate_stock
          const plateStats = updated?.stats || {}
          pushSectorDay(apiDate, plateData, plateStats)
        }
      } catch (e) {
        console.warn('网络请求失败', apiDate, e)
      }
    }
  }

  dateData.value.sort((a, b) => b.date.localeCompare(a.date))
  computeNameCounts()
  loading.value = false
}

onMounted(() => {
  fetchForSevenValidDates()
})
</script>

<template>
  <div class="sector-rotation-page">
    <h2 class="page-title">板块轮动（近 7 个交易日）</h2>
    <p class="subtle-note">提示：频率统计仅计入单日涨幅大于 1% 的出现次数</p>

    <div v-if="loading" class="loading">正在加载板块数据…</div>
    <div v-else>
      <div v-if="dateData.length === 0" class="empty">未找到板块数据</div>

      <div v-else class="grid-wrap">
        <div class="day-column" v-for="(d, idx) in dateData" :key="d.date">
          <div class="day-header">{{ formatDisplayDate(d.date) }}</div>
          <ol class="plate-list">
            <li v-for="(p, i) in d.plates.slice(0, 30)" :key="p.name + '_' + i" class="plate-item"
                :data-bucket="getColorByFrequency(p.name).bucket"
                :class="{ 'top-1': i === 0, 'top-2': i === 1, 'top-3': i === 2 }"
                :style="{ '--bg-light': getColorByFrequency(p.name).bg, '--name-text': getPaletteColor(p.name).text, '--border-color': getColorByFrequency(p.name).border }">

              <!-- frequency badge (right-top) shows occurrence count; outlined by freq color -->
              <span class="freq-badge" v-if="nameCounts[p.name]" :style="{ border: '1px solid ' + getColorByFrequency(p.name).border, color: getColorByFrequency(p.name).text, background: 'transparent' }">{{ nameCounts[p.name] }}</span>

              <div class="pname">{{ p.name }}</div>
              <div class="pchg" :style="{ color: p.change > 0 ? '#e63946' : (p.change < 0 ? '#16a34a' : '#6b7280') }">{{ formatPct(p.change) }}</div>

              <div class="counts" v-if="nameStats[p.name]">
                <span class="up">↑{{ nameStats[p.name].up }}</span>
                <span class="down">↓{{ nameStats[p.name].down }}</span>
              </div>

              <div class="limit-count" v-if="p.limitCount !== undefined && p.limitCount !== null">
                <span class="limit-label">涨停</span>
                <span class="limit-num">{{ p.limitCount }}</span>
              </div> 
            </li>
          </ol>
        </div> 
      </div>
    </div>
  </div>
</template>

<style scoped>
.sector-rotation-page {
  padding: 100px 20px 40px 20px; /* add top space so title not overlapped */
  min-height: 100vh;
  background: #f5f7fb;
  color: #1f2937; /* ensure readable text */
}
.page-title {
  margin: 0 0 20px 0;
  font-size: 1.6rem;
  font-weight: 700;
  color: #000000; /* title forced to pure black */
  text-align: center;
  text-shadow: 0 1px 0 rgba(255,255,255,0.6);
}

.loading, .empty { padding: 40px; color: #4b5563; }
.subtle-note { text-align: center; color: #6b7280; margin: 6px 0 12px; font-size: 0.92rem; }
.grid-wrap {
  display: flex;
  gap: 0; /* remove column gap */
  overflow-x: auto;
  align-items: flex-start;
  padding-bottom: 10px;
}
.day-column {
  min-width: 160px; /* narrower columns */
  max-width: 180px;
  background: rgba(255,255,255,0.95);
  border-radius: 8px;
  padding: 0; /* let rows touch container edges so it feels like a sheet */
  box-shadow: none; /* reduce column prominence */
  border: 1px solid rgba(15,23,36,0.04);
  text-align: left; /* table-like alignment */
  overflow: hidden; /* clip inner square cells to rounded column corners */
} 
.day-header {
  font-weight: 600;
  margin-bottom: 8px;
  color: #475569; /* slightly lighter */
  text-align: center;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(15,23,36,0.04);
} 
.plate-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.plate-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  margin: 0; /* rows sit flush */
  background: var(--bg-light, rgba(255,255,255,0.95)); /* palette-based cell bg */
  color: var(--name-text, #0f1724);
  border-radius: 0; /* square cells */
  border-bottom: 1px solid rgba(15,23,36,0.06);
  text-align: center;
} 

.plate-item:hover { /* no hover transform */ }
.plate-item:last-child { border-bottom: none; }
/* use CSS variables for per-name backgrounds; fallback to striping above */
/* badge styles: small outlined pill in the top-right shows occurrence count */
.freq-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.72rem;
  background: transparent; /* show as outlined ring */
}

/* removed small top-badge per user request */ 

.top-1 { border-left: 4px solid #F59E0B; }
.top-2 { border-left: 4px solid #94A3B8; }
.top-3 { border-left: 4px solid #CD7F32; }

.freq-badge { font-weight: 700; text-shadow: 0 0 0.5px rgba(0,0,0,0.12); }

.pname { display: block; padding: 0; font-weight: 700; color: #000000; text-align: center; font-size: 0.98rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; width: 100%; }
.pchg { font-weight: 700; text-align: center; font-size: 0.95rem; width: 100%; margin-top: 4px; } /* change color follows plate color */

/* bucket-based visual emphasis */
.plate-item[data-bucket="2"] { box-shadow: 0 1px 4px rgba(96,165,250,0.04); }
.plate-item[data-bucket="3"] { box-shadow: 0 1px 6px rgba(250,200,120,0.06); }
.plate-item[data-bucket="4"] { box-shadow: 0 2px 10px rgba(255,160,0,0.12); transform: translateY(-1px); border-left: 3px solid rgba(255,165,0,0.2); }

.counts { margin-top: 6px; font-size: 0.78rem; color: #374151; display: flex; gap: 8px; justify-content: center; }
.counts .up { color: #e63946; font-weight: 700; }
.counts .down { color: #16a34a; font-weight: 700; }

.limit-count { margin-top: 6px; font-size: 0.78rem; color: #374151; display:flex; gap:6px; justify-content:center; align-items:center }
.limit-count .limit-label { color: #6b7280 }
.limit-count .limit-num { font-weight: 700; color: #111827 }

/* dark mode support */

</style>
