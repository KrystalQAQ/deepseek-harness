import { useCallback, useEffect, useState } from 'react'

import type { DshProject } from '../api'
import { ApiError, projectsApi } from '../api'
import { navigate } from '../router'

const STATUS_LABEL: Record<DshProject['status'], string> = {
  failed: '异常',
  idle: '空闲',
  running: '运行中',
  starting: '启动中',
}

/** Project registry: create a workspace, open it, remove it. */
export default function ProjectsPage() {
  const [creating, setCreating] = useState(false)
  const [dir, setDir] = useState('')
  const [error, setError] = useState<null | string>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [projects, setProjects] = useState<DshProject[]>([])

  const load = useCallback(async () => {
    try {
      setProjects(await projectsApi.list())
      setError(null)
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : '加载项目失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    document.title = 'AI 项目 · Super Agent'
    void load()
  }, [load])

  const create = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (pending) return
      setPending(true)
      try {
        await projectsApi.create({ dir: dir.trim(), name: name.trim() })
        setName('')
        setDir('')
        setCreating(false)
        await load()
      } catch (failure) {
        setError(failure instanceof ApiError ? failure.message : '创建项目失败')
      } finally {
        setPending(false)
      }
    },
    [dir, load, name, pending],
  )

  const remove = useCallback(
    async (project: DshProject) => {
      if (!window.confirm(`删除项目「${project.name}」？其 Agent 进程会立即停止。`)) return
      try {
        await projectsApi.remove(project.id)
        await load()
      } catch (failure) {
        setError(failure instanceof ApiError ? failure.message : '删除项目失败')
      }
    },
    [load],
  )

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>项目中心</h1>
        </div>
        <div className="page-actions">
          <button className="ghost" onClick={() => void load()} type="button">
            刷新
          </button>
          <button className="primary" onClick={() => setCreating(open => !open)} type="button">
            {creating ? '取消' : '新建项目'}
          </button>
        </div>
      </div>

      {error === null ? null : <p className="error">{error}</p>}

      {creating ? (
        <form className="card create" onSubmit={event => void create(event)}>
          <label className="field">
            <span>项目名称</span>
            <input onChange={event => setName(event.target.value)} placeholder="例如：支付服务" value={name} />
          </label>
          <label className="field grow">
            <span>项目目录</span>
            <input
              onChange={event => setDir(event.target.value)}
              placeholder="D:\work\payments"
              value={dir}
            />
          </label>
          <button className="primary" disabled={pending || name.trim() === '' || dir.trim() === ''} type="submit">
            {pending ? '创建中…' : '创建'}
          </button>
        </form>
      ) : null}

      <div className="card table">
        <div className="row table-head">
          <span>项目</span>
          <span>目录</span>
          <span>端口</span>
          <span>状态</span>
          <span>操作</span>
        </div>
        {loading ? (
          <p className="empty">正在加载…</p>
        ) : projects.length === 0 ? (
          <p className="empty">还没有项目。新建一个项目，把某个目录交给 Agent。</p>
        ) : (
          projects.map(project => (
            <div className="row" key={project.id}>
              <span className="strong">{project.name}</span>
              <span className="mono muted ellipsis" title={project.dir}>
                {project.dir}
              </span>
              <span className="mono">{project.port}</span>
              <span>
                <span className={`tag ${project.status}`} title={project.statusDetail ?? ''}>
                  {STATUS_LABEL[project.status]}
                </span>
              </span>
              <span className="row-actions">
                <button className="primary small" onClick={() => navigate(`/project/${project.id}`)} type="button">
                  进入
                </button>
                <button className="danger small" onClick={() => void remove(project)} type="button">
                  删除
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
