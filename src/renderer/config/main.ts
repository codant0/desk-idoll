import './styles/config.css'
import { PetListPanel } from './components/PetListPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { ActionEditor } from './components/ActionEditor'
import { t, setLocale, detectLocale } from '@shared/i18n'
import type { PetConfig, AppConfig } from '@shared/types'

type TabId = 'basic' | 'animation' | 'appearance' | 'actions'

class ConfigApp {
  private appEl: HTMLElement
  private currentPetId: string | null = null
  private currentTab: TabId = 'basic'
  private config: AppConfig | null = null

  private petListPanel: PetListPanel
  private settingsPanel: SettingsPanel
  private actionEditor: ActionEditor

  constructor() {
    this.appEl = document.getElementById('app')!
    this.petListPanel = new PetListPanel(
      (petId) => this.selectPet(petId),
      (petId) => this.deletePet(petId),
      () => this.addPet()
    )
    this.settingsPanel = new SettingsPanel(() => this.saveCurrentPet())
    this.actionEditor = new ActionEditor(() => this.saveCurrentPet())
    this.init()
  }

  private async init(): Promise<void> {
    // Initialize i18n
    const settings = await window.electronAPI.getGlobalSettings()
    setLocale(settings.language === 'en' ? 'en' : detectLocale())

    this.config = await window.electronAPI.getAppConfig()
    this.render()
    this.bindTabEvents()

    // Listen for config changes from main process
    window.electronAPI.onConfigChanged(async () => {
      this.config = await window.electronAPI.getAppConfig()
      // Only update the pet list sidebar, preserve current editing state
      if (this.config) {
        this.petListPanel.render(
          document.getElementById('pet-list')!,
          this.config.pets,
          this.currentPetId
        )
      }
    })

    // Listen for switch-to-pet from main process via preload bridge
    window.electronAPI.onSwitchToPet?.((petId: string) => {
      this.selectPet(petId)
    })
  }

  private render(): void {
    if (!this.config) return

    this.appEl.innerHTML = `
      <aside class="sidebar">
        <div class="sidebar-header">
          <h1>Desk-Idoll</h1>
        </div>
        <div class="pet-list" id="pet-list"></div>
        <div class="sidebar-footer">
          <button class="btn btn-primary btn-block" id="btn-add-pet">${t('config.addPet')}</button>
          <button class="btn btn-secondary btn-block" id="btn-global-settings" style="margin-top: 8px;">${t('config.globalSettings')}</button>
        </div>
      </aside>
      <main class="main-content">
        <div class="content-header">
          <h2 id="content-title">${t('config.selectPet')}</h2>
          <div id="header-actions"></div>
        </div>
        <div class="tabs" id="tabs" style="display:none">
          <button class="tab active" data-tab="basic">${t('config.tab.basic')}</button>
          <button class="tab" data-tab="animation">${t('config.tab.animation')}</button>
          <button class="tab" data-tab="appearance">${t('config.tab.appearance')}</button>
          <button class="tab" data-tab="actions">${t('config.tab.actions')}</button>
        </div>
        <div class="content-body" id="content-body"></div>
      </main>
    `

    this.petListPanel.render(
      document.getElementById('pet-list')!,
      this.config.pets,
      this.currentPetId
    )

    this.bindTabEvents()

    const addBtn = document.getElementById('btn-add-pet')
    addBtn?.addEventListener('click', () => this.addPet())

    const globalBtn = document.getElementById('btn-global-settings')
    globalBtn?.addEventListener('click', () => this.showGlobalSettings())

    if (this.currentPetId) {
      this.renderCurrentTab()
    } else {
      this.renderEmptyState()
    }
  }

  private renderEmptyState(): void {
    const body = document.getElementById('content-body')!
    body.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">?</div>
        <div class="empty-text">${t('config.selectPetHint')}</div>
      </div>
    `
  }

  private renderCurrentTab(): void {
    const pet = this.config?.pets.find((p) => p.id === this.currentPetId)
    if (!pet) return

    const title = document.getElementById('content-title')!
    title.textContent = pet.name

    const tabsEl = document.getElementById('tabs')!
    tabsEl.style.display = 'flex'

    const body = document.getElementById('content-body')!

    switch (this.currentTab) {
      case 'basic':
        this.settingsPanel.renderBasic(body, pet)
        break
      case 'animation':
        this.settingsPanel.renderAnimation(body, pet)
        break
      case 'appearance':
        this.settingsPanel.renderAppearance(body, pet)
        break
      case 'actions':
        this.actionEditor.render(body, pet)
        break
    }
  }

  private bindTabEvents(): void {
    const tabs = document.querySelectorAll('.tab')
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'))
        tab.classList.add('active')
        this.currentTab = (tab as HTMLElement).dataset.tab as TabId
        this.renderCurrentTab()
      })
    })
  }

  private selectPet(petId: string): void {
    this.currentPetId = petId
    this.currentTab = 'basic'
    this.render()
  }

  private async deletePet(petId: string): Promise<void> {
    const pet = this.config?.pets.find((p) => p.id === petId)
    if (!pet) return

    const confirmMsg = t('config.confirmDeletePet').replace('{name}', pet.name)
    if (!confirm(confirmMsg)) return

    await window.electronAPI.deletePetConfig(petId)
    this.config = await window.electronAPI.getAppConfig()

    if (this.currentPetId === petId) {
      this.currentPetId = this.config.pets[0]?.id ?? null
    }
    this.render()
  }

  private async addPet(): Promise<void> {
    const newPet = await window.electronAPI.createPet()
    this.config = await window.electronAPI.getAppConfig()
    this.currentPetId = newPet.id
    this.currentTab = 'basic'
    this.render()
  }

  private async saveCurrentPet(): Promise<void> {
    if (!this.currentPetId || !this.config) return

    const pet = this.config.pets.find((p) => p.id === this.currentPetId)
    if (!pet) return

    await window.electronAPI.savePetConfig(pet)
    this.config = await window.electronAPI.getAppConfig()
  }

  private async showGlobalSettings(): Promise<void> {
    const settings = await window.electronAPI.getGlobalSettings()
    const platform = await window.electronAPI.getPlatform()

    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    `

    const dialog = document.createElement('div')
    dialog.style.cssText = `
      background: var(--bg-secondary); border-radius: var(--radius);
      padding: 24px; width: 400px; max-width: 90vw; box-shadow: var(--shadow);
    `

    dialog.innerHTML = `
      <h3 style="margin-bottom: 16px; font-size: 16px;">${t('config.globalSettings')}</h3>
      <div class="form-group">
        <label class="form-label">Language / 语言</label>
        <select class="form-select" id="gs-language">
          <option value="zh-CN" ${settings.language !== 'en' ? 'selected' : ''}>中文</option>
          <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
        </select>
      </div>
      ${platform !== 'darwin' ? `
      <div class="toggle-row">
        <span class="toggle-label">${t('config.gs.autoStart')}</span>
        <button class="toggle ${settings.autoStart ? 'active' : ''}" id="gs-auto-start" />
      </div>
      ` : ''}
      <div class="toggle-row">
        <span class="toggle-label">${t('config.gs.checkUpdate')}</span>
        <button class="toggle ${settings.checkUpdate ? 'active' : ''}" id="gs-check-update" />
      </div>
      <div class="form-group" style="margin-top: 12px;">
        <label class="form-label">${t('config.gs.maxInstances')}</label>
        <input class="form-input" id="gs-max-instances" type="number" min="1" max="20" value="${settings.maxInstances}" />
      </div>
      <div style="margin-top: 12px;">
        <button class="btn btn-secondary" id="gs-check-updates">${t('config.gs.checkForUpdates')}</button>
        <span id="gs-update-status" style="margin-left: 8px; font-size: 12px; color: var(--text-muted);"></span>
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px;">
        <button class="btn btn-secondary" id="gs-cancel">${t('config.action.cancel')}</button>
        <button class="btn btn-primary" id="gs-save">${t('config.action.save')}</button>
      </div>
    `

    overlay.appendChild(dialog)
    document.body.appendChild(overlay)

    // Toggle handlers
    let autoStart = settings.autoStart
    let checkUpdate = settings.checkUpdate

    const autoStartBtn = dialog.querySelector('#gs-auto-start') as HTMLButtonElement
    autoStartBtn?.addEventListener('click', () => {
      autoStart = !autoStart
      autoStartBtn.classList.toggle('active')
    })

    const checkUpdateBtn = dialog.querySelector('#gs-check-update') as HTMLButtonElement
    checkUpdateBtn?.addEventListener('click', () => {
      checkUpdate = !checkUpdate
      checkUpdateBtn.classList.toggle('active')
    })

    // Cancel
    dialog.querySelector('#gs-cancel')?.addEventListener('click', () => {
      document.body.removeChild(overlay)
    })

    // Check for updates
    const checkUpdatesBtn = dialog.querySelector('#gs-check-updates') as HTMLButtonElement
    const updateStatus = dialog.querySelector('#gs-update-status') as HTMLSpanElement
    checkUpdatesBtn?.addEventListener('click', async () => {
      updateStatus.textContent = t('config.checking')
      updateStatus.style.color = 'var(--text-muted)'
      try {
        const result = await window.electronAPI.checkForUpdates()
        if (result.hasUpdate) {
          updateStatus.textContent = t('config.updateFoundVersion').replace('{version}', result.version || '')
          updateStatus.style.color = 'var(--success)'
        } else {
          updateStatus.textContent = t('config.upToDate')
          updateStatus.style.color = 'var(--text-muted)'
        }
      } catch {
        updateStatus.textContent = t('config.checkFailed')
        updateStatus.style.color = 'var(--danger)'
      }
    })

    // Save
    dialog.querySelector('#gs-save')?.addEventListener('click', async () => {
      const maxInstances = parseInt(
        (dialog.querySelector('#gs-max-instances') as HTMLInputElement).value
      ) || 3
      const language = (
        dialog.querySelector('#gs-language') as HTMLSelectElement
      ).value as 'zh-CN' | 'en'

      await window.electronAPI.saveGlobalSettings({
        ...settings,
        language,
        autoStart,
        checkUpdate,
        maxInstances
      })

      // Apply language change
      setLocale(language === 'en' ? 'en' : 'zh-CN')

      // Apply auto-start
      if (platform !== 'darwin') {
        await window.electronAPI.setAutoLaunch(autoStart)
      }

      document.body.removeChild(overlay)
      this.render()
    })

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) document.body.removeChild(overlay)
    })
  }
}

// Start
new ConfigApp()
