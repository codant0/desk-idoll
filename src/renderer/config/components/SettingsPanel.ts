import type { PetConfig } from '@shared/types'
import { t } from '@shared/i18n'

export class SettingsPanel {
  private onChange: () => void

  constructor(onChange: () => void) {
    this.onChange = onChange
  }

  renderBasic(container: HTMLElement, pet: PetConfig): void {
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
          </select>
        </div>
      </div>

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
    const fps = 'fps' in pet.animations ? pet.animations.fps : 12

    container.innerHTML = `
      <div class="section">
        <div class="section-title">${t('config.tab.animation')}</div>
        <div class="form-group">
          <label class="form-label">${t('config.fps')}</label>
          <div class="slider-group">
            <input type="range" id="pet-fps" min="1" max="60" value="${fps}" />
            <span class="slider-value" id="fps-value">${fps}</span>
          </div>
        </div>
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
    `

    this.bindAnimationEvents(pet)
  }

  renderAppearance(container: HTMLElement, pet: PetConfig): void {
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
    const uploadArea = document.getElementById('upload-area')!
    const modelTypeSelect = document.getElementById('pet-model-type') as HTMLSelectElement

    // Model type change
    modelTypeSelect?.addEventListener('change', () => {
      pet.modelType = modelTypeSelect.value as 'sprite-sheet' | 'live2d'
      // Update upload section UI
      const title = document.getElementById('upload-section-title')
      const uploadText = document.getElementById('upload-text')
      const uploadHint = document.getElementById('upload-hint')
      if (title) title.textContent = pet.modelType === 'live2d' ? 'Live2D' : 'Sprite Sheet'
      if (uploadText) uploadText.textContent = pet.modelType === 'live2d' ? t('config.uploadLive2d') : t('config.upload')
      if (uploadHint) uploadHint.textContent = pet.modelType === 'live2d' ? t('config.uploadLive2dHint') : t('config.uploadHint')
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

    // Upload area click — file filter depends on model type
    uploadArea?.addEventListener('click', async () => {
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
    uploadArea?.addEventListener('dragover', (e) => {
      e.preventDefault()
      uploadArea.classList.add('dragover')
    })
    uploadArea?.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover')
    })
    uploadArea?.addEventListener('drop', (e) => {
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

  private bindAnimationEvents(pet: PetConfig): void {
    const fpsSlider = document.getElementById('pet-fps') as HTMLInputElement
    const fpsValue = document.getElementById('fps-value')!
    const walkSpeedSlider = document.getElementById('pet-walk-speed') as HTMLInputElement
    const walkSpeedValue = document.getElementById('walk-speed-value')!
    const idleTimeoutSlider = document.getElementById('pet-idle-timeout') as HTMLInputElement
    const idleTimeoutValue = document.getElementById('idle-timeout-value')!

    fpsSlider?.addEventListener('input', () => {
      const val = parseInt(fpsSlider.value)
      fpsValue.textContent = String(val)
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
