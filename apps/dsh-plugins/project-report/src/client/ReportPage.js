/**
 * 「项目汇报」主面板。
 *
 * 功能：
 * - 日报 / 周报两个页签；
 * - 按项目、日期范围、关键字筛选（日期与关键字在宿主侧内存过滤）；
 * - 表格展示 + 行点击查看详情；
 * - 新增 / 编辑报表（调用宿主保存接口，先预览再提交）。
 *
 * 组件只通过注入的 `call` 访问宿主，不直接持有 connection。
 */
import * as React from 'react'
import { Modal, StatusPill, DescriptionList } from './ui.js'
import { ReportForm } from './ReportForm.js'
import { periodLabel, truncate } from './date.js'

const h = React.createElement

/**
 * 主页面组件。
 * @param {{call:(method:string, payload?:any, signal?:AbortSignal)=>Promise<any>}} props 属性（由 slot inject 提供）
 * @returns {any} React 元素
 */
export function ReportPage({ call }) {
  const [tab, setTab] = React.useState('daily')
  const [projects, setProjects] = React.useState([])
  const [account, setAccount] = React.useState('')
  const [projectId, setProjectId] = React.useState('')
  // 日期范围默认留空 = 不限日期，展示该项目全部记录
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [keywordInput, setKeywordInput] = React.useState('')
  const [keyword, setKeyword] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(50)
  const [data, setData] = React.useState({ rows: [], total: 0 })
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [modal, setModal] = React.useState(null)
  const [toast, setToast] = React.useState(null)
  const [reloadTick, setReloadTick] = React.useState(0)

  /**
   * 显示一条短暂提示。
   * @param {string} msg 文本
   * @param {'ok'|'err'} [kind] 类型
   * @returns {void}
   */
  function showToast(msg, kind = 'ok') {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 2600)
  }

  // 初始化：加载项目列表与账号信息
  React.useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const meta = await call('meta')
        if (!alive) return
        setAccount(meta?.account || '')
      } catch (e) {
        if (alive) setError(e?.message || '读取账号信息失败')
      }
      try {
        const res = await call('projects')
        if (!alive) return
        const list = res?.projects || []
        setProjects(list)
        // 默认不选项目 = “全部项目”，展示所有项目的数据
      } catch (e) {
        if (alive) setError(e?.message || '读取项目列表失败')
      }
    })()
    return () => { alive = false }
  }, [call])

  // 筛选条件或页签变化时重新拉取列表
  React.useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const method = tab === 'daily' ? 'daily.list' : 'weekly.list'
        const res = await call(method, {
          projectId,
          from,
          to,
          keyword,
          page,
          pageSize,
        })
        if (!alive) return
        setData({ rows: res?.rows || [], total: res?.total || 0 })
      } catch (e) {
        if (alive) { setError(e?.message || '加载失败'); setData({ rows: [], total: 0 }) }
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [call, tab, projectId, from, to, keyword, page, pageSize, reloadTick])

  /**
   * 切换页签时重置分页。
   * @param {'daily'|'weekly'} next 目标页签
   * @returns {void}
   */
  function changeTab(next) {
    if (next === tab) return
    setTab(next)
    setPage(1)
  }

  /**
   * 执行关键字搜索。
   * @returns {void}
   */
  function doSearch() {
    setPage(1)
    setKeyword(keywordInput.trim())
  }

  /**
   * 重置筛选条件。
   * @returns {void}
   */
  function resetFilters() {
    setFrom('')
    setTo('')
    setKeywordInput('')
    setKeyword('')
    setPage(1)
  }

  /**
   * 打开表单弹窗。
   * @param {'create'|'edit'} mode 模式
   * @param {'daily'|'weekly'} module 模块
   * @param {object} [initial] 预填数据
   * @returns {void}
   */
  function openForm(mode, module, initial) {
    setModal({ type: 'form', mode, module, initial })
  }

  /**
   * 表单提交：调用宿主保存接口，成功后刷新列表。
   * @param {object} payload 保存参数
   * @returns {Promise<void>}
   */
  async function submitForm(payload) {
    const method = modal.module === 'daily' ? 'daily.save' : 'weekly.save'
    await call(method, payload)
    showToast(`${modal.mode === 'edit' ? '编辑' : '新增'}${modal.module === 'daily' ? '日报' : '周报'}已提交`)
    setReloadTick((v) => v + 1)
  }

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / pageSize))

  return h('div', { className: 'dpr-root' },
    // 头部：标题、账号、页签、操作
    h('div', { className: 'dpr-header' },
      h('div', null,
        h('h2', { className: 'dpr-title' }, '项目汇报'),
        h('div', { className: 'dpr-sub' }, account ? `OA 账号：${account}` : '按项目查看日报 / 周报'),
      ),
      h('div', { className: 'dpr-spacer' }),
      h('div', { className: 'dpr-tabs' },
        h('button', { type: 'button', className: `dpr-tab ${tab === 'daily' ? 'active' : ''}`, onClick: () => changeTab('daily') }, '日报'),
        h('button', { type: 'button', className: `dpr-tab ${tab === 'weekly' ? 'active' : ''}`, onClick: () => changeTab('weekly') }, '周报'),
      ),
      h('button', { type: 'button', className: 'dpr-btn', onClick: () => setReloadTick((v) => v + 1) }, '刷新'),
      h('button', { type: 'button', className: 'dpr-btn primary', onClick: () => openForm('create', tab) }, `＋ 新增${tab === 'daily' ? '日报' : '周报'}`),
    ),

    // 筛选条件
    h('div', { className: 'dpr-filters' },
      h('div', { className: 'dpr-field' },
        h('label', null, '项目'),
        h('select', { className: 'dpr-select', value: projectId, onChange: (e) => { setProjectId(e.target.value); setPage(1) } },
          h('option', { value: '' }, '全部项目'),
          projects.map((p) => h('option', { key: p.pro_id, value: p.pro_id }, p.pro_name)),
        ),
      ),
      h('div', { className: 'dpr-field' },
        h('label', null, '开始日期（不填=全部）'),
        h('input', { className: 'dpr-input', type: 'date', value: from, onChange: (e) => { setFrom(e.target.value); setPage(1) } }),
      ),
      h('div', { className: 'dpr-field' },
        h('label', null, '结束日期（不填=全部）'),
        h('input', { className: 'dpr-input', type: 'date', value: to, onChange: (e) => { setTo(e.target.value); setPage(1) } }),
      ),
      h('div', { className: 'dpr-field', style: { flex: 1, minWidth: 200 } },
        h('label', null, '关键字（人/项目/正文）'),
        h('input', {
          className: 'dpr-input grow', type: 'search', value: keywordInput, placeholder: '输入关键字后回车',
          onChange: (e) => setKeywordInput(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') doSearch() },
        }),
      ),
      h('button', { type: 'button', className: 'dpr-btn', onClick: doSearch }, '搜索'),
      h('button', { type: 'button', className: 'dpr-btn', onClick: resetFilters }, '重置'),
    ),

    error ? h('div', { className: 'dpr-errorbar' }, error) : null,

    // 表格区域
    h('div', { className: 'dpr-tablewrap' },
      loading
        ? h('div', { className: 'dpr-loading' }, '加载中…')
        : data.rows.length === 0
          ? h('div', { className: 'dpr-empty' }, projectId ? '当前筛选条件下暂无记录' : '请选择项目查看报表')
          : renderTable(tab, data.rows, (item) => setModal({ type: 'detail', item })),
    ),

    // 分页
    h('div', { className: 'dpr-footer' },
      h('span', { className: 'dpr-sub' }, `共 ${data.total} 条`),
      h('div', { className: 'dpr-spacer' }),
      h('button', { type: 'button', className: 'dpr-btn', disabled: page <= 1, onClick: () => setPage((p) => Math.max(1, p - 1)) }, '上一页'),
      h('span', { className: 'dpr-sub' }, `${page} / ${totalPages}`),
      h('button', { type: 'button', className: 'dpr-btn', disabled: page >= totalPages, onClick: () => setPage((p) => Math.min(totalPages, p + 1)) }, '下一页'),
      h('select', { className: 'dpr-select', value: pageSize, onChange: (e) => { setPageSize(Number(e.target.value)); setPage(1) } },
        [20, 50, 100, 200].map((n) => h('option', { key: n, value: n }, `${n} 条/页`)),
      ),
    ),

    // 详情弹窗
    modal?.type === 'detail' ? h(DetailModal, {
      item: modal.item,
      onClose: () => setModal(null),
      onEdit: () => openForm('edit', modal.item.module, modal.item),
      onCopy: () => openForm('create', modal.item.module, { ...modal.item }),
    }) : null,

    // 表单弹窗
    modal?.type === 'form' ? h(ReportForm, {
      module: modal.module,
      mode: modal.mode,
      initial: modal.initial,
      projects,
      onSubmit: submitForm,
      onClose: () => setModal(null),
    }) : null,

    // 轻提示
    toast ? h('div', { className: `dpr-toast ${toast.kind === 'err' ? 'err' : ''}` }, toast.msg) : null,
  )
}

/**
 * 渲染表头与表体。
 * @param {'daily'|'weekly'} tab 页签
 * @param {object[]} rows 数据行
 * @param {(item:object)=>void} onRowClick 行点击回调
 * @returns {any} React 元素
 */
function renderTable(tab, rows, onRowClick) {
  const daily = tab === 'daily'
  return h('table', { className: 'dpr-table' },
    h('thead', null,
      h('tr', null,
        (daily
          ? ['日期', '填报人', '项目', '工时', '今日工作总结', '状态']
          : ['周期', '填报人', '项目', '进度', '本周完成情况', '状态']
        ).map((t) => h('th', { key: t }, t)),
      ),
    ),
    h('tbody', null,
      rows.map((it) => h('tr', { key: it.id, onClick: () => onRowClick(it) },
        h('td', { style: { whiteSpace: 'nowrap' } }, daily ? it.time : periodLabel(it.startTime, it.time)),
        h('td', { style: { whiteSpace: 'nowrap' } }, it.userName || '—'),
        h('td', { className: 'dpr-cell-ellipsis', title: it.projectName }, it.projectName || '—'),
        daily
          ? h('td', { style: { whiteSpace: 'nowrap' } }, it.hours === '' ? '—' : `${it.hours}h`)
          : h('td', { style: { whiteSpace: 'nowrap' } }, it.progress == null ? '—' : `${it.progress}%`),
        h('td', { className: 'dpr-cell-ellipsis', title: it.summary }, truncate(it.summary, 120) || '—'),
        h('td', null, h(StatusPill, { status: it.status })),
      )),
    ),
  )
}

/**
 * 详情弹窗：展示完整字段，并提供编辑 / 复制为新建。
 * @param {{item:object, onClose:()=>void, onEdit:()=>void, onCopy:()=>void}} props 属性
 * @returns {any} React 元素
 */
function DetailModal({ item, onClose, onEdit, onCopy }) {
  const daily = item.module === 'daily'
  const rows = daily
    ? [
        ['日期', item.time],
        ['填报人', item.userName],
        ['项目', item.projectName],
        ['工时', item.hours === '' ? '—' : `${item.hours} 小时`],
        ['今日工作总结', item.summary],
        ['问题', item.problem],
        ['明日计划', item.arrange],
        ['流程状态', item.status],
        ['创建时间', item.createdAt],
      ]
    : [
        ['报告周期', periodLabel(item.startTime, item.time)],
        ['填报人', item.userName],
        ['项目', item.projectName],
        ['整体进度', item.progress == null ? '—' : `${item.progress}%`],
        ['部门经理', item.manager],
        ['本周工作完成情况', item.summary],
        ['问题与风险', item.problem],
        ['下周工作计划', item.arrange],
        ['流程状态', item.status],
        ['创建时间', item.createdAt],
      ]
  return h(Modal, {
    title: `${daily ? '日报' : '周报'}详情`,
    onClose,
    footer: [
      h('button', { key: 'copy', type: 'button', className: 'dpr-btn', onClick: onCopy }, '复制为新建'),
      h('button', { key: 'edit', type: 'button', className: 'dpr-btn primary', onClick: onEdit }, '编辑'),
    ],
  }, h(DescriptionList, { rows }))
}
