export type Locale = 'zh-CN' | 'en'

const translations: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    // 托盘菜单
    'tray.show': '显示全部桌宠',
    'tray.hide': '隐藏全部桌宠',
    'tray.add': '添加新桌宠',
    'tray.settings': '设置',
    'tray.quit': '退出',
    'tray.showPet': '显示',
    'tray.hidePet': '隐藏',
    'tray.editPet': '编辑',
    'tray.deletePet': '删除',

    // 配置窗口
    'config.title': 'Desk-Idoll 设置',
    'config.addPet': '+ 添加桌宠',
    'config.globalSettings': '全局设置',
    'config.selectPet': '选择一个桌宠',
    'config.selectPetHint': '选择左侧桌宠进行编辑，或点击下方按钮添加新桌宠',

    // 设置标签
    'config.tab.basic': '基本设置',
    'config.tab.animation': '动画参数',
    'config.tab.appearance': '外观',
    'config.tab.actions': '动作',

    // 基本设置
    'config.name': '桌宠名称',
    'config.namePlaceholder': '给桌宠起个名字',
    'config.modelType': '模型类型',
    'config.upload': '点击或拖拽上传 Sprite Sheet',
    'config.uploadHint': '支持 JSON + PNG 文件（PixiJS 格式）',
    'config.uploadLive2d': '点击或拖拽上传 Live2D 模型',
    'config.uploadLive2dHint': '支持 .model3.json 文件（Cubism 格式）',
    'config.modelPath': '当前模型路径',
    'config.width': '宽度 (px)',
    'config.height': '高度 (px)',
    'config.edgeBehavior': '屏幕边缘行为',
    'config.edgeBounce': '反弹',
    'config.edgeWrap': '穿越',
    'config.edgeStop': '停止',
    'config.randomWalk': '随机行走',
    'config.gravity': '重力效果',

    // 动画参数
    'config.fps': '帧率 (FPS)',
    'config.walkSpeed': '行走速度',
    'config.idleTimeout': '待机超时 (秒)',

    // 外观
    'config.opacity': '透明度',
    'config.zIndex': '层级 (Z-Index)',
    'config.preview': '预览将在桌宠窗口中实时生效',

    // 动作
    'config.action.add': '+ 添加动作',
    'config.action.edit': '编辑',
    'config.action.delete': '删除',
    'config.action.name': '动作名称',
    'config.action.type': '动作类型',
    'config.action.openUrl': '打开网址',
    'config.action.executeCmd': '执行命令',
    'config.action.showMessage': '显示消息',
    'config.action.payload': '内容',
    'config.action.url': '网址 (URL)',
    'config.action.cmd': '命令 (CMD)',
    'config.action.msg': '消息内容',
    'config.action.confirm': '执行前确认',
    'config.action.cancel': '取消',
    'config.action.save': '保存',
    'config.action.noActions': '暂无动作，点击下方按钮添加',
    'config.action.addTitle': '添加动作',
    'config.action.editTitle': '编辑动作',

    // 全局设置
    'config.gs.restartNow': '立即重启',
    'config.gs.later': '稍后',
    'config.gs.download': '下载',
    'config.gs.updateReady': '更新已下载',
    'config.gs.autoStart': '开机自启动',
    'config.gs.checkUpdate': '启动时检查更新',
    'config.gs.maxInstances': '最大桌宠实例数',
    'config.gs.checkForUpdates': '检查更新',
    'config.gs.checking': '检查中...',
    'config.gs.upToDate': '已是最新版本',
    'config.gs.updateFound': '发现新版本',
    'config.gs.checkFailed': '检查失败',

    // 确认
    'config.confirmDelete': '确定要删除桌宠吗？',

    // 通知
    'notify.welcome': 'Desk-Idoll 已启动',
    'notify.welcomeBody': '右键点击桌宠可以打开菜单，选择"设置"来自定义你的桌宠。拖拽桌宠可以移动位置。',

    // 动作反馈
    'feedback.success': '✓',
    'feedback.fail': '✗'
  },
  en: {
    // Tray menu
    'tray.show': 'Show All Pets',
    'tray.hide': 'Hide All Pets',
    'tray.add': 'Add New Pet',
    'tray.settings': 'Settings',
    'tray.quit': 'Quit',
    'tray.showPet': 'Show',
    'tray.hidePet': 'Hide',
    'tray.editPet': 'Edit',
    'tray.deletePet': 'Delete',

    // Config window
    'config.title': 'Desk-Idoll Settings',
    'config.addPet': '+ Add Pet',
    'config.globalSettings': 'Global Settings',
    'config.selectPet': 'Select a Pet',
    'config.selectPetHint': 'Select a pet from the left to edit, or click below to add a new one',

    // Tabs
    'config.tab.basic': 'Basic',
    'config.tab.animation': 'Animation',
    'config.tab.appearance': 'Appearance',
    'config.tab.actions': 'Actions',

    // Basic settings
    'config.name': 'Pet Name',
    'config.namePlaceholder': 'Give your pet a name',
    'config.modelType': 'Model Type',
    'config.upload': 'Click or drag to upload Sprite Sheet',
    'config.uploadHint': 'Supports JSON + PNG files (PixiJS format)',
    'config.uploadLive2d': 'Click or drag to upload Live2D model',
    'config.uploadLive2dHint': 'Supports .model3.json files (Cubism format)',
    'config.modelPath': 'Current Model Path',
    'config.width': 'Width (px)',
    'config.height': 'Height (px)',
    'config.edgeBehavior': 'Screen Edge Behavior',
    'config.edgeBounce': 'Bounce',
    'config.edgeWrap': 'Wrap',
    'config.edgeStop': 'Stop',
    'config.randomWalk': 'Random Walk',
    'config.gravity': 'Gravity',

    // Animation
    'config.fps': 'Frame Rate (FPS)',
    'config.walkSpeed': 'Walk Speed',
    'config.idleTimeout': 'Idle Timeout (sec)',

    // Appearance
    'config.opacity': 'Opacity',
    'config.zIndex': 'Z-Index',
    'config.preview': 'Preview will take effect in the pet window in real-time',

    // Actions
    'config.action.add': '+ Add Action',
    'config.action.edit': 'Edit',
    'config.action.delete': 'Delete',
    'config.action.name': 'Action Name',
    'config.action.type': 'Action Type',
    'config.action.openUrl': 'Open URL',
    'config.action.executeCmd': 'Execute Command',
    'config.action.showMessage': 'Show Message',
    'config.action.payload': 'Content',
    'config.action.url': 'URL',
    'config.action.cmd': 'Command (CMD)',
    'config.action.msg': 'Message Content',
    'config.action.confirm': 'Confirm Before Execute',
    'config.action.cancel': 'Cancel',
    'config.action.save': 'Save',
    'config.action.noActions': 'No actions yet. Click below to add one.',
    'config.action.addTitle': 'Add Action',
    'config.action.editTitle': 'Edit Action',

    // Global settings
    'config.gs.restartNow': 'Restart Now',
    'config.gs.later': 'Later',
    'config.gs.download': 'Download',
    'config.gs.updateReady': 'Update Downloaded',
    'config.gs.autoStart': 'Launch at Startup',
    'config.gs.checkUpdate': 'Check for Updates on Start',
    'config.gs.maxInstances': 'Max Pet Instances',
    'config.gs.checkForUpdates': 'Check for Updates',
    'config.gs.checking': 'Checking...',
    'config.gs.upToDate': 'Up to date',
    'config.gs.updateFound': 'Update available',
    'config.gs.checkFailed': 'Check failed',

    // Confirmations
    'config.confirmDelete': 'Are you sure you want to delete this pet?',

    // Notifications
    'notify.welcome': 'Desk-Idoll Started',
    'notify.welcomeBody': 'Right-click the pet to open the menu. Select "Settings" to customize your pet. Drag to move.',

    // Feedback
    'feedback.success': '✓',
    'feedback.fail': '✗'
  }
}

let currentLocale: Locale = 'zh-CN'

export function setLocale(locale: Locale): void {
  currentLocale = locale
}

export function getLocale(): Locale {
  return currentLocale
}

export function t(key: string): string {
  return translations[currentLocale]?.[key] ?? translations['zh-CN']?.[key] ?? key
}

export function detectLocale(): Locale {
  const lang = navigator.language || 'zh-CN'
  if (lang.startsWith('en')) return 'en'
  return 'zh-CN'
}
