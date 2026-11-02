import type { ReactNode } from 'react'

import type { PlatformUser } from './api'

/** Top bar plus content area every signed-in page shares. */
export default function Shell(props: {
  children: ReactNode
  onHome: () => void
  onSignOut: () => void
  switcher?: ReactNode
  user: PlatformUser
}) {
  return (
    <div className="shell">
      <header className="shell-bar">
        <button className="brand" type="button" onClick={props.onHome}>
          <span className="brand-mark" aria-hidden="true" />
          <span>Super Agent</span>
        </button>
        <div className="shell-user">
          {props.switcher}
          <span className="muted">{props.user.name}</span>
          <button className="ghost" type="button" onClick={props.onSignOut}>
            退出登录
          </button>
        </div>
      </header>
      <main className="shell-main">{props.children}</main>
    </div>
  )
}
