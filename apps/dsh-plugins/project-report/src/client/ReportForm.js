/**
 * 新增 / 编辑报表弹窗表单。
 *
 * 关键点（对齐 oa-skill 实测契约）：
 * - 日报 DR_HOUR 是“工时”；周报 DR_HOUR 是“整体进度百分比”，二者不可混用。
 * - 周报必须写全四部分：DR_SUMMARIZE / DR_PROBLEM / DR_ARRANGE（需协调事项并入 DR_ARRANGE）。
 * - 提交采用“先预览、再确认提交”的两步式，避免误提交。
 * - 编辑受 OA 工作流限制，失败时给出“复制为新建”的回退建议。
 */
import * as React from 'react'
import { Modal } from './ui.js'
import { mondayOf, sundayOf, todayStr } from './date.js'

const h = React.createElement

/**
 * 根据模块与模式生成初始表单值。
 * @param {'daily'|'weekly'} module 模块
 * @param {object} [initial] 预填数据（编辑时）
 * @returns {object} 表单值
 */
function initialValues(module, initial) {
  if (module === 'weekly') {
    return {
      DR_ID: initial?.id || '',
      P_ID: initial?.projectId || '',
      startDate: initial?.startTime || mondayOf(todayStr()),
      endDate: initial?.time || sundayOf(todayStr()),
      progress: initial?.progress ?? 50,
      manager: initial?.manager || '',
      summary: initial?.summary || '',
      problem: initial?.problem || '',
      arrange: initial?.arrange || '',
      coordination: '无',
      is_audit: '否',
    }
  }
  return {
    DR_ID: initial?.id || '',
    P_ID: initial?.projectId || '',
    DR_TIME: initial?.time || todayStr(),
    DR_HOUR: initial?.hours ?? 7,
    summary: initial?.summary || '',
    problem: initial?.problem || '无。',
    arrange: initial?.arrange || '',
    is_audit: '否',
  }
}

/**
 * 表单字段小组件。
 * @param {{label:string, full?:boolean, children:any}} props 属性
 * @returns {any} React 元素
 */
function Field({ label, full, children }) {
  return h('div', { className: full ? 'full' : undefined },
    h('label', null, label),
    children,
  )
}

/**
 * 报表表单弹窗。
 * @param {object} props 属性
 * @param {'daily'|'weekly'} props.module 模块
 * @param {'create'|'edit'} props.mode 模式
 * @param {object} [props.initial] 编辑时的预填数据
 * @param {Array<{pro_id:string,pro_name:string}>} props.projects 项目列表
 * @param {(payload:object)=>Promise<any>} props.onSubmit 提交回调（返回宿主保存结果）
 * @param {()=>void} props.onClose 关闭回调
 * @returns {any} React 元素
 */
export function ReportForm({ module, mode, initial, projects, onSubmit, onClose }) {
  const [values, setValues] = React.useState(() => initialValues(module, initial))
  const [step, setStep] = React.useState('edit') // 'edit' | 'preview'
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')

  /**
   * 更新单个字段。
   * @param {string} key 字段名
   * @param {any} value 值
   * @returns {void}
   */
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e?.target ? e.target.value : e }))
  const setCheckedValue = (key, value) => setValues((v) => ({ ...v, [key]: value }))

  /**
   * 校验必填项，返回错误信息（空串表示通过）。
   * @returns {string} 错误信息
   */
  function validate() {
    if (!values.P_ID) return '请选择项目'
    if (module === 'daily') {
      if (!values.DR_TIME) return '请选择日期'
      if (!values.summary.trim()) return '请填写今日工作总结'
      if (!(Number(values.DR_HOUR) > 0)) return '工时需大于 0'
    } else {
      if (!values.startDate || !values.endDate) return '请选择报告周期'
      if (values.endDate < values.startDate) return '周期结束日不能早于开始日'
      const p = Number(values.progress)
      if (!Number.isFinite(p) || p < 0 || p > 100) return '整体进度需为 0~100 的整数百分比'
      if (!values.summary.trim()) return '请填写本周工作完成情况'
    }
    return ''
  }

  /**
   * 进入预览步骤。
   * @returns {void}
   */
  function toPreview() {
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setStep('preview')
  }

  /**
   * 确认提交。
   * @returns {Promise<void>}
   */
  async function doSubmit() {
    setSubmitting(true)
    setError('')
    try {
      const payload = module === 'daily'
        ? {
            action: mode === 'edit' ? 'edit' : 'add',
            row: {
              DR_ID: values.DR_ID || undefined,
              DR_TIME: values.DR_TIME,
              DR_HOUR: Number(values.DR_HOUR),
              P_ID: values.P_ID,
              is_audit: values.is_audit,
              DR_SUMMARIZE: values.summary,
              DR_PROBLEM: values.problem,
              DR_ARRANGE: values.arrange,
            },
          }
        : {
            action: mode === 'edit' ? 'edit' : 'add',
            row: {
              DR_ID: values.DR_ID || undefined,
              P_ID: values.P_ID,
              progress: Number(values.progress),
              startDate: values.startDate,
              endDate: values.endDate,
              manager: values.manager,
              summary: values.summary,
              problem: values.problem,
              arrange: values.arrange,
              coordination: values.coordination,
              is_audit: values.is_audit,
            },
          }
      await onSubmit(payload)
      onClose()
    } catch (e) {
      setError(e?.message || String(e))
      setStep('edit')
    } finally {
      setSubmitting(false)
    }
  }

  const label = module === 'daily' ? '日报' : '周报'
  const title = `${mode === 'edit' ? '编辑' : '新增'}${label}`

  // ---- 预览步骤 ----
  if (step === 'preview') {
    const rows = module === 'daily'
      ? [
          ['类型', '日报'],
          ['项目', projectName(projects, values.P_ID)],
          ['日期', values.DR_TIME],
          ['工时', `${values.DR_HOUR} 小时`],
          ['今日工作总结', values.summary],
          ['问题', values.problem],
          ['明日计划', values.arrange || '—'],
        ]
      : [
          ['类型', '周报'],
          ['项目', projectName(projects, values.P_ID)],
          ['报告周期', `${values.startDate} ~ ${values.endDate}`],
          ['整体进度', `${values.progress}%`],
          ['部门经理', values.manager || '—'],
          ['本周工作完成情况', values.summary],
          ['问题与风险', values.problem || '—'],
          ['下周工作计划', values.arrange || '—'],
          ['需协调事项', values.coordination || '无'],
        ]
    return h(Modal, {
      title: `${title} · 提交预览`,
      onClose,
      footer: [
        h('button', { key: 'back', type: 'button', className: 'dpr-btn', onClick: () => setStep('edit'), disabled: submitting }, '返回修改'),
        h('button', { key: 'ok', type: 'button', className: 'dpr-btn primary', onClick: doSubmit, disabled: submitting }, submitting ? '提交中…' : '确认提交'),
      ],
    },
      h('p', { className: 'dpr-hint' }, '请核对以下内容，确认无误后点击“确认提交”。'),
      error ? h('div', { className: 'dpr-errorbar', style: { margin: '0 0 10px' } }, error) : null,
      h('dl', { className: 'dpr-dl' },
        rows.map(([k, v], i) => [
          h('dt', { key: `k${i}` }, k),
          h('dd', { key: `v${i}` }, (v === '' || v == null) ? '—' : v),
        ]),
      ),
    )
  }

  // ---- 编辑步骤 ----
  return h(Modal, {
    title,
    onClose,
    footer: [
      h('button', { key: 'cancel', type: 'button', className: 'dpr-btn', onClick: onClose, disabled: submitting }, '取消'),
      h('button', { key: 'next', type: 'button', className: 'dpr-btn primary', onClick: toPreview, disabled: submitting }, '下一步：预览'),
    ],
  },
    mode === 'edit'
      ? h('p', { className: 'dpr-hint' }, '提示：OA 为工作流模块，直接编辑可能被流程拦截；若提交失败，可改用“复制为新建”。')
      : null,
    error ? h('div', { className: 'dpr-errorbar', style: { margin: '0 0 10px' } }, error) : null,
    h('div', { className: 'dpr-form' },
      h(Field, { label: '项目' },
        h('select', { className: 'dpr-select', value: values.P_ID, onChange: set('P_ID') },
          h('option', { value: '' }, '请选择项目'),
          projects.map((p) => h('option', { key: p.pro_id, value: p.pro_id }, p.pro_name)),
        ),
      ),
      module === 'daily'
        ? h(Field, { label: '日期' }, h('input', { className: 'dpr-input', type: 'date', value: values.DR_TIME, onChange: set('DR_TIME') }))
        : h(Field, { label: '周期开始（周一）' }, h('input', { className: 'dpr-input', type: 'date', value: values.startDate, onChange: set('startDate') })),
      module === 'daily'
        ? h(Field, { label: '工时（小时）' }, h('input', { className: 'dpr-input', type: 'number', min: 0, step: 0.5, value: values.DR_HOUR, onChange: set('DR_HOUR') }))
        : h(Field, { label: '周期结束' }, h('input', { className: 'dpr-input', type: 'date', value: values.endDate, onChange: set('endDate') })),
      module === 'weekly'
        ? h(Field, { label: '整体进度（0~100%）' }, h('input', { className: 'dpr-input', type: 'number', min: 0, max: 100, value: values.progress, onChange: set('progress') }))
        : null,
      module === 'weekly'
        ? h(Field, { label: '部门经理' }, h('input', { className: 'dpr-input', value: values.manager, onChange: set('manager') }))
        : null,
      h(Field, { label: module === 'daily' ? '今日工作总结' : '本周工作完成情况', full: true },
        h('textarea', { value: values.summary, onChange: set('summary') }),
      ),
      h(Field, { label: module === 'daily' ? '问题' : '问题与风险', full: true },
        h('textarea', { value: values.problem, onChange: set('problem') }),
      ),
      h(Field, { label: module === 'daily' ? '明日计划（可选）' : '下周工作计划', full: true },
        h('textarea', { value: values.arrange, onChange: set('arrange') }),
      ),
      module === 'weekly'
        ? h(Field, { label: '需协调事项（无则填“无”）', full: true },
            h('textarea', { value: values.coordination, onChange: set('coordination') }))
        : null,
    ),
  )
}

/**
 * 根据项目 id 查找项目名称。
 * @param {Array<{pro_id:string,pro_name:string}>} projects 项目列表
 * @param {string} id 项目 id
 * @returns {string} 项目名称或 id
 */
function projectName(projects, id) {
  const found = (projects || []).find((p) => p.pro_id === id)
  return found ? found.pro_name : id
}
