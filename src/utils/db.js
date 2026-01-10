// IndexedDB 数据库工具类
// 数据库名: stock_rotation_db
// 版本: 1
// 表1: plate_data - 存储日期和板块数据（API响应缓存）
// 表2: plate_stock_relation - 板块与股票关系
// 表3: stock_limit_info - 股票涨停时间和原因

const DB_NAME = 'stock_rotation_db'
const DB_VERSION = 4

let dbInstance = null

// 初始化数据库
export const initDB = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance)
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(request.error)
    }

    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      // 表1: plate_data - 主键: date (YYYYMMDD格式)
      if (!db.objectStoreNames.contains('plate_data')) {
        const plateStore = db.createObjectStore('plate_data', { keyPath: 'date' })
        plateStore.createIndex('timestamp', 'timestamp', { unique: false })
      }

      // 表2: plate_stock_relation - 主键: 自增ID, 索引: plateName, stockCode, date
      // 注意：IndexedDB 不支持数组作为 keyPath，所以使用单字段索引，查询时通过多个索引过滤
      if (!db.objectStoreNames.contains('plate_stock_relation')) {
        const relationStore = db.createObjectStore('plate_stock_relation', { keyPath: 'id', autoIncrement: true })
        relationStore.createIndex('plateName', 'plateName', { unique: false })
        relationStore.createIndex('stockCode', 'stockCode', { unique: false })
        relationStore.createIndex('date', 'date', { unique: false })
        relationStore.createIndex('plateDateKey', 'plateDateKey', { unique: false }) // 存储 'plateName_date' 作为唯一标识
        relationStore.createIndex('stockDateKey', 'stockDateKey', { unique: false }) // 存储 'stockCode_date' 作为唯一标识
      }

      // 表3: stock_limit_info - 主键: id (date_stockCode字符串组合), 索引: stockCode, date, time
      if (!db.objectStoreNames.contains('stock_limit_info')) {
        const stockStore = db.createObjectStore('stock_limit_info', { keyPath: 'id' })
        stockStore.createIndex('stockCode', 'stockCode', { unique: false })
        stockStore.createIndex('date', 'date', { unique: false })
        stockStore.createIndex('time', 'time', { unique: false })
      }

      // 表4: stock_tag - 股票标记（中军/龙头/老龙），主键: id (plateName_stockCode字符串组合)
      if (!db.objectStoreNames.contains('stock_tag')) {
        const tagStore = db.createObjectStore('stock_tag', { keyPath: 'id' })
        tagStore.createIndex('plateName', 'plateName', { unique: false })
        tagStore.createIndex('stockCode', 'stockCode', { unique: false })
        tagStore.createIndex('tag', 'tag', { unique: false })
      }

      // 表5: stock_note - 股票笔记，主键: id (plateName_stockCode字符串组合)
      if (!db.objectStoreNames.contains('stock_note')) {
        const noteStore = db.createObjectStore('stock_note', { keyPath: 'id' })
        noteStore.createIndex('plateName', 'plateName', { unique: false })
        noteStore.createIndex('stockCode', 'stockCode', { unique: false })
      }

      // 表6: stock_detail_note - 股票详情笔记（按日期），主键: id (stockCode_timestamp字符串组合)
      if (!db.objectStoreNames.contains('stock_detail_note')) {
        const detailNoteStore = db.createObjectStore('stock_detail_note', { keyPath: 'id' })
        detailNoteStore.createIndex('stockCode', 'stockCode', { unique: false })
        detailNoteStore.createIndex('date', 'date', { unique: false })
        detailNoteStore.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
  })
}

// 获取数据库实例
const getDB = async () => {
  if (!dbInstance) {
    await initDB()
  }
  return dbInstance
}

// ==================== plate_data 操作 ====================

// 保存或更新板块数据
export const savePlateData = async (date, plateData) => {
  const db = await getDB()
  const tx = db.transaction(['plate_data'], 'readwrite')
  const store = tx.objectStore('plate_data')
  
  const data = {
    date: date,
    plateData: plateData,
    timestamp: Date.now()
  }
  
  return new Promise((resolve, reject) => {
    const request = store.put(data)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// 获取指定日期的板块数据
export const getPlateData = async (date) => {
  const db = await getDB()
  const tx = db.transaction(['plate_data'], 'readonly')
  const store = tx.objectStore('plate_data')
  
  return new Promise((resolve, reject) => {
    const request = store.get(date)
    request.onsuccess = () => {
      const result = request.result
      resolve(result ? result.plateData : null)
    }
    request.onerror = () => reject(request.error)
  })
}

// 获取多个日期的板块数据
export const getPlateDataBatch = async (dates) => {
  const db = await getDB()
  const tx = db.transaction(['plate_data'], 'readonly')
  const store = tx.objectStore('plate_data')
  
  const results = []
  let completed = 0
  
  return new Promise((resolve, reject) => {
    if (dates.length === 0) {
      resolve([])
      return
    }
    
    dates.forEach(date => {
      const request = store.get(date)
      request.onsuccess = () => {
        const result = request.result
        if (result) {
          results.push({ date, plateData: result.plateData })
        }
        completed++
        if (completed === dates.length) {
          resolve(results.sort((a, b) => a.date.localeCompare(b.date)))
        }
      }
      request.onerror = () => {
        completed++
        if (completed === dates.length) {
          reject(request.error)
        }
      }
    })
  })
}

// ==================== plate_stock_relation 操作 ====================

// 保存板块-股票关系
export const savePlateStockRelation = async (plateName, stockCode, stockName, date) => {
  const db = await getDB()
  const tx = db.transaction(['plate_stock_relation'], 'readwrite')
  const store = tx.objectStore('plate_stock_relation')
  
  // 先检查是否已存在（同一天同一个板块的同一个股票只保存一次）
  const plateDateKey = `${plateName}_${date}`
  const index = store.index('plateDateKey')
  const range = IDBKeyRange.only(plateDateKey)
  
  return new Promise((resolve, reject) => {
    const checkRequest = index.getAll(range)
    checkRequest.onsuccess = () => {
      const existing = checkRequest.result.find(r => r.stockCode === stockCode)
      if (existing) {
        resolve(existing.id)
        return
      }
      
      const data = {
        plateName,
        stockCode,
        stockName,
        date,
        plateDateKey,
        stockDateKey: `${stockCode}_${date}`,
        timestamp: Date.now()
      }
      
      const request = store.add(data)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }
    checkRequest.onerror = () => reject(checkRequest.error)
  })
}

// 批量保存板块-股票关系
export const savePlateStockRelationsBatch = async (relations) => {
  // relations: [{ plateName, stockCode, stockName, date }, ...]
  const db = await getDB()
  const tx = db.transaction(['plate_stock_relation'], 'readwrite')
  const store = tx.objectStore('plate_stock_relation')
  
  const promises = relations.map(rel => savePlateStockRelation(rel.plateName, rel.stockCode, rel.stockName, rel.date))
  return Promise.all(promises)
}

// 根据板块名称查询股票列表（可选的日期范围）
export const getStocksByPlate = async (plateName, date = null) => {
  const db = await getDB()
  const tx = db.transaction(['plate_stock_relation'], 'readonly')
  const store = tx.objectStore('plate_stock_relation')
  const index = date ? store.index('plateDateKey') : store.index('plateName')
  
  return new Promise((resolve, reject) => {
    const request = date ? index.getAll(`${plateName}_${date}`) : index.getAll(plateName)
    
    request.onsuccess = () => {
      // 去重：同一个股票代码可能在不同日期出现
      const map = new Map()
      let filtered = request.result
      if (date) {
        filtered = filtered.filter(item => item.plateName === plateName && item.date === date)
      } else {
        filtered = filtered.filter(item => item.plateName === plateName)
      }
      
      filtered.forEach(item => {
        if (!map.has(item.stockCode)) {
          map.set(item.stockCode, {
            stockCode: item.stockCode,
            stockName: item.stockName,
            dates: []
          })
        }
        const stock = map.get(item.stockCode)
        if (!stock.dates.includes(item.date)) {
          stock.dates.push(item.date)
        }
      })
      resolve(Array.from(map.values()))
    }
    request.onerror = () => reject(request.error)
  })
}

// 根据股票代码查询所属板块列表（可选的日期范围）
export const getPlatesByStock = async (stockCode, date = null) => {
  const db = await getDB()
  const tx = db.transaction(['plate_stock_relation'], 'readonly')
  const store = tx.objectStore('plate_stock_relation')
  const index = date ? store.index('stockDateKey') : store.index('stockCode')
  
  return new Promise((resolve, reject) => {
    const request = date ? index.getAll(`${stockCode}_${date}`) : index.getAll(stockCode)
    
    request.onsuccess = () => {
      const map = new Map()
      let filtered = request.result
      if (date) {
        filtered = filtered.filter(item => item.stockCode === stockCode && item.date === date)
      } else {
        filtered = filtered.filter(item => item.stockCode === stockCode)
      }
      
      filtered.forEach(item => {
        if (!map.has(item.plateName)) {
          map.set(item.plateName, {
            plateName: item.plateName,
            dates: []
          })
        }
        const plate = map.get(item.plateName)
        if (!plate.dates.includes(item.date)) {
          plate.dates.push(item.date)
        }
      })
      resolve(Array.from(map.values()))
    }
    request.onerror = () => reject(request.error)
  })
}

// 查询所有历史出现过的股票
export const getAllStocks = async () => {
  const db = await getDB()
  const tx = db.transaction(['plate_stock_relation'], 'readonly')
  const store = tx.objectStore('plate_stock_relation')
  
  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => {
      const map = new Map()
      request.result.forEach(item => {
        if (!map.has(item.stockCode)) {
          map.set(item.stockCode, {
            stockCode: item.stockCode,
            stockName: item.stockName,
            firstSeen: item.date,
            dates: []
          })
        }
        const stock = map.get(item.stockCode)
        if (!stock.dates.includes(item.date)) {
          stock.dates.push(item.date)
        }
        if (item.date < stock.firstSeen) {
          stock.firstSeen = item.date
        }
      })
      resolve(Array.from(map.values()).sort((a, b) => a.firstSeen.localeCompare(b.firstSeen)))
    }
    request.onerror = () => reject(request.error)
  })
}

// ==================== stock_limit_info 操作 ====================

// 保存股票涨停信息
export const saveStockLimitInfo = async (stockCode, stockName, date, time, reason, upNum = null, change = null, lastPx = null, cmc = null) => {
  const db = await getDB()
  const tx = db.transaction(['stock_limit_info'], 'readwrite')
  const store = tx.objectStore('stock_limit_info')
  
  // 使用字符串组合作为主键，同一天同一只股票会覆盖
  const id = `${date}_${stockCode}`
  
  return new Promise((resolve, reject) => {
    const data = {
      id,
      date,
      stockCode,
      stockName,
      time: time || null,
      reason: reason || null,
      upNum: upNum || null,
      change: change || null,
      lastPx: lastPx || null,
      cmc: cmc || null,
      timestamp: Date.now()
    }
    
    const request = store.put(data)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// 批量保存股票涨停信息
export const saveStockLimitInfoBatch = async (infos) => {
  // infos: [{ stockCode, stockName, date, time, reason, upNum, change, lastPx, cmc }, ...]
  const db = await getDB()
  const tx = db.transaction(['stock_limit_info'], 'readwrite')
  const store = tx.objectStore('stock_limit_info')
  
  const promises = infos.map(info => 
    saveStockLimitInfo(
      info.stockCode,
      info.stockName,
      info.date,
      info.time,
      info.reason,
      info.upNum,
      info.change,
      info.lastPx,
      info.cmc
    )
  )
  return Promise.all(promises)
}

// 根据股票代码查询涨停信息
export const getLimitInfoByStock = async (stockCode) => {
  const db = await getDB()
  const tx = db.transaction(['stock_limit_info'], 'readonly')
  const store = tx.objectStore('stock_limit_info')
  const index = store.index('stockCode')
  
  return new Promise((resolve, reject) => {
    const request = index.getAll(stockCode)
    request.onsuccess = () => {
      resolve(request.result.sort((a, b) => a.date.localeCompare(b.date)))
    }
    request.onerror = () => reject(request.error)
  })
}

// 根据日期查询涨停信息
export const getLimitInfoByDate = async (date) => {
  const db = await getDB()
  const tx = db.transaction(['stock_limit_info'], 'readonly')
  const store = tx.objectStore('stock_limit_info')
  const index = store.index('date')
  
  return new Promise((resolve, reject) => {
    const request = index.getAll(date)
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  })
}

// 根据股票代码和日期查询涨停信息
export const getLimitInfoByStockAndDate = async (stockCode, date) => {
  const db = await getDB()
  const tx = db.transaction(['stock_limit_info'], 'readonly')
  const store = tx.objectStore('stock_limit_info')
  
  const id = `${date}_${stockCode}`
  
  return new Promise((resolve, reject) => {
    const request = store.get(id)
    request.onsuccess = () => {
      resolve(request.result || null)
    }
    request.onerror = () => reject(request.error)
  })
}

// 查询所有涨停记录（可选日期范围）
export const getAllLimitInfo = async (startDate = null, endDate = null) => {
  const db = await getDB()
  const tx = db.transaction(['stock_limit_info'], 'readonly')
  const store = tx.objectStore('stock_limit_info')
  const index = store.index('date')
  
  return new Promise((resolve, reject) => {
    let range = null
    if (startDate && endDate) {
      range = IDBKeyRange.bound(startDate, endDate)
    } else if (startDate) {
      range = IDBKeyRange.lowerBound(startDate)
    } else if (endDate) {
      range = IDBKeyRange.upperBound(endDate)
    }
    
    const request = range ? index.getAll(range) : store.getAll()
    request.onsuccess = () => {
      resolve(request.result.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        return (a.time || '').localeCompare(b.time || '')
      }))
    }
    request.onerror = () => reject(request.error)
  })
}

// ==================== stock_tag 操作 ====================

// 保存或更新股票标记（记录历史）
export const saveStockTag = async (plateName, stockCode, stockName, tag) => {
  const db = await getDB()
  const tx = db.transaction(['stock_tag'], 'readwrite')
  const store = tx.objectStore('stock_tag')
  
  // 使用 plateName_stockCode 作为主键
  const id = `${plateName}_${stockCode}`
  
  const timestamp = Date.now()
  
  // 如果标记为 null，删除记录
  if (!tag || tag.trim() === '') {
    return new Promise((resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve(null)
      request.onerror = () => reject(request.error)
    })
  }
  
  const data = {
    id,
    plateName,
    stockCode,
    stockName,
    tag: tag.trim(), // '中军', '龙头', '老龙'
    timestamp: timestamp, // 标记时间
    updateTime: timestamp // 更新时间
  }
  
  return new Promise((resolve, reject) => {
    const request = store.put(data)
    request.onsuccess = () => resolve({ ...data })
    request.onerror = () => reject(request.error)
  })
}

// 根据板块和股票代码查询标记
export const getStockTag = async (plateName, stockCode) => {
  const db = await getDB()
  const tx = db.transaction(['stock_tag'], 'readonly')
  const store = tx.objectStore('stock_tag')
  
  const id = `${plateName}_${stockCode}`
  
  return new Promise((resolve, reject) => {
    const request = store.get(id)
    request.onsuccess = () => {
      const result = request.result
      resolve(result ? result.tag : null)
    }
    request.onerror = () => reject(request.error)
  })
}

// 根据板块查询所有标记的股票（带时间戳）
export const getTaggedStocksByPlate = async (plateName) => {
  const db = await getDB()
  const tx = db.transaction(['stock_tag'], 'readonly')
  const store = tx.objectStore('stock_tag')
  const index = store.index('plateName')
  
  return new Promise((resolve, reject) => {
    const request = index.getAll(plateName)
    request.onsuccess = () => {
      const result = request.result
        .filter(item => item.tag !== null && item.tag !== '') // 只返回有标记的
        .map(item => ({
          id: item.id,
          stockCode: item.stockCode,
          stockName: item.stockName,
          tag: item.tag,
          timestamp: item.timestamp || item.updateTime || Date.now()
        }))
        .sort((a, b) => b.timestamp - a.timestamp) // 按时间倒序排列
      resolve(result)
    }
    request.onerror = () => reject(request.error)
  })
}

// 删除标记记录
export const deleteStockTag = async (plateName, stockCode) => {
  const db = await getDB()
  const tx = db.transaction(['stock_tag'], 'readwrite')
  const store = tx.objectStore('stock_tag')
  
  const id = `${plateName}_${stockCode}`
  
  return new Promise((resolve, reject) => {
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// 批量获取股票标记（用于列表显示）
export const getStockTagsBatch = async (plateName, stockCodes) => {
  const db = await getDB()
  const tx = db.transaction(['stock_tag'], 'readonly')
  const store = tx.objectStore('stock_tag')
  
  const tagsMap = new Map()
  
  return new Promise((resolve, reject) => {
    if (stockCodes.length === 0) {
      resolve(tagsMap)
      return
    }
    
    let completed = 0
    stockCodes.forEach(stockCode => {
      const id = `${plateName}_${stockCode}`
      const request = store.get(id)
      request.onsuccess = () => {
        const result = request.result
        if (result && result.tag) {
          tagsMap.set(stockCode, result.tag)
        }
        completed++
        if (completed === stockCodes.length) {
          resolve(tagsMap)
        }
      }
      request.onerror = () => {
        completed++
        if (completed === stockCodes.length) {
          reject(request.error)
        }
      }
    })
  })
}

// ==================== stock_note 操作 ====================

// 保存或更新股票笔记
export const saveStockNote = async (plateName, stockCode, stockName, note) => {
  const db = await getDB()
  const tx = db.transaction(['stock_note'], 'readwrite')
  const store = tx.objectStore('stock_note')
  
  // 使用 plateName_stockCode 作为主键
  const id = `${plateName}_${stockCode}`
  
  // 如果笔记为空或null，删除记录
  if (!note || note.trim() === '') {
    return new Promise((resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
  
  const data = {
    id,
    plateName,
    stockCode,
    stockName,
    note: note.trim(),
    timestamp: Date.now()
  }
  
  return new Promise((resolve, reject) => {
    const request = store.put(data)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// 根据板块和股票代码查询笔记
export const getStockNote = async (plateName, stockCode) => {
  const db = await getDB()
  const tx = db.transaction(['stock_note'], 'readonly')
  const store = tx.objectStore('stock_note')
  
  const id = `${plateName}_${stockCode}`
  
  return new Promise((resolve, reject) => {
    const request = store.get(id)
    request.onsuccess = () => {
      const result = request.result
      resolve(result ? result.note : null)
    }
    request.onerror = () => reject(request.error)
  })
}

// 批量获取股票笔记（用于列表显示）
export const getStockNotesBatch = async (plateName, stockCodes) => {
  const db = await getDB()
  const tx = db.transaction(['stock_note'], 'readonly')
  const store = tx.objectStore('stock_note')
  
  const notesMap = new Map()
  
  return new Promise((resolve, reject) => {
    if (stockCodes.length === 0) {
      resolve(notesMap)
      return
    }
    
    let completed = 0
    stockCodes.forEach(stockCode => {
      const id = `${plateName}_${stockCode}`
      const request = store.get(id)
      request.onsuccess = () => {
        const result = request.result
        if (result && result.note) {
          notesMap.set(stockCode, result.note)
        }
        completed++
        if (completed === stockCodes.length) {
          resolve(notesMap)
        }
      }
      request.onerror = () => {
        completed++
        if (completed === stockCodes.length) {
          reject(request.error)
        }
      }
    })
  })
}

// ==================== stock_detail_note 操作 ====================

// 保存股票详情笔记（按日期存储，支持多条）
export const saveStockDetailNote = async (stockCode, stockName, content) => {
  const db = await getDB()
  const tx = db.transaction(['stock_detail_note'], 'readwrite')
  const store = tx.objectStore('stock_detail_note')
  
  const timestamp = Date.now()
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '') // YYYYMMDD
  const id = `${stockCode}_${timestamp}`
  
  if (!content || content.trim() === '') {
    return Promise.reject(new Error('笔记内容不能为空'))
  }
  
  const data = {
    id,
    stockCode,
    stockName,
    date,
    content: content.trim(),
    timestamp
  }
  
  return new Promise((resolve, reject) => {
    const request = store.add(data)
    request.onsuccess = () => resolve({ ...data })
    request.onerror = () => reject(request.error)
  })
}

// 获取股票的所有详情笔记（按时间倒序）
export const getStockDetailNotes = async (stockCode) => {
  const db = await getDB()
  const tx = db.transaction(['stock_detail_note'], 'readonly')
  const store = tx.objectStore('stock_detail_note')
  const index = store.index('stockCode')
  
  return new Promise((resolve, reject) => {
    const request = index.getAll(stockCode)
    request.onsuccess = () => {
      const result = request.result
        .map(item => ({
          id: item.id,
          stockCode: item.stockCode,
          stockName: item.stockName,
          date: item.date,
          content: item.content,
          timestamp: item.timestamp
        }))
        .sort((a, b) => b.timestamp - a.timestamp) // 按时间倒序
      resolve(result)
    }
    request.onerror = () => reject(request.error)
  })
}

// 更新股票详情笔记
export const updateStockDetailNote = async (noteId, content) => {
  const db = await getDB()
  const tx = db.transaction(['stock_detail_note'], 'readwrite')
  const store = tx.objectStore('stock_detail_note')
  
  if (!content || content.trim() === '') {
    return Promise.reject(new Error('笔记内容不能为空'))
  }
  
  return new Promise((resolve, reject) => {
    const getRequest = store.get(noteId)
    getRequest.onsuccess = () => {
      const note = getRequest.result
      if (!note) {
        reject(new Error('笔记不存在'))
        return
      }
      
      note.content = content.trim()
      note.timestamp = Date.now() // 更新修改时间
      
      const putRequest = store.put(note)
      putRequest.onsuccess = () => resolve({ ...note })
      putRequest.onerror = () => reject(putRequest.error)
    }
    getRequest.onerror = () => reject(getRequest.error)
  })
}

// 删除股票详情笔记
export const deleteStockDetailNote = async (noteId) => {
  const db = await getDB()
  const tx = db.transaction(['stock_detail_note'], 'readwrite')
  const store = tx.objectStore('stock_detail_note')
  
  return new Promise((resolve, reject) => {
    const request = store.delete(noteId)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// ==================== 辅助函数 ====================

// 从 API 响应中提取并保存所有相关数据
export const extractAndSaveAllData = async (date, apiResponse) => {
  if (!apiResponse || apiResponse.code !== 200 || !Array.isArray(apiResponse.data?.plate_stock)) {
    return
  }

  const plateData = apiResponse.data.plate_stock
  const relations = []
  const limitInfos = []

  // 遍历每个板块
  plateData.forEach(plate => {
    const plateName = plate.secu_name
    if (!plateName) return

    // 提取股票列表（可能有多个字段名）
    const stockList = plate.stock_list || plate.stocks || plate.stockList || plate.stocks_list || []
    
    if (Array.isArray(stockList) && stockList.length > 0) {
      stockList.forEach(stock => {
        const stockCode = stock.secu_code || stock.code || stock.stock_code
        const stockName = stock.secu_name || stock.name || stock.stock_name
        
        if (stockCode && stockName) {
          // 保存板块-股票关系
          relations.push({
            plateName,
            stockCode,
            stockName,
            date
          })

          // 如果是涨停股票，保存涨停信息
          const isLimit = stock.limit === 1 || 
                         stock.is_limit === true || 
                         stock.up_limit === 1 || 
                         stock.zdt === 1 || 
                         stock.isZt === true ||
                         (stock.change && stock.change >= 0.089) ||
                         (stock.pct && parseFloat(stock.pct) >= 9.8)

          if (isLimit) {
            limitInfos.push({
              stockCode,
              stockName,
              date,
              time: stock.time || null,
              reason: stock.up_reason || plate.up_reason || null,
              upNum: (stock.up_num !== undefined && stock.up_num !== null && stock.up_num !== '') 
                ? stock.up_num 
                : (stock.limit_num !== undefined && stock.limit_num !== null && stock.limit_num !== '') 
                  ? stock.limit_num 
                  : null,
              change: stock.change || stock.pct || null,
              lastPx: stock.last_px || stock.price || null,
              cmc: stock.cmc || stock.market_cap || null
            })
          }
        }
      })
    }
  })

  // 批量保存
  try {
    // 1. 保存板块数据
    await savePlateData(date, plateData)
    
    // 2. 保存板块-股票关系
    if (relations.length > 0) {
      await savePlateStockRelationsBatch(relations)
    }
    
    // 3. 保存股票涨停信息
    if (limitInfos.length > 0) {
      await saveStockLimitInfoBatch(limitInfos)
    }
    
    console.log(`已保存数据: 日期=${date}, 板块数=${plateData.length}, 关系数=${relations.length}, 涨停数=${limitInfos.length}`)
  } catch (error) {
    console.error('保存数据到数据库失败:', error)
    throw error
  }
}
