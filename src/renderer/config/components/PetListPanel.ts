import type { PetConfig } from '@shared/types'
import { t } from '@shared/i18n'

export class PetListPanel {
  private onSelect: (petId: string) => void
  private onDelete: (petId: string) => void
  private onAdd: () => void

  constructor(
    onSelect: (petId: string) => void,
    onDelete: (petId: string) => void,
    onAdd: () => void
  ) {
    this.onSelect = onSelect
    this.onDelete = onDelete
    this.onAdd = onAdd
  }

  render(container: HTMLElement, pets: PetConfig[], activePetId: string | null): void {
    if (pets.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 24px;">
          <div class="empty-text">${t('config.selectPetHint')}</div>
        </div>
      `
      return
    }

    container.innerHTML = pets
      .map(
        (pet) => `
      <div class="pet-item ${pet.id === activePetId ? 'active' : ''}" data-pet-id="${pet.id}">
        <div class="pet-icon">${pet.modelType === 'live2d' ? 'L' : 'S'}</div>
        <div class="pet-info">
          <div class="pet-name">${this.escapeHtml(pet.name)}</div>
          <div class="pet-type">${pet.modelType === 'live2d' ? 'Live2D' : 'Sprite Sheet'}</div>
        </div>
        <button class="pet-delete" data-pet-id="${pet.id}" title="${t('config.action.delete')}">×</button>
      </div>
    `
      )
      .join('')

    // Bind click events
    container.querySelectorAll('.pet-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        if (target.closest('.pet-delete')) return
        const petId = (item as HTMLElement).dataset.petId
        if (petId) this.onSelect(petId)
      })
    })

    container.querySelectorAll('.pet-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const petId = (btn as HTMLElement).dataset.petId
        if (petId) this.onDelete(petId)
      })
    })
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}
