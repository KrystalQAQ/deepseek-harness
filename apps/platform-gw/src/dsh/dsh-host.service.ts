import { spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { OnApplicationShutdown } from '@nestjs/common'
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'

import { CONFIG, trustedHost, type GatewayConfig, type LlmConfig, type PluginEntry } from '../config.js'
import { ProjectsService } from '../projects/projects.service.js'

/** Matches the readiness line "dsh web: <url>?token=<launch-token>" printed on stdout. */
const READY = /dsh web: \S*?\?token=([A-Za-z0-9._~-]+)/

/** How long a Host may take to print its readiness line before the gateway gives up. */
const START_TIMEOUT_MS = 90_000

/** How often the supervisor looks for Hosts nobody used lately. */
const SWEEP_INTERVAL_MS = 60_000

/**
 * Environment for one Host: its own DSH home plus the deployment's model credentials.
 *
 * dsh resolves provider credentials from the inherited environment first, so the
 * key never reaches the browser or a shell-visible file inside the project.
 * @param llm - deployment credentials and default model.
 * @param home - DSH home owned by this project.
 * @returns the child process environment.
 */
/** Files a new project home inherits from the trusted profile so it starts with a working model setup. */
const SETTINGS_FILE = 'settings.yaml'

/** Files copied from the operator's DSH home into every project home. */
const PROFILE_FILES = ['.credentials.yaml', '.env', SETTINGS_FILE]

/**
 * Copy the trusted profile's model setup into a project home that has none.
 *
 * Each project keeps its own DSH home, so without this copy every new project
 * would open with no provider credential and no chosen model. Existing files
 * are never overwritten: the project home is the durable record after creation.
 * @param source - trusted DSH home directory; empty disables the copy.
 * @param home - the project's DSH home.
 */
function syncProfile(source: string, home: string): void {
  if (source === '') return
  for (const name of PROFILE_FILES) {
    const from = path.join(source, name)
    const to = path.join(home, name)
    if (!existsSync(from)) continue
    // The settings file is imported and renamed by dsh on first boot, so a second copy
    // would reintroduce defaults the user already changed inside the project.
    if (name === SETTINGS_FILE && (existsSync(to) || existsSync(to + '.imported'))) continue
    copyFileSync(from, to)
  }
}

function hostEnv(llm: LlmConfig, home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, DSH_HOME: home }
  if (llm.apiKey !== undefined) env.DEEPSEEK_API_KEY = llm.apiKey
  if (llm.baseURL !== undefined) env.DEEPSEEK_BASE_URL = llm.baseURL
  return env
}

/**
 * Whether a plugin entry names a directory on this machine rather than a registry package.
 * @param name - plugin module specifier.
 * @returns true for a `file:` URL or an absolute path.
 */
function isLocalSpecifier(name: string): boolean {
  return name.startsWith('file://') || path.isAbsolute(name)
}

/**
 * Nearest ancestor directory that owns a `package.json`.
 * @param source - a plugin package directory or any file inside it.
 * @returns the directory the package name and files come from.
 * @throws Error when no ancestor declares a package, so a bad specifier fails loudly.
 */
function packageDir(source: string): string {
  let dir = source
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(dir, 'package.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('找不到插件 package.json: ' + source)
}

/**
 * Read the package name a local plugin directory publishes.
 * @param source - plugin package directory.
 * @returns its `package.json` name.
 * @throws Error when the manifest is missing or unnamed, so a misconfigured deployment fails at start rather than loading nothing.
 */
function packageName(source: string): string {
  const manifest = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8')) as { name?: unknown }
  if (typeof manifest.name !== 'string' || manifest.name === '') {
    throw new Error('插件缺少 package.json 的 name: ' + source)
  }
  return manifest.name
}

/**
 * Declare a local plugin as a dependency of one project's profile.
 *
 * The plugin manager lists a package under 已安装插件 only when the profile
 * declares it, and the loader resolves bare names from the profile's
 * `node_modules`, so a local directory needs both a junction and a dependency
 * entry. The profile directory exists only after the Host's first boot, so this
 * runs once a Host is ready and takes effect on the next start.
 * @param home - project DSH home.
 * @param source - plugin package directory.
 * @returns the package name, now resolvable from the profile.
 */
function installPlugin(home: string, source: string): string {
  const root = path.join(home, 'profiles', 'web')
  const directory = packageDir(source)
  const name = packageName(directory)
  const target = path.join(root, 'node_modules', name)
  mkdirSync(path.dirname(target), { recursive: true })
  if (!existsSync(target)) symlinkSync(directory, target, 'junction')
  const manifestPath = path.join(root, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    dependencies?: Record<string, string>
    dsh?: { profile?: { bundles?: string[] } }
    [key: string]: unknown
  }
  manifest.dependencies = { ...manifest.dependencies, [name]: 'file:' + directory.replaceAll('\\', '/') }
  const profile = (manifest.dsh ??= {}).profile ??= {}
  if (!(profile.bundles ?? []).includes(name)) profile.bundles = [...(profile.bundles ?? []), name]
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  return name
}

/**
 * Swap a local plugin specifier for the package name once the profile can resolve it.
 *
 * The plugin manager matches a composition row to an installed package by name,
 * so a `file:` row reads as "not enabled" even while it runs. Installing the
 * package into the profile makes the bare name resolvable, which is what the
 * manager and the loader both compare.
 * @param home - project DSH home.
 * @param plugin - deployment plugin entry.
 * @returns the entry with its resolvable name, or unchanged when not installed yet.
 */
function overlayPlugin(home: string, plugin: PluginEntry): PluginEntry {
  if (!isLocalSpecifier(plugin.name)) return plugin
  try {
    const directory = packageDir(plugin.name.startsWith('file://') ? fileURLToPath(plugin.name) : plugin.name)
    const name = packageName(directory)
    const installed = existsSync(path.join(home, 'profiles', 'web', 'node_modules', name))
    return installed ? { ...plugin, name } : plugin
  } catch {
    return plugin
  }
}

/**
 * Declare every local plugin in one profile, so the plugin manager can list it.
 * @param home - project DSH home whose profile now exists.
 * @param plugins - deployment plugin list.
 */
function installLocalPlugins(home: string, plugins: readonly PluginEntry[]): void {
  if (!existsSync(path.join(home, 'profiles', 'web', 'package.json'))) return
  for (const plugin of plugins) {
    if (!isLocalSpecifier(plugin.name)) continue
    installPlugin(home, plugin.name.startsWith('file://') ? fileURLToPath(plugin.name) : plugin.name)
  }
}

/**
 * Render the insert entries that load deployment plugins for one project.
 * @param project - project the entries are rendered for.
 * @param plugins - plugin entries to render.
 * @returns YAML lines for an `insert` group, or an empty array.
 */
function pluginLines(project: HostProject, plugins: readonly PluginEntry[]): string[] {
  const lines: string[] = []
  for (const plugin of plugins) {
    lines.push('    - id: ' + plugin.id, '      name: ' + JSON.stringify(plugin.name))
    const config = Object.entries(plugin.config ?? {})
    if (config.length === 0) continue
    lines.push('      config:')
    for (const [key, value] of config) {
      lines.push('        ' + key + ': ' + (typeof value === 'string' ? JSON.stringify(value.replaceAll('{{dir}}', project.dir)) : String(value)))
    }
  }
  return lines
}

/**
 * Whether the project profile can resolve the plugin package by name.
 * @param home - project DSH home.
 * @param plugin - deployment plugin entry.
 * @returns true when the package is installed in the profile.
 */
function pluginInstalled(home: string, plugin: PluginEntry): boolean {
  try {
    const directory = packageDir(plugin.name.startsWith('file://') ? fileURLToPath(plugin.name) : plugin.name)
    return existsSync(path.join(home, 'profiles', 'web', 'node_modules', packageName(directory)))
  } catch {
    return false
  }
}

/**
 * Render the per-project configuration override for a plugin that its bundle already inserts.
 * @param project - project the entries are rendered for.
 * @param plugin - installed plugin entry, named by package.
 * @returns YAML lines for one override entry, or an empty array when the plugin has no configuration.
 */
function overrideLines(project: HostProject, plugin: PluginEntry): string[] {
  const config = Object.entries(plugin.config ?? {})
  if (config.length === 0) return []
  const lines = ['- id: ' + plugin.id, '  config:']
  for (const [key, value] of config) {
    lines.push('    ' + key + ': ' + (typeof value === 'string' ? JSON.stringify(value.replaceAll('{{dir}}', project.dir)) : String(value)))
  }
  return lines
}

/**
 * Whether the project profile stores a model the user picked in the UI.
 *
 * The model picker persists through the config editor, which writes an
 * `agent-default-model` override into the profile patch. Overlay values win
 * over that layer, so the overlay may seed the deployment default only while
 * the profile has not recorded a choice of its own.
 * @param home - project DSH home.
 * @returns true when the profile patch overrides `agent-default-model` with a model.
 */
function modelSelected(home: string): boolean {
  let text: string
  try {
    text = readFileSync(path.join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
  } catch {
    return false
  }
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(line => /^\s*-\s+id:\s*['"]?agent-default-model['"]?\s*$/.test(line))
  if (start < 0) return false
  for (const line of lines.slice(start + 1)) {
    if (/^\s*-\s+id:/.test(line)) return false
    if (/^\s+model:/.test(line)) return true
  }
  return false
}

/**
 * Write the loader overlay that binds one Host to its own project.
 *
 * The overlay pins the project directory as the only Workspace, so the sidebar
 * opens on the project instead of the shared <Documents> default, and seeds
 * the model a new session starts on unless the profile already stores one.
 * Overwriting it on every start keeps the file derived from the registry rather
 * than a second source of truth.
 * @param file - overlay path owned by the gateway.
 * @param project - project being started.
 * @param home - project DSH home, which holds the profile patch.
 * @param llm - deployment model default.
 * @param plugins - plugins the profile cannot resolve yet; the profile patch carries installed ones.
 * @param overrides - plugin overrides for plugins the profile already resolves.
 */
function writeOverlay(
  file: string,
  project: HostProject,
  home: string,
  llm: LlmConfig,
  plugins: readonly PluginEntry[],
  overrides: readonly PluginEntry[],
): void {
  const directory = JSON.stringify(project.dir)
  const inserted = pluginLines(project, plugins)
  const overridden = overrides.flatMap(plugin => overrideLines(project, plugin))
  const defaults = modelSelected(home)
    ? []
    : [
      '- id: agent-default-model',
      '  config:',
      '    provider: ' + JSON.stringify(llm.provider),
      '    model: ' + JSON.stringify(llm.model),
    ]
  writeFileSync(
    file,
    [
      '# Generated by the platform gateway on every start; edits are overwritten.',
      '- id: workspace-controller',
      '  config:',
      '    defaultDirectory: ' + directory,
      ...defaults,
      '- id: ui-settings-general',
      '  config:',
      '    welcomeNoticeVersion: "2026-09-28.1"',
      '- id: ui-brand-official',
      '  config:',
      '    title: ' + JSON.stringify(project.name),
      '- id: ui-workspace',
      '  config:',
      '    sessionsOnly: true',
      '    hero: false',
      '- id: ui-agent-preset',
      '  disabled: true',
      ...overridden,
      ...inserted.length === 0 ? [] : ['- insert:', ...inserted],
      '',
    ].join('\n'),
    'utf8',
  )
}

/** A running Host and the launch token its browser session needs. */
export interface RunningHost {
  /** Loopback port the Host listens on. */
  port: number
  /** Launch token the proxy trades for the Host's own auth cookie. */
  token: string
}

/** The project fields the supervisor needs; satisfied by both the row and the API model. */
export interface HostProject {
  /** Workspace root, also the child's cwd. */
  dir: string
  /** Project id, used for the home directory and log tags. */
  id: string
  /** Display name shown as the workspace brand in the sidebar. */
  name: string
  /** Loopback port reserved for the child. */
  port: number
}

interface HostEntry {
  child: ChildProcess
  ready: Promise<RunningHost>
  token: string
  lastUsed: number
}

/**
 * Supervises one dsh --profile web process per project.
 *
 * Each child owns an isolated DSH_HOME and a fixed loopback port; the gateway
 * reaches it only through the mount-prefix proxy, so the Host never learns it is
 * running behind a shell. Lifecycle transitions are persisted, so the registry
 * still explains what happened after a gateway restart.
 */
@Injectable()
export class DshHostService implements OnApplicationShutdown {
  private readonly logger = new Logger(DshHostService.name)
  private readonly entries = new Map<string, HostEntry>()

  /**
   * @param config - resolved gateway configuration.
   * @param projects - registry that records Host lifecycle transitions.
   */
  constructor(
    @Inject(CONFIG) private readonly config: GatewayConfig,
    @Inject(forwardRef(() => ProjectsService)) private readonly projects: ProjectsService,
  ) {
    const timer = setInterval(() => this.sweepIdle(), SWEEP_INTERVAL_MS)
    timer.unref()
  }

  /**
   * Start a project's Host unless one is already running.
   * @param project - registered project.
   * @returns the running Host, ready to proxy to.
   */
  async ensure(project: HostProject): Promise<RunningHost> {
    const existing = this.entries.get(project.id)
    if (existing !== undefined && existing.child.exitCode === null) {
      existing.lastUsed = Date.now()
      return existing.ready
    }

    const home = path.join(this.config.dataDir, 'homes', project.id)
    mkdirSync(home, { recursive: true })
    syncProfile(this.config.profileSource, home)
    const overlayDir = path.join(this.config.dataDir, 'patches')
    mkdirSync(overlayDir, { recursive: true })
    const overlay = path.join(overlayDir, project.id + '.yml')
    const pending = this.config.plugins.filter(plugin => !pluginInstalled(home, plugin))
    const installed = this.config.plugins.filter(plugin => pluginInstalled(home, plugin)).map(plugin => overlayPlugin(home, plugin))
    writeOverlay(overlay, project, home, this.config.llm, pending.map(plugin => overlayPlugin(home, plugin)), installed)
    const args = [
      ...this.config.dshPrefixArgs,
      '--profile',
      'web',
      '--patch',
      overlay,
      '--no-open',
      '--host',
      '127.0.0.1',
      '--port',
      String(project.port),
      '--public-url',
      this.config.publicOrigin + '/p/' + project.id + '/',
      '--trusted-host',
      trustedHost(this.config),
    ]

    this.logger.log('启动 dsh Host: ' + project.id + ' port=' + project.port + ' dir=' + project.dir)
    const child = spawn(this.config.dshCommand, args, {
      cwd: project.dir,
      env: hostEnv(this.config.llm, home),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    void this.projects.setStatus(project.id, 'starting')

    const entry: HostEntry = { child, token: '', lastUsed: Date.now(), ready: Promise.resolve({ port: 0, token: '' }) }
    let output = ''
    entry.ready = new Promise<RunningHost>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error('dsh Host ' + project.id + ' 90 秒内未就绪\n' + output.slice(-2000)))
      }, START_TIMEOUT_MS)

      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString()
        const match = READY.exec(output)
        if (match !== null && entry.token === '') {
          entry.token = match[1] as string
          clearTimeout(timer)
          this.logger.log('dsh Host 就绪: ' + project.id + ' port=' + project.port)
          void this.projects.markRunning(project.id)
          try {
            installLocalPlugins(home, this.config.plugins)
            const pending = this.config.plugins.filter(plugin => !pluginInstalled(home, plugin))
            const installed = this.config.plugins.filter(plugin => pluginInstalled(home, plugin)).map(plugin => overlayPlugin(home, plugin))
            writeOverlay(overlay, project, home, this.config.llm, pending.map(plugin => overlayPlugin(home, plugin)), installed)
          } catch (error) {
            this.logger.warn('[' + project.id + '] 插件登记失败: ' + (error as Error).message)
          }
          resolve({ port: project.port, token: entry.token })
        }
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        this.logger.warn('[' + project.id + '] ' + chunk.toString().trim())
      })
      child.once('exit', (code, signal) => {
        clearTimeout(timer)
        if (this.entries.get(project.id) === entry) {
          this.entries.delete(project.id)
          void this.projects.markFailed(project.id, 'Host 退出 code=' + String(code) + ' signal=' + String(signal))
        }
        this.logger.log('dsh Host 退出: ' + project.id + ' code=' + String(code) + ' signal=' + String(signal))
        reject(new Error('dsh Host ' + project.id + ' 退出: ' + String(code ?? signal)))
      })
      child.once('error', (error: Error) => {
        clearTimeout(timer)
        this.entries.delete(project.id)
        void this.projects.markFailed(project.id, error.message)
        reject(error)
      })
    })
    entry.ready.catch(() => undefined)
    this.entries.set(project.id, entry)
    return entry.ready
  }

  /**
   * Stop one project's Host.
   * @param id - project id.
   */
  stop(id: string): void {
    const entry = this.entries.get(id)
    if (entry === undefined) return
    this.entries.delete(id)
    entry.child.kill()
    void this.projects.markIdle(id)
  }

  /**
   * Stop Hosts nobody opened for the configured idle window.
   *
   * A Host costs a few hundred megabytes while it runs, so the platform keeps it
   * resident only while the project is in use; the next request starts it again.
   */
  sweepIdle(): void {
    const limit = this.config.hostIdleMinutes * 60_000
    if (limit <= 0) return
    const now = Date.now()
    for (const [id, entry] of [...this.entries]) {
      if (entry.child.exitCode !== null || now - entry.lastUsed < limit) continue
      this.logger.log('空闲回收 Host: ' + id)
      this.stop(id)
    }
  }

  /** @param id - project id. @returns whether a Host is currently supervised. */
  isRunning(id: string): boolean {
    const entry = this.entries.get(id)
    return entry !== undefined && entry.child.exitCode === null
  }

  /** Stop every supervised Host. */
  onApplicationShutdown(): void {
    for (const id of [...this.entries.keys()]) this.stop(id)
  }}
