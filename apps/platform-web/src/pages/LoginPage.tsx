import { useCallback, useEffect, useState } from 'react'

import type { PlatformUser } from '../api'
import { ApiError, authApi } from '../api'

/** Sign-in form: account, password, and the drawn captcha. */
export default function LoginPage(props: { onSignedIn: (user: PlatformUser) => void }) {
  const [captchaUrl, setCaptchaUrl] = useState(() => authApi.captchaUrl())
  const [captcha, setCaptcha] = useState('')
  const [error, setError] = useState<null | string>(null)
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [username, setUsername] = useState('')

  useEffect(() => {
    document.title = '登录 · Super Agent'
  }, [])

  const refreshCaptcha = useCallback(() => {
    setCaptchaUrl(authApi.captchaUrl())
    setCaptcha('')
  }, [])

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (pending) return
      setPending(true)
      setError(null)
      try {
        const result = await authApi.login({ captcha, password, username })
        props.onSignedIn(result.user)
      } catch (failure) {
        const message = failure instanceof ApiError ? failure.message : '网络异常，请稍后重试'
        setError(message)
        setPassword('')
        refreshCaptcha()
      } finally {
        setPending(false)
      }
    },
    [captcha, password, pending, props, refreshCaptcha, username],
  )

  return (
    <div className="login">
      <form className="login-card" onSubmit={event => void submit(event)}>
        <div className="login-head">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Super Agent</h1>
          </div>
        </div>

        <label className="field">
          <span>账号</span>
          <input
            autoComplete="username"
            autoFocus
            onChange={event => setUsername(event.target.value)}
            placeholder="请输入账号"
            value={username}
          />
        </label>

        <label className="field">
          <span>密码</span>
          <input
            autoComplete="current-password"
            onChange={event => setPassword(event.target.value)}
            placeholder="请输入密码"
            type="password"
            value={password}
          />
        </label>

        <label className="field">
          <span>验证码</span>
          <div className="captcha-row">
            <input
              autoComplete="off"
              maxLength={4}
              onChange={event => setCaptcha(event.target.value.trim())}
              placeholder="4 位字符"
              value={captcha}
            />
            <button className="captcha" onClick={refreshCaptcha} title="换一张" type="button">
              <img alt="验证码" src={captchaUrl} />
            </button>
          </div>
        </label>

        {error === null ? null : <p className="error">{error}</p>}

        <button className="primary" disabled={pending} type="submit">
          {pending ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  )
}
