# DSH 插件：项目汇报（dsh-project-report）

在 DeepSeek Harness（DSH）Web 左侧栏新增入口「项目汇报」，点击进入后可按项目查看成员的
**日报 / 周报**表格，并支持**新增 / 编辑**报表。数据接口与 `oa-skill` 中验证过的 SEI-OA
（`oa.sczlcq.com`）契约一致。

---

## 一、功能

- **左侧栏入口**：`sidebar.panellist` 注册「项目汇报」图标，与主面板 `main` 同 key，点击即切换。
- **默认展示「全部项目」**：项目下拉默认留空 = 全部项目；开始/结束日期默认留空 = 不限日期。
- **日报页签**：日期、填报人、项目、工时、今日工作总结、状态；显示该项目**所有成员**的记录。
- **周报页签**：报告周期、填报人、项目、整体进度、本周完成情况、状态。
- **筛选**：项目、开始/结束日期、关键字（人/项目/正文）。
  - 无日期且无关键字（默认全部）时走 **OA 服务端分页**，可浏览全部记录（如全部项目日报约 5500 条）；
  - 选择日期或关键字时，宿主拉取后在内存过滤再分页。
- **详情**：点击行查看完整正文（周报含问题与风险、下周计划、部门经理等）。
- **新增 / 编辑**：表单 →「下一步：预览」→「确认提交」两步式，避免误提交。
  - 日报：工时（`DR_HOUR`，小时）。
  - 周报：整体进度百分比（`DR_HOUR`，0~100，**不是工时**），四部分正文齐全。

> 说明：OA 日报/周报是工作流模块，直接“编辑”可能被流程拦截；若编辑失败，可在详情里用
> 「复制为新建」以新增方式补录。

---

## 二、架构

```
浏览器（DSH Web Client）                     宿主（DSH Node 进程）                OA
┌───────────────────────────┐   RPC    ┌──────────────────────────┐  HTTPS  ┌──────────────┐
│ 项目汇报面板 (React)        │ ───────► │ /api/project-report 路由   │ ──────► │ oa.sczlcq.com │
│ ctx.connection.rpc.call    │          │ lib/index.js + lib/oa.js  │         │ 登录/查询/保存 │
└───────────────────────────┘          └──────────────────────────┘         └──────────────┘
```

- **宿主插件** `lib/index.js`：Cordis 插件，`inject: ['connection']`，用
  `ctx.connection.fetch.register` 注册受 DSH 浏览器认证保护的 `POST /api/project-report`。
- **OA 客户端** `lib/oa.js`：原生 `fetch` 登录（`checkCode` → `login`）、会话缓存、
  查询（`/api/sei/data/public/query`）与保存（`/api/sei/data/public/save`）。
- **客户端插件** `src/client/*` → 构建产物 `lib/client.js`：通过 `window.__ModuleLoader__.load`
  注册，`inject: ['slots','connection']`，向 `sidebar.panellist` 与 `main` 注册 UI。

之所以把 OA 访问放在宿主侧：浏览器直连 OA 会受 CORS 与登录 Cookie 限制，宿主进程可自由携带
Cookie 调用 OA，并复用 DSH 自身的认证与 Host/Origin 校验。

---

## 三、目录结构

```
dsh-plugins/project-report/
├── package.json          # 包清单：dsh.bundle.patch + dsh.client.platform=web
├── cordis.patch.yml      # 组合层：插入宿主插件，并给出 projectRoot 配置
├── lib/
│   ├── index.js          # 宿主插件（RPC 路由 + 方法分发）
│   ├── oa.js             # OA 客户端（登录/查询/保存）
│   └── client.js         # 客户端 bundle（构建产物，勿手改）
├── src/client/           # 客户端源码
│   ├── index.js          # 入口：注册 sidebar.panellist + main
│   ├── ReportPage.js     # 主面板（页签/筛选/表格/分页/详情）
│   ├── ReportForm.js     # 新增/编辑表单（含预览确认）
│   ├── api.js            # connection.rpc.call 封装
│   ├── ui.js             # 弹窗/状态徽标/描述列表
│   ├── date.js           # 日期与格式化工具
│   └── styles.js         # CSS 注入
├── scripts/
│   ├── wrap.mjs          # 把 esbuild CJS 产物包装为 __ModuleLoader__ 脚本
│   ├── test-oa.mjs       # OA 客户端连通性自测
│   ├── test-host.mjs     # 宿主插件端到端自测
│   └── test-client.mjs   # 客户端 bundle 装配自测
└── README.md
```

---

## 四、配置

宿主插件通过 `cordis.patch.yml` 的 `config` 读取：

| 配置项 | 说明 | 默认 |
|---|---|---|
| `projectRoot` | 含 OA 凭证（`.env.local`）的项目根目录 | 进程 cwd |
| `baseUrl` | OA 地址 | `https://oa.sczlcq.com` |
| `account` / `password` | OA 账号/密码（可选，覆盖 .env） | 读取环境变量或 `.env` |

凭证解析优先级：显式配置 > 进程环境变量（`OA_ACCOUNT` / `OA_PASSWORD` / `OA_BASE_URL`）
> `.env.local` / `.env`。

当前 `cordis.patch.yml` 已把 `projectRoot` 设为 `D:\code\kh-app`，直接复用该仓库 `.env.local` 中的
`OA_ACCOUNT` / `OA_PASSWORD`。登录态缓存于 `~/.dsh/integrations/project-report/session.json`，
失效时自动重新登录（也会复用 `~/.cache/oa-skill/token-*.json` 既有会话）。

---

## 五、安装 / 卸载

使用 DSH 自带的插件管理器（会写入 profile 并触发热重载）：

```powershell
# 安装（--profile web 与当前 Web GUI 的 profile 一致）
dsh plugin --profile web add "D:\code\kh-app\dsh-plugins\project-report"

# 卸载
dsh plugin --profile web remove dsh-project-report
```

安装后，若左侧栏未立即出现「项目汇报」，刷新页面（F5）或重开 GUI 即可（HMR 通常已自动加载）。

---

## 六、开发：构建客户端 bundle

修改 `src/client/*` 后需重新构建 `lib/client.js`：

```powershell
cd D:\code\kh-app\dsh-plugins\project-report
& "D:\deepseek-harness\node_modules\.bin\esbuild.CMD" src/client/index.js --bundle --format=cjs --platform=browser --target=chrome100 --external:react --outfile=scripts/.bundle.cjs
node scripts/wrap.mjs scripts/.bundle.cjs lib/client.js dsh-project-report
```

自测：

```powershell
node scripts/test-oa.mjs       # OA 连通性
node scripts/test-host.mjs     # 宿主 RPC 端到端
node scripts/test-client.mjs   # 客户端装配
```

---

## 七、宿主 RPC 方法

所有方法经 `connection.rpc.call('/api','project-report',{ method, payload })` 调用，返回 `{ok,value}`。

| method | payload | 返回 |
|---|---|---|
| `meta` | `{}` | `{ baseUrl, account, loggedIn }` |
| `auth.refresh` | `{}` | 强制重登 |
| `projects` | `{}` | `{ projects: [{pro_id,pro_name,is_audit}] }` |
| `daily.list` | `{ projectId, from, to, keyword, page, pageSize }` | `{ rows, total, page, pageSize }` |
| `weekly.list` | 同上 | 同上 |
| `daily.save` | `{ action:'add'|'edit', row }` | 保存结果摘要 |
| `weekly.save` | `{ action:'add'|'edit', row }` | 保存结果摘要 |

---

## 八、契约要点（实测）

1. **周报模块名**是 `sc_weekilyreport`（官方少一个 k），写错会静默返回空。
2. **`DR_HOUR` 语义**：日报=工时；周报=整体进度百分比（0~100）。两者不可混用。
3. **`P_NAME` 不能显式放进 `fields`**（OA 引擎会返回 `code=0 操作失败`），但查询结果会自动带上。
4. **周报四部分**：`DR_SUMMARIZE`（本周完成）、`DR_PROBLEM`（问题与风险）、`DR_ARRANGE`（下周计划，
   需协调事项以「需协调事项：…」并入）；保存需客户端生成 `DR_ID`、固定 `DR_STATUS=10` 与 `workflow` 空对象。
5. 日期范围过滤由宿主在内存完成（该查询端点对 `DR_TIME` 范围运算符支持不稳定）。

---

## 九、已知限制

- OA 工作流模块的**编辑**可能被流程拦截；失败时请用「复制为新建」。
- 每次查询按项目拉取最多约 1000 行后在内存过滤；项目记录极多时请配合日期/关键字缩小范围。
- 本插件为本地 `link:` 安装，依赖本目录存在；移动目录后需重新安装。
