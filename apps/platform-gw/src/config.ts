import path from 'node:path'
import { homedir } from 'node:os'

/** Deployment-varying gateway settings, resolved once at boot. */
export interface GatewayConfig {
  /** Loopback address the gateway binds; the Hosts it spawns bind the same interface. */
  host: string
  /** Gateway port. The shell's dev server proxies /api/dsh and /p here. */
  port: number
  /** Browser-visible origin that serves the shell and mounts /p/<id>/. */
  publicOrigin: string
  /** Root for the project registry, the session secret, and per-project DSH homes. */
  dataDir: string
  /** Executable that starts one Host per project. */
  dshCommand: string
  /** Arguments placed before the Host's own flags. */
  dshPrefixArgs: string[]
  /** First loopback port handed to a Host. */
  dshBasePort: number
  /** Minutes without a request after which a project Host is stopped; 0 keeps it running. */
  hostIdleMinutes: number
  /** Built shell assets served at the origin root. */
  webDir: string
  /**
   * A trusted DSH home whose model setup is copied into each new project home:
   * `.credentials.yaml` (provider keys), `.env`, and `settings.yaml` (chosen
   * model and preferences). Empty disables the copy.
   */
  profileSource: string
  /** Model credentials and default selection handed to every Host. */
  llm: LlmConfig
  /** Extra plugins every project Host loads, in overlay order. */
  plugins: PluginEntry[]
  /** 首个人工账号的设置。 */
  auth: {
    /**
     * 用户表为空时给首个管理员设置的密码；仅在初始化那一次生效。
     * 部署时必须改掉，否则任何能访问登录页的人都能拿到管理员账号。
     */
    adminPassword: string
  }
  /**MySQL connection used for the project registry and the audit log. */
  database: DatabaseConfig
}

/** One MySQL endpoint; every field is required so a misconfigured deployment fails at boot. */
export interface DatabaseConfig {
  /** Host name or address. */
  host: string
  /** TCP port. */
  port: number
  /** User with rights on DatabaseConfig.name only. */
  user: string
  /** Password for DatabaseConfig.user. */
  password: string
  /** Schema holding the dsh tables. */
  name: string
  /** Whether the gateway applies pending migrations on boot. */
  runMigrations: boolean
}

/** Provider credentials every spawned Host inherits, plus the model a new session starts on. */
export interface LlmConfig {
  /** DeepSeek API key; without it the picker offers no model at all. */
  apiKey?: string
  /** OpenAI-compatible endpoint override, for gateways and self-hosted providers. */
  baseURL?: string
  /** Model a new session starts on. */
  model: string
  /** Provider id the model belongs to. */
  provider: string
}

/** Injection token for the resolved GatewayConfig. */
export const CONFIG = 'GATEWAY_CONFIG'

/**
 * Resolve settings from the environment.
 * @returns the gateway configuration; unset values fall back to local development defaults.
 */
export function loadConfig(): GatewayConfig {
  const publicOrigin = (process.env.GW_PUBLIC_ORIGIN ?? 'http://127.0.0.1:5173').replace(/\/+$/, '')
  const entry = process.env.GW_DSH_ENTRY
  return {
    host: process.env.GW_HOST ?? '127.0.0.1',
    port: Number(process.env.GW_PORT ?? 8080),
    publicOrigin,
    dataDir: process.env.GW_DATA_DIR ?? path.join(import.meta.dirname, '..', 'data'),
    dshCommand: entry === undefined ? 'dsh' : process.execPath,
    dshPrefixArgs: entry === undefined ? [] : [entry],
    dshBasePort: Number(process.env.GW_DSH_BASE_PORT ?? 3200),
    hostIdleMinutes: Number(process.env.GW_HOST_IDLE_MINUTES ?? 15),
    webDir: process.env.GW_WEB_DIR ?? path.join(import.meta.dirname, '..', '..', 'platform-web', 'dist'),
    profileSource: process.env.GW_PROFILE_SOURCE ?? path.join(homedir(), '.dsh'),
    plugins: plugins(process.env.GW_PLUGINS),
    llm: {
      apiKey: optional('GW_LLM_API_KEY', 'DEEPSEEK_API_KEY'),
      baseURL: optional('GW_LLM_BASE_URL', 'DEEPSEEK_BASE_URL'),
      model: process.env.GW_LLM_MODEL ?? 'deepseek-flash',
      provider: process.env.GW_LLM_PROVIDER ?? 'deepseek-official',
    },
    auth: {
      adminPassword: process.env.GW_ADMIN_PASSWORD ?? 'admin123456',
    },
    database: {
      host: process.env.GW_DB_HOST ?? '127.0.0.1',
      port: Number(process.env.GW_DB_PORT ?? 3306),
      user: process.env.GW_DB_USER ?? 'dsh',
      password: required('GW_DB_PASSWORD'),
      name: process.env.GW_DB_NAME ?? 'dsh_platform',
      runMigrations: (process.env.GW_DB_MIGRATIONS ?? 'true') !== 'false',
    },
  }
}

/**
 * Read a setting that may legitimately be absent, checking the gateway's own
 * variable before the one the dsh CLI reads directly.
 * @param name - gateway-scoped variable name.
 * @param inherited - variable name inherited from the launching environment.
 * @returns the first non-empty value, or undefined when neither is set.
 */
function optional(name: string, inherited: string): string | undefined {
  for (const key of [name, inherited]) {
    const value = process.env[key]
    if (value !== undefined && value !== '') return value
  }
  return undefined
}

/**
 * One plugin inserted into every project's composition.
 */
export interface PluginEntry {
  /** Loader id of the inserted row. */
  id: string
  /** Module specifier resolved from the profile directory; a `file:///` URL needs no install. */
  name: string
  /** Plugin config; a `{{dir}}` value expands to the project directory. */
  config?: Record<string, boolean | number | string>
}

/**
 * Read the plugin list every project Host composes in.
 * @param raw - JSON array of PluginEntry objects, or unset for none.
 * @returns the parsed entries.
 * @throws Error when the value is not a JSON array, so boot fails instead of dropping plugins silently.
 */
function plugins(raw: string | undefined): PluginEntry[] {
  if (raw === undefined || raw === '') return []
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('GW_PLUGINS 必须是 JSON 数组')
  return parsed as PluginEntry[]
}

/**
 * @param name - environment variable name.
 * @returns its value.
 * @throws Error when the variable is unset or empty, so boot fails instead of guessing.
 */
function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error('缺少环境变量 ' + name)
  return value
}

/**
 * Hostname the browser will use, so spawned Hosts accept its Host header.
 * @param config - resolved gateway configuration.
 * @returns the hostname part of GatewayConfig.publicOrigin.
 */
export function trustedHost(config: GatewayConfig): string {
  return new URL(config.publicOrigin).hostname
}
