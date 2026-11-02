/**
 * 通用小部件：弹窗、状态徽标、描述列表。
 * 使用 React.createElement 直接构造，避免 JSX 构建配置。
 */
import * as React from 'react'

const h = React.createElement

/**
 * 居中弹窗容器。
 * @param {{title:string, children:any, footer?:any, onClose:()=>void}} props 属性
 * @returns {any} React 元素
 */
export function Modal({ title, children, footer, onClose }) {
  return h('div', { className: 'dpr-overlay', onClick: onClose },
    h('div', { className: 'dpr-modal', onClick: (e) => e.stopPropagation() },
      h('div', { className: 'dpr-modal-head' },
        h('h3', { className: 'dpr-modal-title' }, title),
        h('div', { className: 'dpr-spacer' }),
        h('button', { type: 'button', className: 'dpr-btn', onClick: onClose }, '关闭'),
      ),
      h('div', { className: 'dpr-modal-body' }, children),
      footer ? h('div', { className: 'dpr-modal-foot' }, footer) : null,
    ),
  )
}

/**
 * 流程状态徽标：结束/同意等视为完成态，其余视为进行中。
 * @param {{status:string}} props 属性
 * @returns {any} React 元素
 */
export function StatusPill({ status }) {
  const s = String(status || '')
  const done = /结束|同意|通过|完成/.test(s)
  return h('span', { className: `dpr-pill ${done ? 'ok' : 'warn'}` }, s || '—')
}

/**
 * 描述列表（用于详情弹窗）。
 * @param {{rows:Array<[string, any]>}} props 属性，rows 为 [标签, 值] 数组
 * @returns {any} React 元素
 */
export function DescriptionList({ rows }) {
  return h('dl', { className: 'dpr-dl' },
    rows.map(([label, value], i) => [
      h('dt', { key: `dt-${i}` }, label),
      h('dd', { key: `dd-${i}` }, value === '' || value === null || value === undefined ? '—' : value),
    ]),
  )
}
