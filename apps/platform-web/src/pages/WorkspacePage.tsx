import { useEffect, useState } from 'react'

import { ApiError, projectsApi } from '../api'

/** One project's Agent workspace, served by the gateway under `/p/<id>/`. */
export default function WorkspacePage(props: { projectId: string }) {
  const [missing, setMissing] = useState<null | string>(null)
  const [title, setTitle] = useState('工作区')

  useEffect(() => {
    let live = true
    projectsApi
      .list()
      .then((projects) => {
        if (!live) return
        const project = projects.find(item => item.id === props.projectId)
        if (project === undefined) {
          setMissing('项目不存在或已被删除')
          return
        }
        setMissing(null)
        setTitle(project.name)
        document.title = `${project.name} · Super Agent`
      })
      .catch((failure: unknown) => {
        if (live) setMissing(failure instanceof ApiError ? failure.message : '加载项目失败')
      })
    return () => {
      live = false
    }
  }, [props.projectId])

  if (missing !== null) {
    return <p className="error">{missing}</p>
  }

  return (
    <iframe
      className="workspace-frame"
      src={`/p/${props.projectId}/`}
      title={`${title} 工作区`}
    />
  )
}
