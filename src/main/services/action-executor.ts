// src/main/services/action-executor.ts

import { shell, dialog, BrowserWindow } from 'electron'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { PetAction, ActionResult } from '../../shared/types'

const execAsync = promisify(exec)

/**
 * 命令执行的安全限制
 */
const CMD_SECURITY = {
  /** 命令执行超时时间（毫秒） */
  TIMEOUT_MS: 30_000,
  /** 禁止执行的危险命令模式 */
  BLOCKED_PATTERNS: [
    /rm\s+-rf\s+[\/~]/i, // rm -rf /
    /format\s+[a-z]:/i, // format C:
    /del\s+\/[sfq]\s+[a-z]:\\/i, // del /f /s /q C:\
    /shutdown/i, // shutdown
    /reg\s+delete/i // reg delete
  ] as RegExp[]
}

export class ActionExecutor {
  /**
   * 执行自定义动作
   * @param action 动作定义
   * @returns 执行结果
   */
  async execute(action: PetAction): Promise<ActionResult> {
    try {
      // ---- 1. 执行前确认 ----
      if (action.confirmBeforeExecute) {
        const confirmed = await this.showConfirmDialog(action)
        if (!confirmed) {
          return { success: false, cancelled: true }
        }
      }

      // ---- 2. 根据动作类型分发执行 ----
      switch (action.type) {
        case 'open-url':
          return await this.executeOpenUrl(action)
        case 'execute-cmd':
          return await this.executeCmd(action)
        case 'show-message':
          return await this.executeShowMessage(action)
        default:
          return {
            success: false,
            error: `未知的动作类型: ${(action as PetAction).type}`
          }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  // ============================================================
  // 1. open-url -- 打开外部 URL
  // ============================================================

  /**
   * 使用系统默认浏览器打开 URL
   * shell.openExternal 会自动处理协议验证（只允许 http/https/mailto 等安全协议）
   */
  private async executeOpenUrl(action: PetAction): Promise<ActionResult> {
    const url = action.payload.trim()

    // 基础 URL 格式校验
    if (!url) {
      return { success: false, error: 'URL 为空' }
    }

    // 只允许 http/https/ftp/mailto 协议
    const allowedProtocols = ['http:', 'https:', 'ftp:', 'mailto:']
    try {
      const parsed = new URL(url)
      if (!allowedProtocols.includes(parsed.protocol)) {
        return {
          success: false,
          error: `不允许的协议: ${parsed.protocol}。仅支持 http/https/ftp/mailto`
        }
      }
    } catch {
      return { success: false, error: `无效的 URL 格式: ${url}` }
    }

    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: `打开 URL 失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  // ============================================================
  // 2. execute-cmd -- 执行系统命令
  // ============================================================

  /**
   * 执行系统命令（带安全检查和超时限制）
   *
   * 安全注意事项:
   * - 默认开启 confirmBeforeExecute
   * - 命令超时 30 秒
   * - 检查危险命令模式
   * - 捕获 stdout/stderr
   */
  private async executeCmd(action: PetAction): Promise<ActionResult> {
    const command = action.payload.trim()

    if (!command) {
      return { success: false, error: '命令为空' }
    }

    // ---- 安全检查: 检查是否匹配危险命令模式 ----
    for (const pattern of CMD_SECURITY.BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return {
          success: false,
          error: `命令被安全策略阻止: 匹配危险模式 ${pattern.source}`
        }
      }
    }

    try {
      const { stderr } = await execAsync(command, {
        timeout: CMD_SECURITY.TIMEOUT_MS,
        windowsHide: true // Windows 上隐藏命令行窗口
      })

      if (stderr) {
        console.warn(`[ActionExecutor] 命令 stderr: ${stderr}`)
      }

      return { success: true }
    } catch (error: unknown) {
      const err = error as { killed?: boolean; message?: string }
      // 区分超时和其他错误
      if (err.killed) {
        return {
          success: false,
          error: `命令执行超时（${CMD_SECURITY.TIMEOUT_MS / 1000}秒）`
        }
      }
      return {
        success: false,
        error: `命令执行失败: ${err.message || String(error)}`
      }
    }
  }

  // ============================================================
  // 3. show-message -- 显示消息对话框
  // ============================================================

  /**
   * 使用 Electron dialog 显示消息弹窗
   */
  private async executeShowMessage(action: PetAction): Promise<ActionResult> {
    const message = action.payload.trim()

    if (!message) {
      return { success: false, error: '消息内容为空' }
    }

    // 获取当前焦点窗口作为父窗口，如果没有则使用 null（系统级对话框）
    const parentWindow = BrowserWindow.getFocusedWindow()

    await dialog.showMessageBox(parentWindow ?? undefined, {
      type: 'info',
      title: '桌宠消息',
      message: message,
      buttons: ['确定'],
      noLink: true
    })

    return { success: true }
  }

  // ============================================================
  // 4. 确认对话框
  // ============================================================

  /**
   * 显示确认对话框，让用户确认是否执行动作
   * @returns true = 用户确认执行，false = 用户取消
   */
  private async showConfirmDialog(action: PetAction): Promise<boolean> {
    const parentWindow = BrowserWindow.getFocusedWindow()

    // 根据动作类型构建确认消息
    let detail = ''
    switch (action.type) {
      case 'open-url':
        detail = `即将在浏览器中打开:\n${action.payload}`
        break
      case 'execute-cmd':
        detail = `即将执行命令:\n${action.payload}\n\n请确认命令安全后再执行。`
        break
      case 'show-message':
        detail = `即将显示消息:\n${action.payload}`
        break
    }

    const result = await dialog.showMessageBox(parentWindow ?? undefined, {
      type: 'question',
      title: '确认执行动作',
      message: `确认执行: ${action.name}`,
      detail: detail,
      buttons: ['执行', '取消'],
      defaultId: 1, // 默认选中"取消"（更安全）
      cancelId: 1,
      noLink: true
    })

    return result.response === 0
  }
}
