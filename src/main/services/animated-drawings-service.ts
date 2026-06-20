// src/main/services/animated-drawings-service.ts
// AnimatedDrawings Python 服务调用
//
// 负责：
// - 管理 Python 服务进程的生命周期（启动 / 停止）
// - 通过 HTTP API 提交图片处理任务
// - 轮询处理状态、等待任务完成
// - 管理生成的精灵图资源

import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'

/** 处理任务状态 */
export type ProcessingTaskStatus = 'processing' | 'completed' | 'error'

/** 处理任务信息 */
export interface ProcessingTask {
  taskId: string
  status: ProcessingTaskStatus
  progress: number
  result?: {
    spritesheetPath: string
    jsonPath: string
  }
  error?: string
}

/** 服务健康检查响应 */
interface HealthResponse {
  status: string
}

/** 提交任务响应 */
interface ProcessResponse {
  task_id?: string
  error?: string
}

/** 任务状态查询响应（Python 服务返回 snake_case 字段） */
interface StatusResponse {
  status: ProcessingTaskStatus
  progress?: number
  result?: {
    spritesheet_path?: string
    spritesheetPath?: string
    json_path?: string
    jsonPath?: string
  }
  error?: string
}

/** fetch 请求超时时间（毫秒） */
const FETCH_TIMEOUT = 5000

/** 启动服务等待超时（毫秒） */
const START_TIMEOUT = 15000

/** 等待任务完成的轮询间隔（毫秒） */
const POLL_INTERVAL = 1000

/** 处理任务超时时间（毫秒） */
const TASK_TIMEOUT = 120000

/**
 * AnimatedDrawingsService
 *
 * 管理 AnimatedDrawings Python 后台服务。
 * 通过 HTTP API 与 Python 进程通信，提交图片处理请求并获取结果。
 */
export class AnimatedDrawingsService {
  private pythonProcess: ChildProcess | null = null
  private serviceUrl = 'http://127.0.0.1:5000'
  private tasks: Map<string, ProcessingTask> = new Map()
  private isServiceAvailable = false

  /**
   * 检查 Python 服务是否可用
   *
   * 通过调用 /api/health 端点判断服务是否正常运行。
   *
   * @returns 服务是否可用
   */
  async checkServiceAvailability(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

      const response = await fetch(`${this.serviceUrl}/api/health`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      const data = (await response.json()) as HealthResponse
      this.isServiceAvailable = data.status === 'healthy'
      return this.isServiceAvailable
    } catch {
      this.isServiceAvailable = false
      return false
    }
  }

  /**
   * 启动 Python 服务
   *
   * 如果服务已经在运行则直接返回 true。
   * 启动后等待 stdout 输出包含 "Running on" 表示服务就绪。
   *
   * @returns 是否启动成功
   */
  async startService(): Promise<boolean> {
    if (this.isServiceAvailable) {
      return true
    }

    const scriptPath = this.getScriptPath()

    return new Promise<boolean>((resolve) => {
      this.pythonProcess = spawn('python', [scriptPath], {
        cwd: path.dirname(scriptPath),
        stdio: ['pipe', 'pipe', 'pipe']
      })

      this.pythonProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString()
        console.log(`[AnimatedDrawings] ${output}`)
        if (output.includes('Running on')) {
          this.isServiceAvailable = true
          resolve(true)
        }
      })

      this.pythonProcess.stderr?.on('data', (data: Buffer) => {
        console.error(`[AnimatedDrawings Error] ${data.toString()}`)
      })

      this.pythonProcess.on('error', (error: Error) => {
        console.error('[AnimatedDrawings] Failed to start:', error)
        resolve(false)
      })

      this.pythonProcess.on('exit', (code: number | null) => {
        console.log(`[AnimatedDrawings] Process exited with code ${code}`)
        this.isServiceAvailable = false
        this.pythonProcess = null
      })

      // 超时处理
      setTimeout(() => {
        if (!this.isServiceAvailable) {
          resolve(false)
        }
      }, START_TIMEOUT)
    })
  }

  /**
   * 停止 Python 服务
   */
  stopService(): void {
    if (this.pythonProcess) {
      this.pythonProcess.kill()
      this.pythonProcess = null
      this.isServiceAvailable = false
    }
  }

  /**
   * 处理图片生成精灵图
   *
   * 提交图片到 AnimatedDrawings 服务进行动画处理。
   * 返回 taskId，可通过 getTaskStatus 或 waitForCompletion 查询结果。
   *
   * @param imagePath 待处理的图片路径
   * @param animationStyle 动画风格标识
   * @param outputSize 输出精灵图的尺寸
   * @returns 任务 ID
   */
  async processImage(
    imagePath: string,
    animationStyle: string,
    outputSize: { width: number; height: number }
  ): Promise<string> {
    if (!this.isServiceAvailable) {
      throw new Error('AnimatedDrawings service not available')
    }

    const response = await fetch(`${this.serviceUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_path: imagePath,
        animation_style: animationStyle,
        output_size: outputSize
      })
    })

    const data = (await response.json()) as ProcessResponse

    if (data.error) {
      throw new Error(data.error)
    }

    if (!data.task_id) {
      throw new Error('Server did not return a task ID')
    }

    // 缓存任务信息
    this.tasks.set(data.task_id, {
      taskId: data.task_id,
      status: 'processing',
      progress: 0
    })

    return data.task_id
  }

  /**
   * 查询任务状态
   *
   * 先检查本地缓存（已完成/出错的任务不再请求远端），
   * 否则调用远程 API 查询最新状态并更新缓存。
   *
   * @param taskId 任务 ID
   * @returns 任务状态信息
   */
  async getTaskStatus(taskId: string): Promise<ProcessingTask> {
    // 已完成或出错的任务直接返回缓存
    const localTask = this.tasks.get(taskId)
    if (localTask?.status === 'completed' || localTask?.status === 'error') {
      return localTask
    }

    // 查询远程服务
    const response = await fetch(`${this.serviceUrl}/api/status/${taskId}`)
    const data = (await response.json()) as StatusResponse

    const task: ProcessingTask = {
      taskId,
      status: data.status,
      progress: data.progress ?? 0,
      // 修复：Python 服务返回 snake_case，需映射为 camelCase
      result: data.result ? {
        spritesheetPath: data.result.spritesheet_path ?? data.result.spritesheetPath ?? '',
        jsonPath: data.result.json_path ?? data.result.jsonPath ?? ''
      } : undefined,
      error: data.error
    }

    this.tasks.set(taskId, task)
    return task
  }

  /**
   * 等待任务完成（轮询模式）
   *
   * 每隔 POLL_INTERVAL 毫秒查询一次状态，直到任务完成或超时。
   *
   * @param taskId 任务 ID
   * @param timeout 超时时间（毫秒），默认 120 秒
   * @returns 最终的任务状态
   * @throws 超时抛出 Error
   */
  async waitForCompletion(taskId: string, timeout = TASK_TIMEOUT): Promise<ProcessingTask> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const task = await this.getTaskStatus(taskId)

      if (task.status === 'completed' || task.status === 'error') {
        return task
      }

      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL))
    }

    throw new Error('Processing timeout')
  }

  /**
   * 获取 Python 服务脚本路径
   *
   * 开发模式：项目根目录/services/animated-drawings/server.py
   * 打包模式：process.resourcesPath/services/animated-drawings/server.py
   */
  private getScriptPath(): string {
    const isDev = !app.isPackaged
    if (isDev) {
      return path.join(app.getAppPath(), 'services', 'animated-drawings', 'server.py')
    }
    return path.join(process.resourcesPath, 'services', 'animated-drawings', 'server.py')
  }
}
