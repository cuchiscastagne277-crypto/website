import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { initDB } from './utils/db.js'

// 应用启动时初始化数据库
initDB().then(() => {
  console.log('数据库初始化完成')
}).catch(err => {
  console.error('数据库初始化失败:', err)
})

createApp(App).mount('#app')
