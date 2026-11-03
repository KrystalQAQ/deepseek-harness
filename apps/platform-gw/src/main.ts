import 'reflect-metadata'

import path from 'node:path'

import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { NextFunction, Request, Response } from 'express'

import { AppModule } from './app.module.js'
import { CONFIG, type GatewayConfig } from './config.js'
import { ProxyService } from './dsh/proxy.service.js'

/** Paths the shell owns; anything else falls through to the single-page app. */
const API_PREFIX = '/api'

/**
 * Plugin API mounts that their clients address at the origin root even inside a
 * `/p/<id>/` workspace page; the gateway attributes them by Referer.
 */
const ROOT_PLUGIN_API = '/api/dsh-ssh'

/**
 * Start the gateway: the shell at the origin root, its JSON API under /api, and
 * one per-project Host proxy under /p.
 * @returns a promise that settles once the HTTP server is listening.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const config = app.get<GatewayConfig>(CONFIG)
  const proxy = app.get(ProxyService)

  app.use('/p', (request: Request, response: Response) => {
    void proxy.handle(request, response)
  })
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (!request.path.startsWith(ROOT_PLUGIN_API)) {
      next()
      return
    }
    void proxy.handleRootApi(request, response)
  })
  app.useStaticAssets(config.webDir, { index: 'index.html' })
  app.use((request: Request, response: Response, next: NextFunction) => {
    const navigable = request.method === 'GET' && request.path.startsWith(API_PREFIX) === false
    if (!navigable) {
      next()
      return
    }
    response.sendFile(path.join(config.webDir, 'index.html'))
  })
  app.enableShutdownHooks()

  const server = await app.listen(config.port, config.host)
  server.on('upgrade', (request, socket, head) => {
    void proxy.upgrade(request, socket, head)
  })
  new Logger('Gateway').log(
    'dsh gateway 监听 ' + config.host + ':' + config.port + '，公开源 ' + config.publicOrigin,
  )
}

void bootstrap()
