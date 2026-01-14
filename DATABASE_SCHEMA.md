# 数据库表结构说明

## 数据库名称
`stock_rotation_db` (IndexedDB)

## 表结构及业务逻辑

### 1. `plate_data` - 板块数据缓存表
**主键**: `date` (YYYYMMDD格式，如 "20240101")

**字段**:
- `date`: 日期（主键）
- `data`: 板块数据数组（API响应的原始数据）
- `timestamp`: 保存时间戳

**业务逻辑**:
- **用途**: 缓存API返回的原始板块数据，避免重复请求
- **使用场景**:
  - `SectorRotation.vue` (板块轮动页面): 查询最近7个交易日的数据
  - `PlateRanking.vue` (板块排行页面): 查询最近20个交易日的数据
- **查询方式**: 按日期直接查询，用于快速获取某一天的板块列表和涨幅数据
- **保存时机**: 每次从API获取数据后，通过 `extractAndSaveAllData` 函数保存

---

### 2. `plate_stock_relation` - 板块与股票关系表（旧表，兼容用）
**主键**: `id` (自增ID)

**字段**:
- `id`: 自增主键
- `plateName`: 板块名称
- `stockCode`: 股票代码
- `stockName`: 股票名称
- `date`: 日期
- `plateDateKey`: 索引键 "plateName_date"
- `stockDateKey`: 索引键 "stockCode_date"

**业务逻辑**:
- **用途**: 存储板块与股票的关联关系（历史遗留，用于兼容旧数据）
- **使用场景**:
  - `PlateStockList.vue` (热门股列表): 当新表 `stock_base` 没有数据时，回退查询此表
  - 通过 `getStocksByPlate()` 查询某个板块下的所有股票
  - 通过 `getPlatesByStock()` 查询某只股票所属的所有板块
- **查询方式**: 
  - 按板块名称查询: `getStocksByPlate(plateName)`
  - 按股票代码查询: `getPlatesByStock(stockCode)`
  - 按板块+日期查询: `getStocksByPlate(plateName, date)`
- **保存时机**: 通过 `extractAndSaveAllData` 函数保存（保留用于兼容）

---

### 3. `stock_limit_info` - 股票涨停信息表（旧表，兼容用）
**主键**: `id` (格式: "date_stockCode"，如 "20240101_SH600000")

**字段**:
- `id`: 主键 "date_stockCode"
- `stockCode`: 股票代码
- `stockName`: 股票名称
- `date`: 日期
- `time`: 涨停时间
- `reason`: 涨停原因
- `upNum`: 连板数
- `change`: 涨幅
- `lastPx`: 最新价
- `cmc`: 市值

**业务逻辑**:
- **用途**: 存储股票的涨停信息（历史遗留，用于兼容旧数据）
- **使用场景**:
  - `StockLimitDetail.vue` (股票详情页面): 查询某只股票的所有涨停记录
  - `PlateStockList.vue` (热门股列表): 当新表没有数据时，查询股票的涨停信息
- **查询方式**: 
  - 按股票代码查询: `getLimitInfoByStock(stockCode)` - 返回该股票的所有涨停记录
- **保存时机**: 通过 `extractAndSaveAllData` 函数保存（保留用于兼容）

---

### 4. `stock_tag` - 股票标记表
**主键**: `id` (格式: "plateName_stockCode"，如 "AI医疗_SH600000")

**字段**:
- `id`: 主键 "plateName_stockCode"
- `plateName`: 板块名称
- `stockCode`: 股票代码
- `stockName`: 股票名称
- `tag`: 标记值（"中军" / "龙头" / "老龙"）
- `timestamp`: 创建时间戳
- `updateTime`: 更新时间戳

**业务逻辑**:
- **用途**: 存储用户在"热门股列表"页面为股票添加的标记（中军/龙头/老龙）
- **使用场景**:
  - `PlateStockList.vue` (热门股列表): 
    - 显示股票标记（下拉选择框）
    - 保存/更新标记: `saveStockTag(plateName, stockCode, stockName, tag)`
    - 批量查询标记: `getStockTagsBatch(plateName, stockCodes)`
    - 删除标记: `deleteStockTag(plateName, stockCode)`
    - 显示标记历史（带时间戳和删除功能）
- **查询方式**: 
  - 按板块+股票查询: `getStockTag(plateName, stockCode)`
  - 批量查询: `getStockTagsBatch(plateName, stockCodes)`
  - 查询板块下所有标记的股票: `getTaggedStocksByPlate(plateName)`
- **保存时机**: 用户在"热门股列表"页面选择标记时保存

---

### 5. `stock_note` - 股票笔记表（目前未使用）
**主键**: `id` (格式: "plateName_stockCode")

**字段**:
- `id`: 主键 "plateName_stockCode"
- `plateName`: 板块名称
- `stockCode`: 股票代码
- `stockName`: 股票名称
- `note`: 笔记内容
- `timestamp`: 创建时间戳

**业务逻辑**:
- **用途**: 原本用于在"热门股列表"页面为股票添加笔记（已废弃）
- **当前状态**: 此功能已移除，笔记功能已迁移到 `stock_detail_note` 表
- **保留原因**: 可能用于未来功能扩展

---

### 6. `stock_detail_note` - 股票详情笔记表
**主键**: `id` (格式: "stockCode_timestamp")

**字段**:
- `id`: 主键 "stockCode_timestamp"
- `stockCode`: 股票代码
- `stockName`: 股票名称
- `date`: 日期（YYYYMMDD格式）
- `content`: 笔记内容
- `timestamp`: 创建时间戳

**业务逻辑**:
- **用途**: 在"股票详情"页面为股票添加按日期的笔记
- **使用场景**:
  - `StockLimitDetail.vue` (股票详情页面):
    - 显示笔记列表（按时间倒序）
    - 添加笔记: `saveStockDetailNote(stockCode, stockName, content)`
    - 编辑笔记: `updateStockDetailNote(noteId, content)`
    - 删除笔记: `deleteStockDetailNote(noteId)`
- **查询方式**: 
  - 按股票代码查询: `getStockDetailNotes(stockCode)` - 返回该股票的所有笔记（按时间倒序）
- **保存时机**: 用户在"股票详情"页面添加/编辑笔记时保存
- **特点**: 支持多条笔记，每条笔记都有独立的日期和时间戳

---

### 7. `stock_base` - 股票基础表（新表，推荐使用）
**主键**: `stockCode` (股票代码，如 "SH600000")

**字段**:
- `stockCode`: 股票代码（主键）
- `stockName`: 股票名称
- `plateNames`: 所属板块名称（逗号分隔，如 "AI医疗,人工智能"）
- `firstSeenDate`: 首次出现日期（YYYYMMDD）
- `lastSeenDate`: 最后出现日期（YYYYMMDD）
- `createTime`: 创建时间戳
- `updateTime`: 更新时间戳

**业务逻辑**:
- **用途**: 存储股票的基础信息，包括股票名称和所属板块（一个股票可以属于多个板块）
- **使用场景**:
  - `PlateStockList.vue` (热门股列表): 
    - 主要数据源，通过 `getStocksByPlateFromBase(plateName)` 查询某个板块下的所有股票
    - 支持查询历史上所有在该板块出现过涨停的股票（不限于某一天）
- **查询方式**: 
  - 按板块查询: `getStocksByPlateFromBase(plateName)` - 返回该板块下的所有股票
  - 按股票代码查询: `getStockBase(stockCode)` - 返回股票基础信息
- **保存时机**: 通过 `extractAndSaveAllData` 函数保存
- **特点**: 
  - 一个股票只存储一条记录，但 `plateNames` 字段可以包含多个板块（逗号分隔）
  - 自动合并：如果股票在多个板块出现，会合并到 `plateNames` 中
  - 自动更新 `firstSeenDate` 和 `lastSeenDate`

---

### 8. `stock_limit_record` - 股票涨停记录表（新表，推荐使用）
**主键**: `id` (格式: "date_stockCode_plateName"，如 "20240101_SH600000_AI医疗")

**字段**:
- `id`: 主键 "date_stockCode_plateName"
- `stockCode`: 股票代码
- `stockName`: 股票名称
- `plateName`: 板块名称
- `date`: 日期（YYYYMMDD）
- `time`: 涨停时间
- `reason`: 涨停原因
- `upNum`: 连板数
- `change`: 涨幅
- `lastPx`: 最新价
- `cmc`: 市值
- `stockDateKey`: 索引键 "stockCode_date"
- `plateDateKey`: 索引键 "plateName_date"

**业务逻辑**:
- **用途**: 存储股票的涨停记录，按日期、股票、板块三个维度存储（一条记录代表某只股票在某一天在某个板块的涨停）
- **使用场景**:
  - `PlateStockList.vue` (热门股列表): 
    - 通过 `getLimitRecordsByPlate(plateName)` 查询某个板块下所有股票的涨停记录
    - 用于计算股票的涨停次数和显示涨停日期列表
  - 可以按日期+板块查询: `getLimitRecordsByPlateAndDate(plateName, date)`
  - 可以按股票查询: `getLimitRecordsByStock(stockCode)`
- **查询方式**: 
  - 按板块查询: `getLimitRecordsByPlate(plateName)` - 返回该板块下所有股票的涨停记录
  - 按板块+日期查询: `getLimitRecordsByPlateAndDate(plateName, date)`
  - 按股票查询: `getLimitRecordsByStock(stockCode)`
- **保存时机**: 通过 `extractAndSaveAllData` 函数保存
- **特点**: 
  - 一条记录代表一只股票在某个板块某一天的涨停
  - 如果一只股票在同一天属于多个板块，会有多条记录（每个板块一条）
  - 支持高效的按板块查询（通过 `plateName` 索引）

---

## 数据流向

### 数据保存流程（`extractAndSaveAllData` 函数）

1. **API请求** → 获取板块数据（`plate_stock` 数组）
2. **保存到 `plate_data`** → 缓存原始API响应
3. **遍历板块数据** → 提取每个板块下的股票列表
4. **保存到 `plate_stock_relation`** → 保存板块-股票关系（兼容用）
5. **保存到 `stock_limit_info`** → 保存股票涨停信息（兼容用）
6. **保存到 `stock_base`** → 保存/更新股票基础信息（合并板块名称）
7. **保存到 `stock_limit_record`** → 保存股票涨停记录（按日期+板块）

### 数据查询流程

#### 场景1: 板块轮动页面 (`SectorRotation.vue`)
```
getPlateData(date) → plate_data 表
→ 显示板块列表和涨幅
```

#### 场景2: 板块排行页面 (`PlateRanking.vue`)
```
getPlateData(date) → plate_data 表（循环查询20个交易日）
→ 显示板块排行和每日涨幅
```

#### 场景3: 热门股列表页面 (`PlateStockList.vue`)
```
优先: getStocksByPlateFromBase(plateName) → stock_base 表
     + getLimitRecordsByPlate(plateName) → stock_limit_record 表
回退: getStocksByPlate(plateName) → plate_stock_relation 表
     + getLimitInfoByStock(stockCode) → stock_limit_info 表
→ 显示板块下的所有股票及其涨停记录
```

#### 场景4: 股票详情页面 (`StockLimitDetail.vue`)
```
getLimitInfoByStock(stockCode) → stock_limit_info 表
getStockDetailNotes(stockCode) → stock_detail_note 表
→ 显示股票的涨停记录和笔记
```

---

## 表之间的关系

```
plate_data (原始数据)
    ↓
extractAndSaveAllData() 函数拆解数据
    ↓
    ├─→ plate_stock_relation (板块-股票关系，兼容用)
    ├─→ stock_limit_info (股票涨停信息，兼容用)
    ├─→ stock_base (股票基础信息，新表) ← 推荐使用
    └─→ stock_limit_record (股票涨停记录，新表) ← 推荐使用

stock_base ←→ stock_limit_record (通过 stockCode 关联)

stock_tag (用户标记，独立表)
stock_detail_note (用户笔记，独立表)
```

---

## 新表 vs 旧表

### 为什么有两套表？

- **旧表** (`plate_stock_relation` + `stock_limit_info`): 
  - 历史遗留，用于兼容已有数据
  - 查询效率较低（需要多次查询和关联）
  
- **新表** (`stock_base` + `stock_limit_record`):
  - 设计更合理，查询效率更高
  - `stock_base`: 一个股票一条记录，包含所有所属板块
  - `stock_limit_record`: 按日期+板块存储，支持高效查询

### 迁移策略

- `PlateStockList.vue` 优先使用新表，如果新表没有数据则回退到旧表
- 新数据会同时保存到新旧两套表（保证兼容性）
- 可以通过 `migrateDataToNewTables()` 函数将旧数据迁移到新表
