// src/main/services/spritesheet-generator.ts
// 精灵图生成器
//
// 负责：
// - 从单张图片生成多帧精灵图（使用 sharp 进行真实图像变换）
// - 生成 PixiJS 兼容的 JSON 配置
// - 管理生成的资源文件

import sharp from 'sharp'
import path from 'node:path'
import fs from 'node:fs/promises'
import { app } from 'electron'
import { randomUUID } from '../../shared/utils'

/** 单帧定义 */
interface FrameDefinition {
  name: string
  x: number
  y: number
  width: number
  height: number
}

/** 动画定义 */
interface AnimationDefinition {
  name: string
  frames: string[]
  loop: boolean
}

/** PixiJS Spritesheet JSON 中的帧对象 */
interface PixiJSFrame {
  frame: { x: number; y: number; w: number; h: number }
  rotated: boolean
  trimmed: boolean
  spriteSourceSize: { x: number; y: number; w: number; h: number }
  sourceSize: { w: number; h: number }
}

/** PixiJS Spritesheet JSON 结构 */
interface PixiJSSpritesheetJSON {
  frames: Record<string, PixiJSFrame>
  animations: Record<string, string[]>
  meta: {
    size: { w: number; h: number }
    scale: string
  }
}

/** 每行最多放置的帧数 */
const FRAMES_PER_ROW = 4

/** 桌宠动画状态列表 */
const ANIMATION_STATES = ['idle', 'walk', 'drag', 'fall', 'click'] as const

/**
 * SpritesheetGenerator
 *
 * 从静态图片生成 PixiJS 兼容的 Spritesheet。
 * 使用 sharp 进行图片变换，为每个动画状态生成视觉上不同的帧：
 * - idle: 轻微上下浮动 + 呼吸缩放
 * - walk: 左右位移 + 弹跳效果
 * - drag: 旋转摇晃
 * - fall: 持续旋转
 * - click: 缩放脉冲
 */
export class SpritesheetGenerator {
  private outputDir: string

  constructor() {
    this.outputDir = path.join(app.getPath('userData'), 'generated-sprites')
  }

  /**
   * 从单张图片生成精灵图
   *
   * 为每个动画状态（idle/walk/drag/fall/click）生成 frameCount 帧，
   * 每帧大小为 frameSize，排列在 FRAMES_PER_ROW 列的网格中。
   *
   * @param sourceImagePath 源图片路径
   * @param frameCount 每个动画状态的帧数，默认 4
   * @param frameSize 每帧尺寸，默认 128x128
   * @returns 生成的精灵图路径和 JSON 配置路径
   */
  async generateFromSingleImage(
    sourceImagePath: string,
    frameCount: number = 4,
    frameSize: { width: number; height: number } = { width: 128, height: 128 }
  ): Promise<{ spritesheetPath: string; jsonPath: string }> {
    const outputId = randomUUID()
    const spritesheetPath = path.join(this.outputDir, `${outputId}.png`)
    const jsonPath = path.join(this.outputDir, `${outputId}.json`)

    // 确保输出目录存在
    await fs.mkdir(this.outputDir, { recursive: true })

    // 读取源图片并调整到目标帧大小
    const sourceImage = sharp(sourceImagePath)
    const resizedBuffer = await sourceImage
      .resize(frameSize.width, frameSize.height, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer()

    // 生成所有帧
    const frames: FrameDefinition[] = []
    const animations: AnimationDefinition[] = []
    const frameBuffers: Buffer[] = []

    for (const state of ANIMATION_STATES) {
      const stateFrames: string[] = []

      for (let i = 0; i < frameCount; i++) {
        const frameName = `${state}_${i}`
        const frameIndex = frames.length

        frames.push({
          name: frameName,
          x: (frameIndex % FRAMES_PER_ROW) * frameSize.width,
          y: Math.floor(frameIndex / FRAMES_PER_ROW) * frameSize.height,
          width: frameSize.width,
          height: frameSize.height
        })
        stateFrames.push(frameName)

        // 根据动画状态生成变换后的帧
        const transformedBuffer = await this.transformFrame(
          resizedBuffer,
          state,
          i,
          frameCount,
          frameSize
        )
        frameBuffers.push(transformedBuffer)
      }

      animations.push({
        name: state,
        frames: stateFrames,
        loop: state === 'idle' || state === 'walk'
      })
    }

    // 计算精灵图总尺寸
    const totalWidth = frameSize.width * FRAMES_PER_ROW
    const totalRows = Math.ceil(frames.length / FRAMES_PER_ROW)
    const totalHeight = frameSize.height * totalRows

    // 拼接所有帧到精灵图
    await this.composeSpritesheet(
      frameBuffers,
      frameSize,
      FRAMES_PER_ROW,
      totalWidth,
      totalHeight,
      spritesheetPath
    )

    // 生成 PixiJS 兼容的 JSON 配置
    const jsonConfig = this.generatePixiJSJson(frames, animations, {
      width: totalWidth,
      height: totalHeight
    })

    // 保存 JSON
    await fs.writeFile(jsonPath, JSON.stringify(jsonConfig, null, 2), 'utf-8')

    return { spritesheetPath, jsonPath }
  }

  /**
   * 根据动画状态变换帧
   *
   * 对输入的帧 buffer 应用不同的图像变换，使每个动画状态具有独特的视觉效果。
   * 使用三角函数生成平滑的动画过渡。
   */
  private async transformFrame(
    inputBuffer: Buffer,
    state: string,
    frameIndex: number,
    totalFrames: number,
    frameSize: { width: number; height: number }
  ): Promise<Buffer> {
    const progress = totalFrames > 1 ? frameIndex / (totalFrames - 1) : 0

    let pipeline = sharp(inputBuffer)

    switch (state) {
      case 'idle': {
        // 上下浮动：垂直位移 + 呼吸缩放
        const yOffset = Math.sin(progress * Math.PI * 2) * 10
        const scale = 1 + Math.sin(progress * Math.PI) * 0.05

        pipeline = pipeline.resize(
          Math.round(frameSize.width * scale),
          Math.round(frameSize.height * scale),
          { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }
        )

        // 通过 extend 添加不对称内边距实现垂直位移
        const topPadding = Math.round(10 + yOffset)
        const bottomPadding = Math.round(10 - yOffset)
        pipeline = pipeline.extend({
          top: topPadding,
          bottom: bottomPadding,
          left: 10,
          right: 10,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        break
      }

      case 'walk': {
        // 左右位移 + 弹跳效果
        const xOffset = Math.sin(progress * Math.PI * 2) * 8
        const yOffset = Math.abs(Math.sin(progress * Math.PI * 2)) * 15

        pipeline = pipeline.extend({
          top: Math.round(10 + yOffset),
          bottom: Math.round(10 - yOffset),
          left: Math.round(10 + xOffset),
          right: Math.round(10 - xOffset),
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        break
      }

      case 'drag': {
        // 旋转摇晃效果
        const rotation = Math.sin(progress * Math.PI * 2) * 15
        pipeline = pipeline.rotate(rotation, {
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        break
      }

      case 'fall': {
        // 持续旋转效果
        const rotation = progress * 360
        pipeline = pipeline.rotate(rotation, {
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        break
      }

      case 'click': {
        // 缩放脉冲效果
        const scale = 1 + Math.sin(progress * Math.PI) * 0.3
        pipeline = pipeline.resize(
          Math.round(frameSize.width * scale),
          Math.round(frameSize.height * scale),
          { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }
        )
        break
      }
    }

    // 确保最终尺寸一致
    pipeline = pipeline.resize(frameSize.width, frameSize.height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })

    return pipeline.png().toBuffer()
  }

  /**
   * 拼接所有帧到精灵图
   *
   * 创建透明背景画布，将所有帧 buffer 按网格位置拼接到画布上。
   */
  private async composeSpritesheet(
    frameBuffers: Buffer[],
    frameSize: { width: number; height: number },
    framesPerRow: number,
    totalWidth: number,
    totalHeight: number,
    outputPath: string
  ): Promise<void> {
    // 创建透明背景画布
    const canvas = sharp({
      create: {
        width: totalWidth,
        height: totalHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })

    // 构建 composite 操作列表
    const compositeOperations = frameBuffers.map((buffer, index) => ({
      input: buffer,
      left: (index % framesPerRow) * frameSize.width,
      top: Math.floor(index / framesPerRow) * frameSize.height
    }))

    // 执行拼接
    await canvas.composite(compositeOperations).png().toFile(outputPath)
  }

  /**
   * 生成 PixiJS Spritesheet 兼容的 JSON 配置
   */
  private generatePixiJSJson(
    frames: FrameDefinition[],
    animations: AnimationDefinition[],
    size: { width: number; height: number }
  ): PixiJSSpritesheetJSON {
    const framesObj: Record<string, PixiJSFrame> = {}

    for (const frame of frames) {
      framesObj[frame.name] = {
        frame: {
          x: frame.x,
          y: frame.y,
          w: frame.width,
          h: frame.height
        },
        rotated: false,
        trimmed: false,
        spriteSourceSize: {
          x: 0,
          y: 0,
          w: frame.width,
          h: frame.height
        },
        sourceSize: {
          w: frame.width,
          h: frame.height
        }
      }
    }

    const animationsObj: Record<string, string[]> = {}
    for (const anim of animations) {
      animationsObj[anim.name] = anim.frames
    }

    return {
      frames: framesObj,
      animations: animationsObj,
      meta: {
        size: {
          w: size.width,
          h: size.height
        },
        scale: '1'
      }
    }
  }

  /**
   * 清理所有生成的精灵图资源
   *
   * 递归删除输出目录及其内容，忽略错误。
   */
  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.outputDir, { recursive: true, force: true })
    } catch {
      // 忽略清理错误
    }
  }
}
