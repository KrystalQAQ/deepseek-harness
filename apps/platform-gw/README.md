# dsh-platform-gateway

把 DeepSeek Harness 当成「每项目一个无头页面进程」跑起来的 NestJS 网关，配合 `apps/platform-web` 组成平台。

网关就是平台后端：账号、验证码、会话都在这里，Java 后端不在这条链路上。浏览器拿 `gw_session` cookie 访问嵌入的 dsh 页面，平台接口自己带 cookie。

## 它做什么

- `GET /api/auth/captcha` 返回 SVG 验证码，答案只存在签名 cookie（`gw_captcha`）里。
- `POST /api/auth/login { username, password, captcha }` 校验后下发 `gw_session`，返回 `{ data: { token, user } }`。
- `GET /api/auth/me`、`POST /api/auth/logout`。
- `GET/POST /api/dsh/projects`、`DELETE /api/dsh/projects/:id`：登记目录、分配端口、删除时停进程；项目落在 MySQL，按用户隔离。
- `GET /api/dsh/health`：含 MySQL 连通性，不可用返回 `degraded`。
- `GET /p/<id>/*` 反代到该项目的 dsh Host：剥前缀、保留浏览器 `Host`、把 Host 下发的 `Path=/` cookie 改写成 `Path=/p/<id>/`、导航遇到 `401` 时补 launch token 再跳一次；WebSocket `upgrade` 同样隧道转发。两者都只服务项目所有者。
- 静态托管 `apps/platform-web/dist`，其余 GET 回落 `index.html`。

每个项目一个子进程：

```text
dsh --profile web --patch data/patches/<id>.yml --no-open \
    --host 127.0.0.1 --port <端口> \
    --public-url <origin>/p/<id>/ --trusted-host <hostname>
```

`cwd` 是项目目录，`DSH_HOME` 是 `data/homes/<id>`，启动时把 `GW_PROFILE_SOURCE`（默认 `~/.dsh`）里的 `.credentials.yaml`、`.env`、`settings.yaml` 复制进去，复制不覆盖已有文件。

## 每项目的组合层

网关每次启动 Host 前重写 `data/patches/<id>.yml`，用 cordis patch 把部署约定固定下来：

| 条目 | 配置 | 作用 |
| --- | --- | --- |
| `workspace-controller` | `defaultDirectory: <项目目录>` | 侧栏只打开该项目目录，不出现别的工作区 |
| `agent-default-model` | `provider`、`model` | 固定默认模型 |
| `ui-settings-general` | `welcomeNoticeVersion` | 关掉首次引导弹窗 |
| `ui-brand-official` | `title: <项目名>` | 侧栏品牌显示项目名 |
| `ui-workspace` | `sessionsOnly: true` | 只列会话，不显示工作区行 |

### 默认插件

`GW_PLUGINS` 是一个 JSON 数组，每一项插入一个插件条目，对所有项目生效。本地目录形式的插件在项目 profile 首次就绪后装上：写 `dependencies`、建 `node_modules` junction、把包名加进 `dsh.profile.bundles`，并把 insert 条目写进 profile 自己的 `cordis.patch.yml`——插件管理器的「已安装插件」开关读的就是 `dsh.profile.bundles`，只放在启动叠层里的插件会显示为关闭。

```json
[
  {
    "id": "project-report",
    "name": "file:///D:/deepseek-harness/apps/dsh-plugins/project-report/lib/index.js",
    "config": { "projectRoot": "{{dir}}" }
  }
]
```

- `id` 是 Loader 里的稳定标识，同名只注册一次。
- `name` 是模块说明符，按 profile 目录解析。`file:///` URL 不需要安装；裸包名（如 `dsh-project-report`）必须能从 `<DSH_HOME>/profiles/node_modules` 解析到，即先用 `dsh plugin --profile web add <路径或包名>` 装进该 home，或放一个 junction。
- `config` 的值里 `{{dir}}` 会替换成该项目的目录，其余原样写入。
- 只想给某个项目加插件，就在它自己的 `data/patches/<id>.yml` 里加 `- insert:` 段；网关下次重写会覆盖，所以要么改 `GW_PLUGINS`，要么在网关生成的清单里扩展。

## 数据层

MySQL + TypeORM，实体在 `src/entities/entities.ts`，迁移在 `src/database/migrations/`。`synchronize` 永久关闭：结构变更只走迁移。

| 表 | 用途 |
| --- | --- |
| `dsh_user` | 账号：id、登录名（唯一）、显示名、scrypt 密码哈希、状态 |
| `dsh_project` | 项目登记：id、名称、目录（唯一）、端口（唯一）、所有者、状态机、最近就绪时间 |
| `dsh_audit_log` | 追加写入：创建、删除、启动、停止、失败，带操作者与结构化明细 |

首次启动且 `dsh_user` 为空时自动创建 `admin`，密码取 `GW_ADMIN_PASSWORD`；密码用 scrypt 保存，明文不落库。

状态机：`idle → starting → running`，失败进 `failed` 并记录原因。

建库（一次性，用有建库权限的账号执行）：

```sql
CREATE DATABASE dsh_platform DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'dsh'@'localhost' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON dsh_platform.* TO 'dsh'@'localhost';
```

迁移：

```bash
pnpm --filter @deepseek-ai/dsh-platform-gateway db:migrate
pnpm --filter @deepseek-ai/dsh-platform-gateway db:show
pnpm --filter @deepseek-ai/dsh-platform-gateway db:revert
```

启动时默认自动跑迁移（`GW_DB_MIGRATIONS=false` 关闭）。

## 运行

```bash
pnpm --filter @deepseek-ai/dsh-platform-web build
pnpm --filter @deepseek-ai/dsh-platform-gateway build
pnpm --filter @deepseek-ai/dsh-platform-gateway start   # 默认 127.0.0.1:8080
```

平台页由网关静态托管，改前端后重新 `build` 即可；改 `packages/client/*` 下的插件要 `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc -b tsconfig.client.json` 加对应包的 `bundle`，再重启该项目的 Host。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `GW_PORT` | `8080` | 网关端口 |
| `GW_HOST` | `127.0.0.1` | 绑定地址 |
| `GW_PUBLIC_ORIGIN` | `http://127.0.0.1:8080` | 浏览器看到的源，决定 `--public-url` 与 `--trusted-host` |
| `GW_DATA_DIR` | `apps/platform-gw/data` | 会话密钥、各项目 `DSH_HOME`、patch（不入库） |
| `GW_WEB_DIR` | `apps/platform-web/dist` | 平台页构建产物 |
| `GW_DSH_ENTRY` | 空（用 PATH 里的 `dsh`） | 指向 `apps/cli/lib/bin.js` 时用当前 node 启动 |
| `GW_DSH_BASE_PORT` | `3200` | 首个 Host 端口 |
| `GW_PROFILE_SOURCE` | `~/.dsh` | 复制模型凭证与设置到每个项目 home；空则跳过 |
| `GW_PLUGINS` | 空 | 每项目默认插件，JSON 数组，见上 |
| `GW_ADMIN_PASSWORD` | 无 | 首个管理员密码，仅初始化那一次生效；部署时必须改 |
| `GW_DB_HOST` / `GW_DB_PORT` | `127.0.0.1` / `3306` | MySQL 地址 |
| `GW_DB_USER` / `GW_DB_NAME` | `dsh` / `dsh_platform` | 账号与库名 |
| `GW_DB_PASSWORD` | 无（**必填**） | 缺失时启动即失败，不静默降级 |
| `GW_DB_MIGRATIONS` | `true` | 启动时是否应用待执行迁移 |
| `GW_LLM_API_KEY` / `DEEPSEEK_API_KEY` | 空 | 透传给 Host 的模型凭证 |
| `GW_LLM_BASE_URL` / `DEEPSEEK_BASE_URL` | 空 | 兼容端点 |
| `GW_LLM_MODEL` | `deepseek-flash` | 默认模型 |
| `GW_LLM_PROVIDER` | `deepseek-official` | 默认 provider |

## 安全边界

- dsh Host 只监听 loopback，身份校验只有每进程随机 launch token 加网关会话。
- 网关不改浏览器 `Host`：Host 用它绑定 cookie 并做 fencing。
- 代理必须剥掉 `/p/<id>` 前缀，否则 Host 直接 404。
- `/p/<id>/` 与 WebSocket 升级都要求会话用户就是项目所有者，否则 401/断开：Host 只认「某个浏览器」，归属判定必须在网关做。
- 生产反代要保留 `Upgrade`，并把 `Set-Cookie` 的 `Path=/` 改到挂载前缀下（HTTPS 外腿补 `Secure`）。
- 会话与验证码都由 `data/session.secret` 签名；验证码答案不出现在任何响应里。

## 还没做

- 项目共享与协作（项目只对创建者可见）。
- Host 空闲回收。
- 插件配置的平台界面（现在只能改 `GW_PLUGINS` 后重启）。
