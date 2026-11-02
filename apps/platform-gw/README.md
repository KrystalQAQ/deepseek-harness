# dsh-gateway

把 DeepSeek Harness 当成「每项目一个无头页面进程」跑起来的 NestJS 网关。

网关**就是平台后端**：账号、登录验证码、令牌都在这里，Java 后端已退出这条链路。它给 shell 发 Bearer token，再给 iframe 里的 dsh 页面发同域会话 cookie（iframe 带不了自定义请求头）。

## 它做什么

- 平台接口（前端登录页原样使用）：`POST /api/sei/public/checkCode`（SVG 验证码，答案只存在签名 cookie 里）、`POST /api/sei/public/login`（校验验证码 + 账号密码，下发 `gw_session` 并返回 `{code:1,data:{token}}`）、`POST /api/sei/user/public/getUserInfo`、`POST /api/sei/user/public/getMenu`、`POST /api/sei/user/online`、`POST /api/sei/logout`。返回值遵循平台信封约定：`code >= 1` 为成功。
- `POST /api/dsh/session` 用平台 token 换网关会话 cookie（`gw_session`，7 天）。
- `GET/POST/DELETE /api/dsh/projects` 管理项目：登记目录、分配端口、删除时停进程。项目落在 MySQL，按平台用户隔离。
- `GET /api/dsh/health` 探活，含 MySQL 连通性（不可用返回 `degraded`）。
- `GET /p/<id>/*` 反代到该项目的 dsh Host：剥前缀、保留浏览器 `Host`、把 Host 下发的 `Path=/` cookie 改写成 `Path=/p/<id>/`、导航遇到 `401` 时自动补 launch token 再跳一次。**只服务项目所有者**。
- WebSocket `upgrade` 同样隧道转发（`/p/<id>/api/remote.mux`），同样校验归属。
- 每个项目一个子进程：`dsh --profile web --host 127.0.0.1 --port <自身端口> --public-url <origin>/p/<id>/ --trusted-host <hostname>`，`DSH_HOME=data/homes/<id>`，`cwd=项目目录`。

## 数据层

MySQL + TypeORM，实体在 `src/entities/entities.ts`，迁移在 `src/database/migrations/`。`synchronize` 永久关闭：结构变更只走迁移。

| 表 | 用途 |
| --- | --- |
| `dsh_user` | 账号：id、登录名（唯一）、显示名、scrypt(MD5) 密码哈希、状态 |
| `dsh_project` | 项目登记：id、名称、目录（唯一）、端口（唯一）、所有者、状态机、最近就绪时间 |
| `dsh_audit_log` | 追加写入：创建、删除、启动、停止、失败，带操作者与结构化明细 |

首次启动且 `dsh_user` 为空时，自动创建 `admin`，密码取 `GW_ADMIN_PASSWORD`。密码哈希的是浏览器发来的 MD5 摘要，明文不会到达服务端。

状态机：`idle → starting → running`，失败进 `failed` 并记录原因；网关重启后表里仍能解释每个项目最后发生了什么。

建库（一次性，用有建库权限的账号执行）：

```sql
CREATE DATABASE dsh_platform DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'dsh'@'localhost' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON dsh_platform.* TO 'dsh'@'localhost';
```

迁移：

```bash
pnpm --filter @sei/dsh-gateway db:migrate   # 应用
pnpm --filter @sei/dsh-gateway db:show      # 查看状态
pnpm --filter @sei/dsh-gateway db:revert    # 回滚最后一次
```

网关启动时默认也会自动跑迁移（`GW_DB_MIGRATIONS=false` 可关闭）。

## 运行

```bash
pnpm --filter @sei/dsh-gateway build
pnpm --filter @sei/dsh-gateway start    # 默认 127.0.0.1:8080
```

前端在 `apps/web-antd`：`pnpm --filter @vben/web-antd dev`（5666）。Vite 把 `/api` 与 `/p` 两条前缀都代理到网关。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `GW_PORT` | `8080` | 网关端口 |
| `GW_HOST` | `127.0.0.1` | 绑定地址 |
| `GW_PUBLIC_ORIGIN` | `http://127.0.0.1:5666` | 浏览器看到的源，决定 `--public-url` 与 `--trusted-host` |
| `GW_DATA_DIR` | `apps/dsh-gateway/data` | 会话密钥、各项目 `DSH_HOME`、Host 日志（不入库，不受版本管理） |
| `GW_DSH_ENTRY` | 空（用 PATH 里的 `dsh`） | 指向 `deepseek-harness/apps/cli/lib/bin.js` 时用当前 node 启动 |
| `GW_DSH_BASE_PORT` | `3200` | 首个 Host 端口 |
| `GW_ADMIN_PASSWORD` | `admin123456`（仅首次建号用） | 初始管理员密码；部署时必须改掉，否则登录页对所有人敞开 |
| `GW_DB_HOST` | `127.0.0.1` | MySQL 地址 |
| `GW_DB_PORT` | `3306` | MySQL 端口 |
| `GW_DB_USER` | `dsh` | 只对 `GW_DB_NAME` 有权限的账号 |
| `GW_DB_PASSWORD` | 无（**必填**） | 缺失时网关启动即失败，不会静默降级 |
| `GW_DB_NAME` | `dsh_platform` | 库名 |
| `GW_DB_MIGRATIONS` | `true` | 启动时是否应用待执行迁移 |

前端可用 `VITE_GATEWAY_TARGET` 覆盖 `/api` 与 `/p` 的代理目标（默认 `http://127.0.0.1:8080`）。

## 登录链路

1. 浏览器打开 `/dsh/projects`，Vben 的守卫发现没有平台 token，跳 `/auth/login`。
2. 登录页取验证码图片，提交用户名、密码、验证码；网关校验签名 cookie 里的验证码与 `dsh_user` 里的哈希。
3. 成功后同一个响应做两件事：下发 `gw_session`（给 iframe 用），并返回 Bearer token（给前端请求头用）。
4. dsh 页面调用 `ensureGatewaySession(token)`：先试 `GET /api/dsh/me`，401 才 `POST /api/dsh/session { token }`；正常情况下第 3 步的 cookie 已经让 `/me` 直接通过。
5. 此后 `/p/<id>/*` 带 cookie 直通，iframe 不需要任何请求头。

## 前端

- `apps/web-antd/src/views/dsh/projects.vue` 项目列表 + 新建，`ensureGatewaySession` 在挂载时换会话。
- `apps/web-antd/src/views/dsh/project.vue` 项目页，会话就绪后才挂 `iframe` 指向 `/p/<id>/`。
- 路由在 `src/router/access.ts` 的 `localRoutes` 里（和 `Workbench` 同一套机制），权限仍由平台菜单守卫把关。

## 安全边界

- dsh Host 只监听 loopback，唯一的身份校验是每进程随机 launch token 加网关会话。
- 网关不能改浏览器 `Host`：Host 用它绑定 cookie 并做 fencing。
- 代理必须剥掉 `/p/<id>` 前缀，否则 Host 直接 404。
- `/p/<id>/` 与 WebSocket 升级都要求会话用户就是项目所有者，否则 401/断开：Host 只认「某个浏览器」，不认「哪个用户」，归属判定必须在网关做。
- 生产反代要保留 `Upgrade`，并把 `Set-Cookie` 的 `Path=/` 改到挂载前缀下（HTTPS 外腿还要补 `Secure`）。
- 平台令牌与会话 cookie 都由网关的 `data/session.secret` 签名，令牌不下发到浏览器以外的地方；`GW_DB_PASSWORD` 只从环境读取。
- 验证码答案不出现在任何响应里，cookie 只带它的签名副本，客户端读不出正确答案。

## 还没做

- 项目共享/协作（现在项目只对创建者的 `_UID` 可见）。
- Host 空闲回收。
- 平台菜单里的入口（现在靠本地路由注入）。
