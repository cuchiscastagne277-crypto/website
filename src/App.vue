<script setup>
import { ref } from 'vue'
import StockAnalysis from './components/StockAnalysis.vue'
import SectorRotation from './components/SectorRotation.vue'

const currentPage = ref('home')

const goToStockAnalysis = () => {
  currentPage.value = 'stock-analysis'
}

const goToSectorRotation = () => {
  currentPage.value = 'sector-rotation'
}

const goHome = () => {
  currentPage.value = 'home'
}
</script>

<template>
  <div v-if="currentPage === 'home'" class="home-page">
    <header class="header">
      <h1 class="title">股票分析工具</h1>
      <p class="subtitle">快速解读股市信息</p>
    </header>

    <main class="main-content">
      <div class="card-container">
        <div class="card" @click="goToStockAnalysis">
          <div class="card-icon">📈</div>
          <h2 class="card-title">大涨股解读</h2>
          <p class="card-description">实时分析涨停股票，掌握市场热点。查看涨停梯队图和各板块涨停个股。</p>
          <button class="card-button">进入 →</button>
        </div>
        <div class="card" @click="goToSectorRotation">
          <div class="card-icon">🔁</div>
          <h2 class="card-title">板块轮动</h2>
          <p class="card-description">近 7 个交易日内各大板块涨幅排行（去除 ST 与“其他”板块）。横向显示每日板块涨幅。</p>
          <button class="card-button">进入 →</button>
        </div>
      </div>
    </main>
  </div>

  <div v-else-if="currentPage === 'stock-analysis'">
    <StockAnalysis @back="goHome" />
  </div>
  <div v-else-if="currentPage === 'sector-rotation'">
    <SectorRotation @back="goHome" />
  </div>
</template>

<style scoped>
/* Home Page Styles */
.home-page {
  width: 100%;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.header {
  text-align: center;
  margin-bottom: 60px;
  color: white;
}

.title {
  font-size: 3rem;
  font-weight: bold;
  margin: 0 0 10px 0;
  text-shadow: 0 2px 10px rgba(0,0,0,0.2);
}

.subtitle {
  font-size: 1.2rem;
  margin: 0;
  opacity: 0.9;
}

.main-content {
  width: 100%;
  max-width: 1200px;
}

.card-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 30px;
  padding: 0 20px;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 40px 30px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
}

.card:hover {
  transform: translateY(-10px);
  box-shadow: 0 20px 40px rgba(0,0,0,0.3);
}

.card-icon {
  font-size: 3rem;
  margin-bottom: 15px;
}

.card-title {
  font-size: 1.8rem;
  color: #333;
  margin: 15px 0;
  font-weight: bold;
}

.card-description {
  font-size: 1rem;
  color: #666;
  line-height: 1.6;
  margin: 20px 0;
}

.card-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 12px 30px;
  font-size: 1rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  font-weight: bold;
  margin-top: 20px;
}

.card-button:hover {
  transform: scale(1.05);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}


@media (max-width: 600px) {
  .title {
    font-size: 2rem;
  }

  .subtitle {
    font-size: 1rem;
  }

  .header {
    margin-bottom: 40px;
  }

  .card-container {
    gap: 20px;
  }

  .card {
    padding: 30px 20px;
  }

  .card-title {
    font-size: 1.4rem;
  }
}
</style>
