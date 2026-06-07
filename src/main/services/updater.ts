import { autoUpdater } from 'electron-updater'
import { BrowserWindow, dialog } from 'electron'
import { logger } from './logger'
import { t } from '../../shared/i18n'

export class UpdaterManager {
  private isChecking = false

  init(): void {
    // Configure auto-updater
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      logger.info('Checking for updates...')
      this.isChecking = true
    })

    autoUpdater.on('update-available', (info) => {
      logger.info('Update available:', info.version)
      this.isChecking = false
      this.promptDownload(info.version)
    })

    autoUpdater.on('update-not-available', () => {
      logger.info('No update available')
      this.isChecking = false
    })

    autoUpdater.on('error', (error) => {
      logger.error('Auto-updater error', error)
      this.isChecking = false
    })

    autoUpdater.on('download-progress', (progress) => {
      logger.debug(`Download progress: ${progress.percent.toFixed(1)}%`)
    })

    autoUpdater.on('update-downloaded', (info) => {
      logger.info('Update downloaded:', info.version)
      this.promptInstall(info.version)
    })
  }

  /**
   * Manually check for updates (triggered by user)
   */
  async checkForUpdates(): Promise<{ hasUpdate: boolean; version?: string }> {
    if (this.isChecking) return { hasUpdate: false }

    try {
      const result = await autoUpdater.checkForUpdates()
      if (result?.updateInfo) {
        return {
          hasUpdate: true,
          version: result.updateInfo.version
        }
      }
      return { hasUpdate: false }
    } catch (error) {
      logger.error('Manual update check failed', error)
      return { hasUpdate: false }
    }
  }

  /**
   * Download available update
   */
  async downloadUpdate(): Promise<void> {
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      logger.error('Download update failed', error)
    }
  }

  /**
   * Quit and install update
   */
  quitAndInstall(): void {
    autoUpdater.quitAndInstall(false, true)
  }

  private async promptDownload(version: string): Promise<void> {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    const parent = focusedWindow && !focusedWindow.isDestroyed() ? focusedWindow : undefined

    const result = await dialog.showMessageBox(parent ?? undefined, {
      type: 'info',
      title: t('config.gs.updateFound'),
      message: `Desk-Idoll v${version}`,
      detail: `${t('config.gs.download')}?`,
      buttons: [t('config.gs.download'), t('config.gs.later')],
      defaultId: 0,
      cancelId: 1
    })

    if (result.response === 0) {
      this.downloadUpdate()
    }
  }

  private async promptInstall(version: string): Promise<void> {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    const parent = focusedWindow && !focusedWindow.isDestroyed() ? focusedWindow : undefined

    const result = await dialog.showMessageBox(parent ?? undefined, {
      type: 'info',
      title: t('config.gs.updateReady'),
      message: `Desk-Idoll v${version}`,
      detail: t('config.gs.restartNow'),
      buttons: [t('config.gs.restartNow'), t('config.gs.later')],
      defaultId: 0,
      cancelId: 1
    })

    if (result.response === 0) {
      this.quitAndInstall()
    }
  }
}
