/**
 * 「项目汇报」插件 —— 浏览器端入口。
 *
 * 通过 DSH 的 Slot 组合系统注册两处 UI：
 * 1. `sidebar.panellist`：左侧栏图标入口「项目汇报」，id 与主面板 key 相同；
 * 2. `main`：主区域面板（key 与侧栏 id 一致，点击侧栏即切换到该面板）。
 *
 * 本文件只负责装配，具体页面见 ReportPage.js，通信见 api.js。
 */
import * as React from 'react'
import { installStyles } from './styles.js'
import { createApi } from './api.js'
import { ReportPage } from './ReportPage.js'

const h = React.createElement

/** 插件名。 */
export const name = 'project-report'

/** 依赖的客户端服务：slots（UI 组合）与 connection（RPC）。 */
export const inject = ['slots', 'connection']

/** 侧栏入口 id，同时也是 main 槽位的 key。 */
const PANEL_ID = 'project-report'

/**
 * 侧栏图标组件（16x16 矢量，1px 描边，跟随 currentColor 与宿主尺寸）。
 * @param {{size:number, active?:boolean}} props 宿主提供的图标属性
 * @returns {any} React 元素
 */
function SidebarIcon({ size }) {
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
  },
  // 外框
  h('rect', { x: 2.5, y: 2.5, width: 11, height: 11, rx: 1.5 }),
  // 内部柱状图（象征“汇报/统计”）
  h('path', { d: 'M5 11V9M8 11V6M11 11V7.5' }),
  )
}

/**
 * 插件入口：注册样式、侧栏入口与主面板。
 * @param {any} ctx DSH 客户端 Cordis 上下文
 * @returns {void}
 */
export function apply(ctx) {
  // 注入样式（随插件生命周期清理）
  ctx.effect(() => installStyles(), 'project-report: install styles')

  // 构造宿主 RPC 调用器（闭包捕获 connection）
  const call = createApi(ctx.connection)

  // 左侧栏入口：同一 id 会寻址 main 中 key 相同的面板
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 40,
    label: () => '项目汇报',
  }, SidebarIcon))

  // 主区域面板：注入 call 供页面使用
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    inject: () => ({ call }),
  }, ReportPage))
}
