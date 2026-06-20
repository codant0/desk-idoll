// src/main/services/static-animation-service.ts
// 静态图片动画服务
//
// 负责：
// - 验证上传的图片文件（格式、大小）
// - 复制图片到应用资源目录
// - 获取图片信息（尺寸等）
// - 管理生成的资源文件

import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { imageSizeFromFile } from 'image-size/fromFile'
import { randomUUID } from '../../shared/utils'

/** validateImage 返回的结果类型 */
export interface ImageValidationResult {
  valid: boolean
  error?: string
}

/** 图片元信息 */
export interface ImageInfo {
  width: number
  height: number
  format: string
}

/** 允许的图片扩展名 */
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']

/** 文件大小上限：10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024

/**
 * StaticAnimationService
 *
 * 负责静态图片桌宠的资源管理：验证、复制、查询元信息、删除。
 * 所有持久化文件存放在 userData/assets/ 目录下。
 */
export class StaticAnimationService {
  private assetsDir: string
  private assetsDirReady: Promise<void>

  constructor() {
    this.assetsDir = path.join(app.getPath('userData'), 'assets')
    // 修复：保存 Promise 引用，供后续异步方法 await，避免竞态条件
    this.assetsDirReady = fs.mkdir(this.assetsDir, { recursive: true }).then(() => {}, () => {})
  }

  /**
   * 验证图片文件是否有效
   *
   * 检查项：
   * 1. 文件是否存在且可读
   * 2. 扩展名是否在白名单中
   * 3. 文件大小是否在限制范围内
   *
   * @param filePath 待验证的图片路径
   * @returns 验证结果，valid=false 时 error 字段包含原因
   */
  async validateImage(filePath: string): Promise<ImageValidationResult> {
    try {
      // 检查文件是否存在
      await fs.access(filePath)

      // 检查文件扩展名
      const ext = path.extname(filePath).toLowerCase()
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return { valid: false, error: '不支持的图片格式，仅支持 PNG/JPG/GIF/WebP' }
      }

      // 检查文件大小
      const stats = await fs.stat(filePath)
      if (stats.size > MAX_FILE_SIZE) {
        return { valid: false, error: `文件大小超过${MAX_FILE_SIZE / 1024 / 1024}MB限制` }
      }

      return { valid: true }
    } catch {
      return { valid: false, error: '文件不存在或无法访问' }
    }
  }

  /**
   * 复制图片到应用资源目录
   *
   * 文件名格式：{petId}-{uuid}.{ext}，保证唯一性。
   *
   * @param filePath 源文件路径
   * @param petId 关联的桌宠 ID
   * @returns 复制后的目标文件路径
   */
  async copyImageToAssets(filePath: string, petId: string): Promise<string> {
    // 等待资源目录创建完成，避免竞态条件
    await this.assetsDirReady

    const ext = path.extname(filePath)
    const fileName = `${petId}-${randomUUID()}${ext}`
    const destPath = path.join(this.assetsDir, fileName)

    await fs.copyFile(filePath, destPath)
    return destPath
  }

  /**
   * 获取图片真实尺寸和格式
   *
   * 使用 image-size 库读取图片文件头信息，获取真实的宽度、高度和格式。
   * 读取失败时返回 128x128 的默认尺寸作为降级处理。
   *
   * @param filePath 图片路径
   * @returns 图片元信息（宽、高、格式）
   */
  async getImageInfo(filePath: string): Promise<ImageInfo> {
    try {
      const dimensions = await imageSizeFromFile(filePath)
      return {
        width: dimensions.width || 128,
        height: dimensions.height || 128,
        format: dimensions.type || path.extname(filePath).slice(1).toLowerCase()
      }
    } catch (error) {
      console.warn('[StaticAnimationService] Failed to get image info:', error)
      // 获取失败时返回默认值作为降级处理
      return {
        width: 128,
        height: 128,
        format: path.extname(filePath).slice(1).toLowerCase()
      }
    }
  }

  /**
   * 删除资源文件
   *
   * 文件不存在时静默忽略。
   *
   * @param filePath 要删除的文件路径
   */
  async deleteAsset(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath)
    } catch {
      // 忽略删除错误（文件可能已被删除）
    }
  }
}
