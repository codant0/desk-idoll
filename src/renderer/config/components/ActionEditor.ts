import type { PetConfig, PetAction } from '@shared/types'
import { randomUUID } from '@shared/utils'
import { t } from '@shared/i18n'

export class ActionEditor {
  private onChange: () => void

  constructor(onChange: () => void) {
    this.onChange = onChange
  }

  render(container: HTMLElement, pet: PetConfig): void {
    const actions = pet.actions || []

    container.innerHTML = `
      <div class="section">
        <div class="section-title">${t('config.tab.actions')}</div>
        <div class="action-list" id="action-list">
          ${actions.map((action, i) => this.renderActionItem(action, i)).join('')}
        </div>
        ${actions.length === 0 ? `<div style="color: var(--text-muted); font-size: 13px; padding: 12px 0;">${t('config.action.noActions')}</div>` : ''}
        <div style="margin-top: 12px;">
          <button class="btn btn-secondary" id="btn-add-action">${t('config.action.add')}</button>
        </div>
      </div>
    `

    this.bindEvents(container, pet)
  }

  private renderActionItem(action: PetAction, index: number): string {
    const typeIcon = this.getActionTypeIcon(action.type)
    const typeName = this.getActionTypeName(action.type)

    return `
      <div class="action-item" data-index="${index}">
        <div class="action-icon">${typeIcon}</div>
        <div class="action-info">
          <div class="action-name">${this.escapeHtml(action.name)}</div>
          <div class="action-detail">${typeName}: ${this.escapeHtml(action.payload)}</div>
        </div>
        <button class="btn btn-sm btn-secondary action-edit" data-index="${index}">${t('config.action.edit')}</button>
        <button class="btn btn-sm btn-danger action-delete" data-index="${index}">${t('config.action.delete')}</button>
      </div>
    `
  }

  private bindEvents(container: HTMLElement, pet: PetConfig): void {
    const addBtn = document.getElementById('btn-add-action')
    addBtn?.addEventListener('click', () => this.showAddDialog(pet))

    document.querySelectorAll('.action-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = parseInt((btn as HTMLElement).dataset.index!)
        this.showEditDialog(pet, index)
      })
    })

    document.querySelectorAll('.action-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = parseInt((btn as HTMLElement).dataset.index!)
        pet.actions.splice(index, 1)
        this.onChange()
        this.render(container, pet)
      })
    })
  }

  private showAddDialog(pet: PetConfig): void {
    const action: PetAction = {
      id: randomUUID(),
      trigger: 'left-click',
      type: 'show-message',
      payload: '',
      name: '',
      confirmBeforeExecute: false
    }
    this.showActionDialog(pet, action, true)
  }

  private showEditDialog(pet: PetConfig, index: number): void {
    const action = pet.actions[index]
    if (!action) return
    this.showActionDialog(pet, action, false)
  }

  private showActionDialog(pet: PetConfig, action: PetAction, isNew: boolean): void {
    // Create modal overlay
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    `

    const dialog = document.createElement('div')
    dialog.style.cssText = `
      background: var(--bg-secondary); border-radius: var(--radius);
      padding: 24px; width: 400px; max-width: 90vw;
      box-shadow: var(--shadow);
    `

    dialog.innerHTML = `
      <h3 style="margin-bottom: 16px; font-size: 16px;">${isNew ? t('config.action.addTitle') : t('config.action.editTitle')}</h3>
      <div class="form-group">
        <label class="form-label">${t('config.action.name')}</label>
        <input class="form-input" id="dialog-name" type="text" value="${this.escapeAttr(action.name)}" placeholder="..." />
      </div>
      <div class="form-group">
        <label class="form-label">${t('config.action.type')}</label>
        <select class="form-select" id="dialog-type">
          <option value="open-url" ${action.type === 'open-url' ? 'selected' : ''}>${t('config.action.openUrl')}</option>
          <option value="execute-cmd" ${action.type === 'execute-cmd' ? 'selected' : ''}>${t('config.action.executeCmd')}</option>
          <option value="show-message" ${action.type === 'show-message' ? 'selected' : ''}>${t('config.action.showMessage')}</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" id="dialog-payload-label">${t('config.action.payload')}</label>
        <input class="form-input" id="dialog-payload" type="text" value="${this.escapeAttr(action.payload)}" placeholder="..." />
      </div>
      <div class="toggle-row">
        <span class="toggle-label">${t('config.action.confirm')}</span>
        <button class="toggle ${action.confirmBeforeExecute ? 'active' : ''}" id="dialog-confirm" />
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px;">
        <button class="btn btn-secondary" id="dialog-cancel">${t('config.action.cancel')}</button>
        <button class="btn btn-primary" id="dialog-save">${t('config.action.save')}</button>
      </div>
    `

    overlay.appendChild(dialog)
    document.body.appendChild(overlay)

    // Focus first input
    const nameInput = dialog.querySelector('#dialog-name') as HTMLInputElement
    nameInput?.focus()

    // Update payload label based on type
    const typeSelect = dialog.querySelector('#dialog-type') as HTMLSelectElement
    const payloadLabel = dialog.querySelector('#dialog-payload-label')!
    const updateLabel = () => {
      switch (typeSelect.value) {
        case 'open-url':
          payloadLabel.textContent = t('config.action.url')
          break
        case 'execute-cmd':
          payloadLabel.textContent = t('config.action.cmd')
          break
        case 'show-message':
          payloadLabel.textContent = t('config.action.msg')
          break
      }
    }
    updateLabel()
    typeSelect?.addEventListener('change', updateLabel)

    // Toggle
    const confirmBtn = dialog.querySelector('#dialog-confirm') as HTMLButtonElement
    let confirmValue = action.confirmBeforeExecute
    confirmBtn?.addEventListener('click', () => {
      confirmValue = !confirmValue
      confirmBtn.classList.toggle('active')
    })

    // Cancel
    const cancelBtn = dialog.querySelector('#dialog-cancel')
    cancelBtn?.addEventListener('click', () => {
      document.body.removeChild(overlay)
    })

    // Save
    const saveBtn = dialog.querySelector('#dialog-save')
    saveBtn?.addEventListener('click', () => {
      const name = (dialog.querySelector('#dialog-name') as HTMLInputElement).value.trim()
      const type = (dialog.querySelector('#dialog-type') as HTMLSelectElement).value as PetAction['type']
      const payload = (dialog.querySelector('#dialog-payload') as HTMLInputElement).value.trim()

      if (!name) {
        nameInput.style.borderColor = 'var(--danger)'
        return
      }

      action.name = name
      action.type = type
      action.payload = payload
      action.confirmBeforeExecute = confirmValue

      if (isNew) {
        pet.actions.push(action)
      }

      document.body.removeChild(overlay)
      this.onChange()

      // Re-render
      const contentBody = document.getElementById('content-body')
      if (contentBody) this.render(contentBody, pet)
    })

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) document.body.removeChild(overlay)
    })
  }

  private getActionTypeIcon(type: string): string {
    switch (type) {
      case 'open-url':
        return '🔗'
      case 'execute-cmd':
        return '⚡'
      case 'show-message':
        return '💬'
      default:
        return '❓'
    }
  }

  private getActionTypeName(type: string): string {
    switch (type) {
      case 'open-url':
        return t('config.action.openUrl')
      case 'execute-cmd':
        return t('config.action.executeCmd')
      case 'show-message':
        return t('config.action.showMessage')
      default:
        return '???'
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  private escapeAttr(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  }
}
