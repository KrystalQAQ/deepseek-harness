import { useCallback, useEffect, useState } from 'react'

import type { PlatformUser } from './api'
import { ApiError, authApi, projectsApi, type DshProject } from './api'
import { navigate, usePathname } from './router'
import LoginPage from './pages/LoginPage'
import ProjectsPage from './pages/ProjectsPage'
import WorkspacePage from './pages/WorkspacePage'
import Shell from './Shell'
import './styles.css'

/** Session state: unknown while the first `/me` runs. */
type Session = 'anonymous' | 'loading' | PlatformUser

export default function App() {
  const pathname = usePathname()
  const [session, setSession] = useState<Session>('loading')
  const [projects, setProjects] = useState<DshProject[]>([])

  const signedIn = typeof session === 'object'

  useEffect(() => {
    if (!signedIn) return
    let live = true
    projectsApi
      .list()
      .then((list) => {
        if (live) setProjects(list)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [signedIn, pathname])

  useEffect(() => {
    let live = true
    authApi
      .me()
      .then((user) => {
        if (live) setSession(user)
      })
      .catch((error: unknown) => {
        if (!live) return
        if (!(error instanceof ApiError && error.status === 401)) console.error(error)
        setSession('anonymous')
      })
    return () => {
      live = false
    }
  }, [])

  const signOut = useCallback(async () => {
    await authApi.logout().catch(() => undefined)
    setSession('anonymous')
    navigate('/login', { replace: true })
  }, [])

  if (session === 'loading') {
    return <div className="boot">正在加载…</div>
  }

  if (session === 'anonymous') {
    return <LoginPage onSignedIn={(user) => {
      setSession(user)
      navigate('/projects', { replace: true })
    }} />
  }

  const workspace = /^\/project\/([^/]+)\/?$/.exec(pathname)
  const currentProject = workspace === null ? undefined : workspace[1]

  return (
    <Shell
      user={session}
      onSignOut={signOut}
      onHome={() => navigate('/projects')}
      switcher={
        currentProject === undefined ? undefined : (
          <label className="switcher">
            <span>切换项目</span>
            <select
              onChange={event => navigate(`/project/${event.target.value}`)}
              value={currentProject}
            >
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        )
      }
    >
      {currentProject === undefined ? <ProjectsPage /> : <WorkspacePage projectId={currentProject} />}
    </Shell>
  )
}
