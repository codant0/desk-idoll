import type { PetConfig, StaticImageAnimationConfig } from '@shared/types'
import { t } from '@shared/i18n'
import { DEFAULT_STATIC_ANIMATION } from '@shared/constants'

export class SettingsPanel {
  private onChange: () => void
  private pollingInterval: NodeJS.Timeout | null = null

  constructor(onChange: () => void) {
    this.onChange = onChange
  }

  /**
   * 清理轮询间隔，防止内存泄漏
   */
  clearPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  renderBasic(container: HTMLElement, pet: PetConfig): void {
    this.clearPolling()
    const isStaticImage = pet.modelType === 'static-image'
    const staticConfig = isStaticImage ? (pet.animations as StaticImageAnimationConfig) : DEFAULT_STATIC_ANIMATION

    container.innerHTML = `
      <div class="section">
        <div class="section-title">${t('config.tab.basic')}</div>
        <div class="form-group">
          <label class="form-label">${t('config.name')}</label>
          <input class="form-input" id="pet-name" type="text" value="${this.escapeAttr(pet.name)}" placeholder="${t('config.namePlaceholder')}" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('config.modelType')}</label>
          <select class="form-select" id="pet-model-type">
            <option value="sprite-sheet" ${pet.modelType === 'sprite-sheet' ? 'selected' : ''}>Sprite Sheet</option>
            <option value="live2d" ${pet.modelType === 'live2d' ? 'selected' : ''}>Live2D</option>
            <option value="static-image" ${pet.modelType === 'static-image' ? 'selected' : ''}>${t('config.modelType.static')}</option>
          </select>
        </div>
      </div>

      ${isStaticImage ? `
      <div class="section" id="static-image-section">
        <div class="section-title">${t('config.uploadStatic')}</div>

        <!-- 图片上传区域 -->
        <div class="upload-area" id="static-upload-area" style="${staticConfig.imagePath ? 'display:none' : ''}">
          <div class="upload-icon">🖼️</div>
          <div class="upload-text">${t('config.uploadStatic')}</div>
          <div class="upload-hint">${t('config.uploadStaticHint')}</div>
        </div>

        <!-- 图片预览 -->
        <div class="image-preview" id="image-preview" style="${staticConfig.imagePath ? '' : 'display:none'}">
          <img id="preview-img" src="${staticConfig.imagePath ? `file://${staticConfig.imagePath}` : ''}" alt="Preview" />
          <button class="btn btn-sm btn-danger" id="remove-image">${t('config.remove')}</button>
        </div>

        <!-- AI动画生成 -->
        <div class="form-group" style="margin-top: 16px;">
          <label class="form-label">${t('config.aiAnimation')}</label>
          <div class="info-box">
            <p>${t('config.advanced.desc')}</p>
            <p class="text-muted">${t('config.advanced.requirement')}</p>
          </div>

          <!-- 服务状态 -->
          <div class="service-status" id="service-status">
            <span class="status-indicator" id="status-indicator"></span>
            <span id="status-text">${t('config.service.checking')}</span>
          </div>

          <!-- 处理按钮 -->
          <button class="btn btn-primary" id="start-processing" data-state="processing" disabled>
            ${t('config.startProcessing')}
          </button>

          <!-- 处理进度 -->
          <div class="progress-container" id="progress-container" style="display:none">
            <div class="progress-bar">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
            <div class="progress-text" id="progress-text">0%</div>
          </div>

          <!-- 处理状态 -->
          <div class="processing-status" id="processing-status" style="display:none">
            <span class="status-badge" id="status-badge"></span>
            <span id="status-message"></span>
          </div>
        </div>
      </div>
      ` : `
      <div class="section" id="upload-section">
        <div class="section-title" id="upload-section-title">${pet.modelType === 'live2d' ? 'Live2D' : 'Sprite Sheet'}</div>
        <div class="upload-area" id="upload-area">
          <div class="upload-icon">📁</div>
          <div class="upload-text" id="upload-text">${pet.modelType === 'live2d' ? t('config.uploadLive2d') : t('config.upload')}</div>
          <div class="upload-hint" id="upload-hint">${pet.modelType === 'live2d' ? t('config.uploadLive2dHint') : t('config.uploadHint')}</div>
        </div>
        <div class="form-group" style="margin-top: 12px;">
          <label class="form-label">${t('config.modelPath')}</label>
          <input class="form-input" id="pet-model-path" type="text" value="${this.escapeAttr(pet.modelPath)}" readonly />
        </div>
      </div>
      `}

      <div class="section">
        <div class="section-title">${t('config.width').split(' ')[0]}</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${t('config.width')}</label>
            <input class="form-input" id="pet-width" type="number" min="32" max="1024" value="${pet.size.width}" />
          </div>
          <div class="form-group">
            <label class="form-label">${t('config.height')}</label>
            <input class="form-input" id="pet-height" type="number" min="32" max="1024" value="${pet.size.height}" />
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">${t('config.edgeBehavior')}</div>
        <div class="form-group">
          <label class="form-label">${t('config.edgeBehavior')}</label>
          <select class="form-select" id="pet-edge-behavior">
            <option value="bounce" ${pet.behavior.screenEdgeBehavior === 'bounce' ? 'selected' : ''}>${t('config.edgeBounce')}</option>
            <option value="wrap" ${pet.behavior.screenEdgeBehavior === 'wrap' ? 'selected' : ''}>${t('config.edgeWrap')}</option>
            <option value="stop" ${pet.behavior.screenEdgeBehavior === 'stop' ? 'selected' : ''}>${t('config.edgeStop')}</option>
          </select>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">${t('config.randomWalk')}</span>
          <button class="toggle ${pet.behavior.randomWalk ? 'active' : ''}" id="pet-random-walk" />
        </div>
        <div class="toggle-row">
          <span class="toggle-label">${t('config.gravity')}</span>
          <button class="toggle ${pet.behavior.gravity ? 'active' : ''}" id="pet-gravity" />
        </div>
      </div>
    `

    this.bindBasicEvents(pet)
  }

  renderAnimation(container: HTMLElement, pet: PetConfig): void {
    this.clearPolling()
    const fps = 'fps' in pet.animations ? pet.animations.fps : 12
    const isStaticImage = pet.modelType === 'static-image'
    const staticConfig = isStaticImage ? (pet.animations as StaticImageAnimationConfig) : null

    container.innerHTML = `
      <div class="section">
        <div class="section-title">${t('config.tab.animation')}</div>
        ${!isStaticImage ? `
        <div class="form-group">
          <label class="form-label">${t('config.fps')}</label>
          <div class="slider-group">
            <input type="range" id="pet-fps" min="1" max="60" value="${fps}" />
            <span class="slider-value" id="fps-value">${fps}</span>
          </div>
        </div>
        ` : ''}
        <div class="form-group">
          <label class="form-label">${t('config.walkSpeed')}</label>
          <div class="slider-group">
            <input type="range" id="pet-walk-speed" min="0.5" max="10" step="0.5" value="${pet.behavior.walkSpeed}" />
            <span class="slider-value" id="walk-speed-value">${pet.behavior.walkSpeed}</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${t('config.idleTimeout')}</label>
          <div class="slider-group">
            <input type="range" id="pet-idle-timeout" min="1" max="30" value="${pet.behavior.idleTimeout / 1000}" />
            <span class="slider-value" id="idle-timeout-value">${pet.behavior.idleTimeout / 1000}</span>
          </div>
        </div>
      </div>

      ${isStaticImage && staticConfig ? `
      <div class="section">
        <div class="section-title">${t('config.animationParams')}</div>

        <div class="form-group">
          <label class="form-label">${t('config.idleAmplitude')}</label>
          <div class="slider-group">
            <input type="range" id="idle-amplitude" min="0" max="50" value="${staticConfig.idleAmplitude}" />
            <span class="slider-value" id="idle-amplitude-value">${staticConfig.idleAmplitude}</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${t('config.idleFrequency')}</label>
          <div class="slider-group">
            <input type="range" id="idle-frequency" min="0.5" max="5" step="0.1" value="${staticConfig.idleFrequency}" />
            <span class="slider-value" id="idle-frequency-value">${staticConfig.idleFrequency}</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${t('config.breatheScale')}</label>
          <div class="slider-group">
            <input type="range" id="breathe-scale" min="0" max="0.2" step="0.01" value="${staticConfig.breatheScale}" />
            <span class="slider-value" id="breathe-scale-value">${Math.round(staticConfig.breatheScale * 100)}%</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${t('config.walkBobHeight')}</label>
          <div class="slider-group">
            <input type="range" id="walk-bob-height" min="0" max="30" value="${staticConfig.walkBobHeight}" />
            <span class="slider-value" id="walk-bob-height-value">${staticConfig.walkBobHeight}</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${t('config.swayAngle')}</label>
          <div class="slider-group">
            <input type="range" id="sway-angle" min="0" max="30" value="${staticConfig.swayAngle}" />
            <span class="slider-value" id="sway-angle-value">${staticConfig.swayAngle}°</span>
          </div>
        </div>
      </div>
      ` : ''}
    `

    this.bindAnimationEvents(pet)
  }

  renderAppearance(container: HTMLElement, pet: PetConfig): void {
    this.clearPolling()
    container.innerHTML = `
      <div class="section">
        <div class="section-title">${t('config.tab.appearance')}</div>
        <div class="form-group">
          <label class="form-label">${t('config.opacity')}</label>
          <div class="slider-group">
            <input type="range" id="pet-opacity" min="0.1" max="1" step="0.05" value="${pet.opacity}" />
            <span class="slider-value" id="opacity-value">${Math.round(pet.opacity * 100)}%</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${t('config.zIndex')}</label>
          <input class="form-input" id="pet-zindex" type="number" min="0" max="9999" value="${pet.zIndex}" />
        </div>
      </div>

      <div class="section">
        <div class="section-title">${t('config.preview').split(' ')[0]}</div>
        <div class="preview-container" id="preview-container">
          <div class="preview-placeholder">${t('config.preview')}</div>
        </div>
      </div>
    `

    this.bindAppearanceEvents(pet)
  }

  private bindBasicEvents(pet: PetConfig): void {
    const nameInput = document.getElementById('pet-name') as HTMLInputElement
    const widthInput = document.getElementById('pet-width') as HTMLInputElement
    const heightInput = document.getElementById('pet-height') as HTMLInputElement
    const edgeSelect = document.getElementById('pet-edge-behavior') as HTMLSelectElement
    const randomWalkBtn = document.getElementById('pet-random-walk') as HTMLButtonElement
    const gravityBtn = document.getElementById('pet-gravity') as HTMLButtonElement
    const uploadArea = document.getElementById('upload-area')
    const modelTypeSelect = document.getElementById('pet-model-type') as HTMLSelectElement

    // Model type change
    modelTypeSelect?.addEventListener('change', () => {
      const newType = modelTypeSelect.value as 'sprite-sheet' | 'live2d' | 'static-image'
      if (newType === pet.modelType) return

      pet.modelType = newType

      // Initialize static image config if switching to static-image
      if (newType === 'static-image' && !('imagePath' in pet.animations)) {
        pet.animations = { ...DEFAULT_STATIC_ANIMATION }
      }

      // Re-render the basic tab to show appropriate UI
      const contentBody = document.querySelector('.content-body')
      if (contentBody) {
        this.renderBasic(contentBody, pet)
      }
      this.onChange()
    })

    nameInput?.addEventListener('change', () => {
      pet.name = nameInput.value
      this.onChange()
    })

    widthInput?.addEventListener('change', () => {
      pet.size.width = parseInt(widthInput.value) || 128
      this.onChange()
    })

    heightInput?.addEventListener('change', () => {
      pet.size.height = parseInt(heightInput.value) || 128
      this.onChange()
    })

    edgeSelect?.addEventListener('change', () => {
      pet.behavior.screenEdgeBehavior = edgeSelect.value as 'bounce' | 'wrap' | 'stop'
      this.onChange()
    })

    randomWalkBtn?.addEventListener('click', () => {
      pet.behavior.randomWalk = !pet.behavior.randomWalk
      randomWalkBtn.classList.toggle('active')
      this.onChange()
    })

    gravityBtn?.addEventListener('click', () => {
      pet.behavior.gravity = !pet.behavior.gravity
      gravityBtn.classList.toggle('active')
      this.onChange()
    })

    // Static image upload
    const staticUploadArea = document.getElementById('static-upload-area')
    if (staticUploadArea) {
      staticUploadArea.addEventListener('click', async () => {
        const filePath = await window.electronAPI.openFileDialog([
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }
        ])

        if (filePath) {
          // Validate image
          const validation = await window.electronAPI.validateImage(filePath)
          if (!validation.valid) {
            alert(validation.error)
            return
          }

          // Copy to assets directory
          const assetPath = await window.electronAPI.copyImageToAssets(filePath, pet.id)
          if ('imagePath' in pet.animations) {
            (pet.animations as StaticImageAnimationConfig).imagePath = assetPath
          }

          // Show preview
          const preview = document.getElementById('image-preview')
          const previewImg = document.getElementById('preview-img') as HTMLImageElement
          if (preview && previewImg) {
            previewImg.src = `file://${assetPath}`
            preview.style.display = 'block'
            staticUploadArea.style.display = 'none'
          }

          this.onChange()

          // 重新检查服务状态（现在有图片了，可以启用按钮）
          this.checkAnimatedDrawingsService()
        }
      })
    }

    // Remove image
    const removeImageBtn = document.getElementById('remove-image')
    removeImageBtn?.addEventListener('click', () => {
      if ('imagePath' in pet.animations) {
        (pet.animations as StaticImageAnimationConfig).imagePath = ''
      }
      const preview = document.getElementById('image-preview')
      const uploadAreaEl = document.getElementById('static-upload-area')
      if (preview) preview.style.display = 'none'
      if (uploadAreaEl) uploadAreaEl.style.display = 'block'
      this.onChange()
    })

    // Check AnimatedDrawings service on load (for static image mode)
    if (isStaticImage) {
      this.checkAnimatedDrawingsService()
    }

    // Start processing button
    const startProcessingBtn = document.getElementById('start-processing')
    startProcessingBtn?.addEventListener('click', async () => {
      const btn = startProcessingBtn as HTMLButtonElement
      console.log('[SettingsPanel] Button clicked, state:', btn.dataset.state)

      // 启动服务
      if (btn.dataset.state === 'start-service') {
        btn.disabled = true
        btn.textContent = t('config.service.starting')
        console.log('[SettingsPanel] Starting service...')

        try {
          const started = await window.electronAPI.startAnimatedDrawingsService()
          console.log('[SettingsPanel] Service started:', started)

          if (started) {
            btn.textContent = t('config.startProcessing')
            btn.dataset.state = 'processing'
            btn.disabled = false
            this.checkAnimatedDrawingsService()
          } else {
            btn.textContent = t('config.service.failed')
            setTimeout(() => {
              btn.textContent = t('config.service.start')
              btn.dataset.state = 'start-service'
              btn.disabled = false
            }, 2000)
          }
        } catch (error) {
          console.error('[SettingsPanel] Start service error:', error)
          btn.textContent = t('config.service.failed')
          btn.disabled = false
        }
        return
      }

      // 处理图片
      const staticAnim = pet.animations as StaticImageAnimationConfig
      console.log('[SettingsPanel] Processing image, imagePath:', staticAnim.imagePath)

      if (!staticAnim.imagePath) {
        console.log('[SettingsPanel] No image uploaded')
        alert(t('config.upload.first'))
        return
      }

      btn.disabled = true
      btn.textContent = t('config.processing')

      const progressContainer = document.getElementById('progress-container')
      const progressFill = document.getElementById('progress-fill')
      const progressText = document.getElementById('progress-text')
      if (progressContainer) progressContainer.style.display = 'block'

      try {
        console.log('[SettingsPanel] Calling processWithAnimatedDrawings...')
        const taskId = await window.electronAPI.processWithAnimatedDrawings(
          staticAnim.imagePath,
          staticAnim.animationStyle || 'walk',
          { width: pet.size.width, height: pet.size.height }
        )
        console.log('[SettingsPanel] Task created:', taskId)

        // Poll status
        this.clearPolling()
        this.pollingInterval = setInterval(async () => {
          try {
            const status = await window.electronAPI.getProcessingStatus(taskId)
            console.log('[SettingsPanel] Task status:', status)

            if (progressFill) progressFill.style.width = `${status.progress}%`
            if (progressText) progressText.textContent = `${status.progress}%`

            if (status.status === 'completed') {
              this.clearPolling()
              btn.textContent = t('config.processingStatus.completed')
              btn.disabled = false

              // Update spritesheet path
              if (status.result) {
                console.log('[SettingsPanel] Processing completed, result:', status.result)
                pet.modelPath = status.result.jsonPath
                pet.modelType = 'sprite-sheet'
                this.onChange()
              }
            } else if (status.status === 'error') {
              this.clearPolling()
              btn.textContent = t('config.processingStatus.error')
              btn.disabled = false
              console.error('[SettingsPanel] Processing error:', status.error)
              alert(`${t('config.processing.failed')}: ${status.error}`)
            }
          } catch (pollError) {
            console.error('[SettingsPanel] Poll error:', pollError)
          }
        }, 1000)
      } catch (error) {
        btn.textContent = t('config.startProcessing')
        btn.disabled = false
        console.error('[SettingsPanel] Processing error:', error)
        alert(`${t('config.processing.failed')}: ${error}`)
      }
    })

    // Non-static image upload area (existing behavior)
    if (uploadArea && pet.modelType !== 'static-image') {
      uploadArea.addEventListener('click', async () => {
        const isLive2D = pet.modelType === 'live2d'
        const filters = isLive2D
          ? [{ name: 'Live2D Model', extensions: ['json'] }]
          : [{ name: 'Sprite Sheet JSON', extensions: ['json'] }]
        const filePath = await window.electronAPI.openFileDialog(filters)
        if (filePath) {
          pet.modelPath = filePath
          const pathInput = document.getElementById('pet-model-path') as HTMLInputElement
          if (pathInput) pathInput.value = filePath
          this.onChange()
        }
      })

      // Drag and drop
      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault()
        uploadArea.classList.add('dragover')
      })
      uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover')
      })
      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault()
        uploadArea.classList.remove('dragover')
        const files = e.dataTransfer?.files
        if (files && files.length > 0) {
          const file = files[0]
          if (file.name.endsWith('.json')) {
            // Auto-detect Live2D model file
            if (file.name.endsWith('.model3.json')) {
              pet.modelType = 'live2d'
            }
            pet.modelPath = file.path
            const pathInput = document.getElementById('pet-model-path') as HTMLInputElement
            if (pathInput) pathInput.value = file.path
            this.onChange()
          }
        }
      })
    }
  }

  private async checkAnimatedDrawingsService(): Promise<void> {
    const statusIndicator = document.getElementById('status-indicator')
    const statusText = document.getElementById('status-text')
    const startBtn = document.getElementById('start-processing') as HTMLButtonElement

    if (!statusIndicator || !statusText || !startBtn) {
      console.log('[SettingsPanel] checkAnimatedDrawingsService: UI elements not found')
      return
    }

    console.log('[SettingsPanel] checkAnimatedDrawingsService: Starting check...')

    // 检查服务状态
    statusText.textContent = t('config.service.checking')
    statusIndicator.className = 'status-indicator checking'

    try {
      const isAvailable = await window.electronAPI.checkAnimatedDrawingsService()
      console.log('[SettingsPanel] Service available:', isAvailable)

      if (isAvailable) {
        statusIndicator.className = 'status-indicator online'
        statusText.textContent = t('config.service.available')
        startBtn.disabled = false
        startBtn.textContent = t('config.startProcessing')
        startBtn.dataset.state = 'processing'
      } else {
        statusIndicator.className = 'status-indicator offline'
        statusText.textContent = t('config.service.unavailable')
        startBtn.disabled = false
        startBtn.textContent = t('config.service.start')
        startBtn.dataset.state = 'start-service'
      }
    } catch (error) {
      console.error('[SettingsPanel] checkAnimatedDrawingsService error:', error)
      statusIndicator.className = 'status-indicator error'
      statusText.textContent = t('config.checkFailed')
      startBtn.disabled = true
    }
  }

  private bindAnimationEvents(pet: PetConfig): void {
    const fpsSlider = document.getElementById('pet-fps') as HTMLInputElement
    const fpsValue = document.getElementById('fps-value')
    const walkSpeedSlider = document.getElementById('pet-walk-speed') as HTMLInputElement
    const walkSpeedValue = document.getElementById('walk-speed-value')!
    const idleTimeoutSlider = document.getElementById('pet-idle-timeout') as HTMLInputElement
    const idleTimeoutValue = document.getElementById('idle-timeout-value')!

    fpsSlider?.addEventListener('input', () => {
      const val = parseInt(fpsSlider.value)
      if (fpsValue) fpsValue.textContent = String(val)
      if ('fps' in pet.animations) {
        pet.animations.fps = val
      }
    })
    fpsSlider?.addEventListener('change', () => this.onChange())

    walkSpeedSlider?.addEventListener('input', () => {
      const val = parseFloat(walkSpeedSlider.value)
      walkSpeedValue.textContent = String(val)
      pet.behavior.walkSpeed = val
    })
    walkSpeedSlider?.addEventListener('change', () => this.onChange())

    idleTimeoutSlider?.addEventListener('input', () => {
      const val = parseInt(idleTimeoutSlider.value)
      idleTimeoutValue.textContent = String(val)
      pet.behavior.idleTimeout = val * 1000
    })
    idleTimeoutSlider?.addEventListener('change', () => this.onChange())

    // Static image animation parameter sliders
    if (pet.modelType === 'static-image' && 'idleAmplitude' in pet.animations) {
      const sliders = [
        { id: 'idle-amplitude', key: 'idleAmplitude', format: (v: number) => String(v) },
        { id: 'idle-frequency', key: 'idleFrequency', format: (v: number) => String(v) },
        { id: 'breathe-scale', key: 'breatheScale', format: (v: number) => `${Math.round(v * 100)}%` },
        { id: 'walk-bob-height', key: 'walkBobHeight', format: (v: number) => String(v) },
        { id: 'sway-angle', key: 'swayAngle', format: (v: number) => `${v}°` }
      ]

      sliders.forEach(({ id, key, format }) => {
        const slider = document.getElementById(id) as HTMLInputElement
        const valueEl = document.getElementById(`${id}-value`)

        if (slider && valueEl) {
          slider.addEventListener('input', () => {
            const value = parseFloat(slider.value)
            ;(pet.animations as StaticImageAnimationConfig)[key as keyof StaticImageAnimationConfig] = value as never
            valueEl.textContent = format(value)
          })
          slider.addEventListener('change', () => this.onChange())
        }
      })
    }
  }

  private bindAppearanceEvents(pet: PetConfig): void {
    const opacitySlider = document.getElementById('pet-opacity') as HTMLInputElement
    const opacityValue = document.getElementById('opacity-value')!
    const zindexInput = document.getElementById('pet-zindex') as HTMLInputElement

    opacitySlider?.addEventListener('input', () => {
      const val = parseFloat(opacitySlider.value)
      opacityValue.textContent = `${Math.round(val * 100)}%`
      pet.opacity = val
    })
    opacitySlider?.addEventListener('change', () => this.onChange())

    zindexInput?.addEventListener('change', () => {
      pet.zIndex = parseInt(zindexInput.value) || 0
      this.onChange()
    })
  }

  private escapeAttr(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  }
}
