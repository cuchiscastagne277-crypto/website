<script setup>
import { ref, onMounted, watch } from 'vue'

const stockData = ref([])
const ladderData = ref([])
const loading = ref(true)
const error = ref(null)
const isFromCache = ref(false)

// Feature Restoration: Date and Filter
const getTodayStr = () => {
  const now = new Date()
  return now.toISOString().split('T')[0] // YYYY-MM-DD
}

const selectedDate = ref(getTodayStr())
const limitUpOnly = ref(true)

const fetchStocks = async () => {
  try {
    loading.value = true
    error.value = null
    
    // Format date for API (YYYYMMDD)
    const apiDate = selectedDate.value.replace(/-/g, '')
    const upLimit = limitUpOnly.value ? 1 : 0
    
    const targetUrl = `https://x-quote.cls.cn/v2/quote/a/plate/up_down_analysis?up_limit=${upLimit}&date=${apiDate}`
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
    
    // Cache Key
    const cacheKey = `STOCK_CACHE_${apiDate}_${upLimit}`
    
    try {
      const res = await fetch(proxyUrl)
      const json = await res.json()
      if (json.code === 200) {
        stockData.value = json.data.plate_stock
        ladderData.value = json.data.continuous_limit_up || []
        isFromCache.value = false
        
        // Save to cache
        localStorage.setItem(cacheKey, JSON.stringify({
          plate_stock: json.data.plate_stock,
          continuous_limit_up: json.data.continuous_limit_up,
          timestamp: Date.now()
        }))
      } else {
        throw new Error('Data format error')
      }
    } catch (apiErr) {
      console.warn('API fetch failed, trying cache...', apiErr)
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        stockData.value = parsed.plate_stock
        ladderData.value = parsed.continuous_limit_up || []
        isFromCache.value = true
        error.value = null // Clear error if we have cache
      } else {
        error.value = '网络请求错误，且无缓存数据'
        throw apiErr
      }
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const formatCode = (code) => {
  if (!code) return ''
  const market = code.substring(0, 2)
  const num = code.substring(2)
  return `${num}.${market}`
}

const formatCmc = (cmc) => {
  if (!cmc) return '--'
  return (cmc / 100000000).toFixed(2) + '亿'
}

const formatTime = (time) => {
  if (!time) return '--'
  return time.split(' ')[1]
}

// Sorting and Expansion logic
const sortConfig = ref({
  key: null, // 'last_px', 'change', 'time', 'cmc'
  order: 'desc' // 'asc', 'desc'
})

const expandedStocks = ref(new Set())

const toggleSort = (key) => {
  if (sortConfig.value.key === key) {
    sortConfig.value.order = sortConfig.value.order === 'desc' ? 'asc' : 'desc'
  } else {
    sortConfig.value.key = key
    sortConfig.value.order = 'desc'
  }
}

const toggleExpand = (code) => {
  if (expandedStocks.value.has(code)) {
    expandedStocks.value.delete(code)
  } else {
    expandedStocks.value.add(code)
  }
}

const copyStatus = ref('')
const copyAllStocks = () => {
  if (!stockData.value || stockData.value.length === 0) return
  
  const allNames = []
  stockData.value.forEach(plate => {
    if (plate.stock_list) {
      plate.stock_list.forEach(stock => {
        allNames.push(stock.secu_name)
      })
    }
  })
  
  const textToCopy = allNames.join('    ')
  navigator.clipboard.writeText(textToCopy).then(() => {
    copyStatus.value = '已复制股票列表'
    setTimeout(() => {
      copyStatus.value = ''
    }, 2000)
  }).catch(err => {
    console.error('Copy failed: ', err)
    copyStatus.value = '复制失败'
  })
}

const getSortedStocks = (stocks) => {
  if (!sortConfig.value.key) return stocks
  
  return [...stocks].sort((a, b) => {
    let valA = a[sortConfig.value.key]
    let valB = b[sortConfig.value.key]
    
    // Sort logic
    if (sortConfig.value.order === 'asc') {
      return valA > valB ? 1 : -1
    } else {
      return valA < valB ? 1 : -1
    }
  })
}

// Re-fetch data when inputs change
watch([selectedDate, limitUpOnly], () => {
  fetchStocks()
})

// Copy logic per plate
const copyPlateStatus = ref({}) // map of plate name -> status text
const copyPlateStocks = (plate) => {
  if (!plate || !plate.stock_list) return
  
  const names = plate.stock_list.map(s => s.secu_name).join('    ')
  navigator.clipboard.writeText(names).then(() => {
    copyPlateStatus.value[plate.secu_name] = '已复制'
    setTimeout(() => {
      delete copyPlateStatus.value[plate.secu_name]
    }, 2000)
  }).catch(err => {
    console.error('Copy failed', err)
  })
}

onMounted(() => {
  fetchStocks()
})
</script>

<template>
  <div class="stock-analysis-page">
    <!-- Tool Bar -->
    <div class="control-header">
      <div class="logo-area">
        <span class="page-title">大涨股解读</span>
      </div>
      
      <div class="controls">
        <div class="date-picker-wrapper">
          <label>选择日期:</label>
          <input type="date" v-model="selectedDate" class="date-input">
        </div>
        
        <div class="filter-wrapper">
          <label class="switch">
            <input type="checkbox" v-model="limitUpOnly">
            <span class="slider round"></span>
          </label>
          <span class="filter-label">只看涨停</span>
        </div>

        <button @click="copyAllStocks" class="copy-all-btn" :disabled="loading || !stockData.length">
          {{ copyStatus || '复制全部' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loader"></div>
      <p>正在加载实时行情...</p>
    </div>

    <div v-else-if="error" class="error-state">
      {{ error }}
      <button @click="fetchStocks" class="retry-btn">重试</button>
    </div>

    <div v-else class="content-area">
      <!-- Ladder Chart -->
      <div v-if="ladderData && ladderData.length > 0" class="ladder-section">
        <h3 class="section-title">涨停梯队图</h3>
        <div class="ladder-container">
          <div v-for="tier in ladderData" :key="tier.height" class="ladder-tier">
            <div class="tier-label">{{ tier.height }}板</div>
            <div class="tier-stocks">
              <span v-for="stock in tier.stock_list" :key="stock.secu_code" class="tier-stock-item">
                {{ stock.secu_name }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Plate List -->
      <div v-if="stockData && stockData.length > 0" class="plate-list">
        <div v-for="plate in stockData" :key="plate.secu_code" class="plate-item">
          <div class="plate-header">
            <div class="plate-title-group">
              <h2 class="plate-name">{{ plate.secu_name }}</h2>
              <div class="plate-perf" :class="{ 'up': plate.change > 0 }">
                {{ plate.change > 0 ? '+' : '' }}{{ (plate.change * 100).toFixed(2) }}%
              </div>
              <span class="plate-info">({{ plate.plate_stock_up_num }}只涨停)</span>
              <span v-if="isFromCache" class="cache-tag">缓存数据</span>
            </div>
            
            <button class="copy-all-btn plate-copy-btn" @click="copyPlateStocks(plate)">
              {{ copyPlateStatus[plate.secu_name] || '复制' }}
            </button>
          </div>
          <p class="plate-reason">{{ plate.up_reason }}</p>

          <!-- List View Table -->
          <div class="stock-list-container">
            <div class="stock-list-header">
              <div class="col-name">简称</div>
              <div class="col-code">代码</div>
              <div class="col-num">板数</div>
              <div class="col-price sortable" @click="toggleSort('last_px')" :class="{ active: sortConfig.key === 'last_px' }">
                现价 <span class="sort-icon">{{ sortConfig.key === 'last_px' ? (sortConfig.order === 'desc' ? '↓' : '↑') : '⇅' }}</span>
              </div>
              <div class="col-change sortable" @click="toggleSort('change')" :class="{ active: sortConfig.key === 'change' }">
                涨幅 <span class="sort-icon">{{ sortConfig.key === 'change' ? (sortConfig.order === 'desc' ? '↓' : '↑') : '⇅' }}</span>
              </div>
              <div class="col-time sortable" @click="toggleSort('time')" :class="{ active: sortConfig.key === 'time' }">
                涨停时间 <span class="sort-icon">{{ sortConfig.key === 'time' ? (sortConfig.order === 'desc' ? '↓' : '↑') : '⇅' }}</span>
              </div>
              <div class="col-cmc sortable" @click="toggleSort('cmc')" :class="{ active: sortConfig.key === 'cmc' }">
                流通市值 <span class="sort-icon">{{ sortConfig.key === 'cmc' ? (sortConfig.order === 'desc' ? '↓' : '↑') : '⇅' }}</span>
              </div>
            </div>
            
            <div v-for="stock in getSortedStocks(plate.stock_list)" :key="stock.secu_code" class="stock-list-item-wrapper">
              <div class="stock-list-item" @click="toggleExpand(stock.secu_code)" :class="{ expanded: expandedStocks.has(stock.secu_code) }">
                <div class="col-name">
                  <span class="expand-icon">{{ expandedStocks.has(stock.secu_code) ? '▼' : '▶' }}</span>
                  {{ stock.secu_name }}
                </div>
                <div class="col-code">{{ formatCode(stock.secu_code) }}</div>
                <div class="col-num">
                  <span class="stock-tag">{{ stock.up_num || '1天1板' }}</span>
                </div>
                <div class="col-price">{{ stock.last_px.toFixed(2) }}</div>
                <div class="col-change" :class="{ 'up': stock.change > 0 }">
                  {{ stock.change > 0 ? '+' : '' }}{{ (stock.change * 100).toFixed(2) }}%
                </div>
                <div class="col-time">{{ formatTime(stock.time) }}</div>
                <div class="col-cmc">{{ formatCmc(stock.cmc) }}</div>
              </div>
              <div v-show="expandedStocks.has(stock.secu_code)" class="stock-expanded-content">
                <div class="reason-label">涨停原因：</div>
                <div class="reason-text">{{ stock.up_reason }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div v-if="(!stockData || stockData.length === 0) && (!ladderData || ladderData.length === 0)" class="empty-state">
        <p>该日期暂无数据</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stock-analysis-page {
  width: 100%;
  min-height: 100vh;
  padding: 80px 20px 20px 20px; /* Space for sticky header */
  background-color: #f8f9fa;
  color: #333;
  box-sizing: border-box;
}

.control-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  z-index: 100;
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  height: 30px;
}

.page-title {
  font-weight: bold;
  font-size: 1.2rem;
  color: #1d3557;
}

.controls {
  display: flex;
  align-items: center;
  gap: 20px;
}

.copy-all-btn {
  background-color: #f1f3f5;
  color: #495057;
  border: 1px solid #dee2e6;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 80px;
}

.copy-all-btn:hover:not(:disabled) {
  background-color: #e9ecef;
  border-color: #ced4da;
  color: #212529;
}

.copy-all-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.copy-all-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.date-picker-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: #666;
}

.date-input {
  border: 1px solid #ddd;
  padding: 5px 10px;
  border-radius: 4px;
  outline: none;
  font-family: inherit;
}

.filter-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-label {
  font-size: 0.9rem;
  color: #666;
}

/* Switch Styling */
.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: .4s;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .4s;
}

input:checked + .slider {
  background-color: #e63946;
}

input:checked + .slider:before {
  transform: translateX(20px);
}

.slider.round {
  border-radius: 24px;
}

.slider.round:before {
  border-radius: 50%;
}

.ladder-section {
  background: #fff;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 30px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.05);
}

.section-title {
  font-size: 1.1rem;
  font-weight: bold;
  margin-bottom: 20px;
  color: #1d3557;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title::before {
  content: "";
  display: block;
  width: 4px;
  height: 18px;
  background: #e63946;
  border-radius: 2px;
}

.ladder-container {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.ladder-tier {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.ladder-tier:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.tier-label {
  min-width: 60px;
  background: #fdf2f2;
  color: #e63946;
  font-weight: bold;
  font-size: 0.9rem;
  padding: 4px 0;
  border-radius: 4px;
  text-align: center;
}

.tier-stocks {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tier-stock-item {
  font-size: 0.9rem;
  color: #333;
  padding: 4px 12px;
  background: #f8f9fa;
  border-radius: 15px;
  border: 1px solid #eee;
}

.plate-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 15px;
}

.plate-perf {
  font-weight: bold;
  font-size: 1.1rem;
  padding: 4px 12px;
  border-radius: 20px;
  background: #f8f9fa;
  color: #666;
}

.plate-perf.up {
  background: #fdf2f2;
  color: #e63946;
}

.stock-list-container {
  background: #fff;
  border-radius: 8px;
  border: 1px solid #eee;
  overflow: hidden;
  margin-bottom: 20px;
}

.stock-list-header {
  display: flex;
  background: #f8f9fa;
  border-bottom: 2px solid #eee;
  padding: 12px 15px;
  font-weight: bold;
  font-size: 0.9rem;
  color: #666;
}

.stock-list-item-wrapper {
  border-bottom: 1px solid #eee;
}

.stock-list-item-wrapper:last-child {
  border-bottom: none;
}

.stock-list-item {
  display: flex;
  padding: 12px 15px;
  font-size: 0.95rem;
  align-items: center;
  cursor: pointer;
  transition: background 0.2s;
}

.stock-list-item:hover {
  background: #fcfcfc;
}

.stock-list-item.expanded {
  background: #fdf2f2;
}

.col-name { flex: 2; font-weight: bold; color: #333; display: flex; align-items: center; gap: 6px; }
.expand-icon { font-size: 0.6rem; color: #999; transition: transform 0.2s; width: 12px; }
.col-code { flex: 1.5; color: #888; font-family: monospace; font-size: 0.85rem; }
.col-num { flex: 1.5; text-align: left; }
.col-price { flex: 1; text-align: right; font-weight: 700; }
.col-change { flex: 1.2; text-align: right; font-weight: 700; }
.col-time { flex: 1.5; text-align: right; color: #666; font-size: 0.85rem; }
.col-cmc { flex: 1.5; text-align: right; color: #666; font-size: 0.85rem; }

.sortable {
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.sortable:hover {
  color: #1d3557;
}

.sortable.active {
  color: #e63946;
}

.sort-icon {
  font-size: 0.75rem;
  opacity: 0.5;
}

.sortable.active .sort-icon {
  opacity: 1;
}

.stock-expanded-content {
  padding: 15px;
  background: #fffafa;
  border-top: 1px dashed #ffdada;
  font-size: 0.9rem;
  line-height: 1.6;
}

.reason-label {
  font-weight: bold;
  color: #e63946;
  margin-bottom: 5px;
}

.reason-text {
  color: #444;
}

.stock-change.up { color: #e63946; }

@media (prefers-color-scheme: dark) {
  .stock-list-container {
    background: #1e1e1e;
    border-color: #333;
  }
  .stock-list-header {
    background: #252525;
    border-bottom-color: #333;
    color: #999;
  }
  .stock-list-item-wrapper {
    border-bottom-color: #333;
  }
  .stock-list-item {
    color: #eee;
  }
  .stock-list-item:hover {
    background: #2a2a2a;
  }
  .stock-list-item.expanded {
    background: #3d1c1c;
  }
  .col-name { color: #fff; }
  .col-code { color: #aaa; }
  .stock-expanded-content {
    background: #251818;
    border-top-color: #4d2626;
  }
  .reason-text { color: #ddd; }
}

@media (max-width: 800px) {
  .stock-list-header .col-time,
  .stock-list-item .col-time,
  .stock-list-header .col-cmc,
  .stock-list-item .col-cmc {
    display: none;
  }
}

@media (max-width: 600px) {
  .stock-list-header .col-num,
  .stock-list-item .col-num {
    display: none;
  }
  .col-name { flex: 2; }
  .col-code { flex: 1.5; }
  .col-price { flex: 1; }
  .col-change { flex: 1.2; }
}

.loading-state, .error-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60vh;
}

.retry-btn {
  margin-top: 15px;
  padding: 8px 20px;
  background-color: #e63946;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.retry-btn:hover {
  background-color: #d62839;
}

.loader {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #e63946;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.plate-item {
  margin-bottom: 40px;
}

.plate-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.plate-name {
  font-size: 1.5rem;
  color: #1d3557;
  font-weight: bold;
  border-left: 5px solid #e63946;
  padding-left: 15px;
}

.plate-perf {
  font-weight: bold;
  font-size: 1rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f8f9fa;
  color: #666;
}

.cache-tag {
  font-size: 0.75rem;
  background: #f1f3f5;
  color: #868e96;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: normal;
  margin-left: 10px;
}

.plate-reason {
  background: #fff;
  padding: 15px;
  border-radius: 8px;
  font-size: 0.95rem;
  line-height: 1.6;
  color: #444;
  margin-bottom: 20px;
  border: 1px solid #eee;
}

@media (prefers-color-scheme: dark) {
  .stock-analysis-page {
    background-color: #121212;
    color: #e0e0e0;
  }
  .control-header {
    background: #1e1e1e;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  }
  .page-title, .plate-title {
    color: #a8dadc;
  }
  .date-input {
    background: #333;
    border-color: #444;
    color: #eee;
  }
  .plate-reason, .stock-card {
    background: #1e1e1e;
    border-color: #333;
    color: #ddd;
  }
  .stock-name { color: #fff; }
  .stock-info-row { color: #eee; }
  .stock-reason { color: #aaa; border-top-color: #333; }
  .stock-tag { background-color: #3d1c1c; color: #ff6b6b; }
  
  /* Ladder Chart Dark Mode */
  .ladder-section {
    background: #1e1e1e;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
  }
  .section-title { color: #a8dadc; }
  .ladder-tier { border-bottom-color: #333; }
  .tier-label { background: #3d1c1c; color: #ff6b6b; }
  .tier-stock-item {
    background: #2a2a2a;
    border-color: #444;
    color: #eee;
  }
}

/* Mobile adjustments */
@media (max-width: 600px) {
  .control-header {
    height: auto;
    padding: 10px 15px;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .stock-analysis-page {
    padding-top: 110px;
  }
  .controls {
    width: 100%;
    justify-content: space-between;
    gap: 10px;
  }
  .date-picker-wrapper label {
    display: none;
  }
}

.plate-copy-btn {
  font-size: 0.8rem;
  padding: 4px 12px;
  min-width: 60px;
}

@media (prefers-color-scheme: dark) {
  .plate-copy-btn {
    border-color: #555;
    background-color: #2a2a2a;
    color: #ccc;
  }
  .plate-copy-btn:hover:not(:disabled) {
    border-color: #666;
    background-color: #333;
    color: #fff;
  }
  
  .plate-name { color: #a8dadc; }
  .plate-perf { background: #333; color: #ddd; }
  .plate-perf.up { background: #3d1c1c; color: #ff6b6b; }
}
</style>
