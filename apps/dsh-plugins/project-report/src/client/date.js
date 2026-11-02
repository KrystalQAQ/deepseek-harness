/**
 * 日期与格式化工具函数（纯函数，便于测试与复用）。
 */

/**
 * 将 Date 格式化为 YYYY-MM-DD。
 * @param {Date} d 日期对象
 * @returns {string} ISO 日期（本地时区）
 */
export function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 今天的 YYYY-MM-DD。
 * @returns {string} 今天
 */
export function todayStr() {
  return ymd(new Date())
}

/**
 * 相对今天偏移 n 天的 YYYY-MM-DD。
 * @param {number} n 偏移天数（负数表示过去）
 * @returns {string} 日期字符串
 */
export function daysAgoStr(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return ymd(d)
}

/**
 * 计算给定日期所在自然周的周一，返回 YYYY-MM-DD。
 * @param {string} [dateStr] YYYY-MM-DD，缺省为今天
 * @returns {string} 周一日期
 */
export function mondayOf(dateStr) {
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date()
  const day = base.getDay() // 0=周日
  const diff = day === 0 ? -6 : 1 - day
  base.setDate(base.getDate() + diff)
  return ymd(base)
}

/**
 * 计算给定日期所在自然周的周日，返回 YYYY-MM-DD。
 * @param {string} [dateStr] YYYY-MM-DD，缺省为今天
 * @returns {string} 周日日期
 */
export function sundayOf(dateStr) {
  const monday = mondayOf(dateStr)
  const d = new Date(`${monday}T00:00:00`)
  d.setDate(d.getDate() + 6)
  return ymd(d)
}

/**
 * 截断长文本为单行预览。
 * @param {string} text 原文
 * @param {number} [max] 最大字符数
 * @returns {string} 截断后的文本
 */
export function truncate(text, max = 80) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

/**
 * 判断周期是否跨越多天，返回展示串。
 * @param {string} start 开始日
 * @param {string} end 结束日
 * @returns {string} 展示串
 */
export function periodLabel(start, end) {
  if (!start) return end || ''
  if (!end || start === end) return start
  return `${start} ~ ${end}`
}
