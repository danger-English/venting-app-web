import { Game } from './game.js'
import { getState, resetState, hasVisited, markVisited } from './state.js'
import { detectEmotion, EMOTION_LABELS } from './emotions.js'
import { vibrate, showToast, showModal } from './utils.js'

const GUN_EMOTIONS = ['我艹', '去死吧', '傻逼', '烦死了', '气死我了', '无语', '垃圾', '滚']
const DART_EMOTIONS = ['中!', '扎!', '刺穿!', '受死!', '死!', '瞄准!', '命中!', '贯穿!']

let game = null
let comboWords = []
let comboCount = 0
let comboActive = false
let comboTimer = null
let comboCountdownTimer = null
let attackMode = 'gun'
let showCustomInput = false
let inputMode = 'text'
let isRecording = false
let voiceSupported = false
let mediaRecorder = null
let audioChunks = []

// ===== 初始化 =====
window.addEventListener('DOMContentLoaded', () => {
  const canvasEl = document.getElementById('gameCanvas')
  game = new Game(canvasEl)
  game.startBgParticles()

  // 新手引导
  if (!hasVisited()) {
    showOnboarding()
    markVisited()
  }

  // 照片上传
  setupPhotoUpload()

  // 情绪按钮
  renderEmotionButtons()

  // 事件绑定
  bindEvents()

  // 语音支持检测
  checkVoiceSupport()

  // 窗口大小变化
  window.addEventListener('resize', () => game.resize())

  // Canvas 长按换照片
  setupLongPress(canvasEl)
})

// ===== 照片上传 =====
function setupPhotoUpload() {
  const fileInput = document.getElementById('photoInput')
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      game.loadFaceFromDataURL(ev.target.result)
      showToast('照片已设置')
      hideOnboarding()
    }
    reader.readAsDataURL(file)
  })
}

// ===== 长按换照片 =====
function setupLongPress(el) {
  let timer = null
  el.addEventListener('touchstart', (e) => {
    timer = setTimeout(() => {
      document.getElementById('photoInput').click()
    }, 600)
  })
  el.addEventListener('touchend', () => clearTimeout(timer))
  el.addEventListener('touchmove', () => clearTimeout(timer))
  // 桌面端右键
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    document.getElementById('photoInput').click()
  })
}

// ===== 新手引导 =====
function showOnboarding() {
  document.getElementById('onboarding').classList.add('show')
}

function hideOnboarding() {
  document.getElementById('onboarding').classList.remove('show')
}

// ===== 情绪按钮 =====
function renderEmotionButtons() {
  const container = document.getElementById('emotionRow')
  const emotions = attackMode === 'dart' ? DART_EMOTIONS : GUN_EMOTIONS
  container.innerHTML = ''
  emotions.forEach((text, i) => {
    const btn = document.createElement('button')
    btn.className = `emotion-btn ${attackMode === 'dart' ? 'dart-btn' : ''}`
    btn.textContent = text
    btn.dataset.text = text
    btn.dataset.index = i
    btn.addEventListener('click', () => onEmotionTap(text, btn))
    container.appendChild(btn)
  })
}

function onEmotionTap(text, btn) {
  if (game.isAttacking()) return
  btn.classList.add('btn-anim')
  setTimeout(() => btn.classList.remove('btn-anim'), 300)
  accumulateHit(text)
}

// ===== 事件绑定 =====
function bindEvents() {
  // 模式切换
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode
      if (mode === attackMode || game.isAttacking()) return
      attackMode = mode
      updateModeUI()
      game.switchMode(mode)
      renderEmotionButtons()
      clearCombo()
      showToast(mode === 'dart' ? '切换到飞镖模式' : '切换到机关枪模式')
      vibrate('light')
    })
  })

  // 装弹按钮
  document.getElementById('customBtn').addEventListener('click', () => {
    if (game.isAttacking()) return
    openCustomInput()
  })

  // 输入确认
  document.getElementById('sendBtn').addEventListener('click', confirmInput)
  document.getElementById('cancelBtn').addEventListener('click', closeCustomInput)
  document.getElementById('customInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmInput()
  })

  // 输入实时情绪检测
  document.getElementById('customInput').addEventListener('input', (e) => {
    const value = e.target.value
    const match = detectEmotion(value)
    const hint = document.getElementById('emotionHint')
    if (match) {
      hint.classList.add('show')
      hint.querySelector('.emotion-dot').style.background = match.color
      hint.querySelector('.emotion-hint-text').style.color = match.color
      hint.querySelector('.emotion-hint-text').textContent = `${EMOTION_LABELS[match.emotion] || ''} · 检测到情绪`
    } else {
      hint.classList.remove('show')
    }
  })

  // 连击释放
  document.getElementById('comboFireBtn').addEventListener('click', () => {
    if (comboTimer) { clearTimeout(comboTimer); comboTimer = null }
    comboRelease()
  })

  // 重置
  document.getElementById('resetBtn').addEventListener('click', async () => {
    const ok = await showModal('重置', '清空所有攻击记录，重新开始？')
    if (ok) {
      game.reset()
      resetState()
      vibrate('medium')
    }
  })

  // 新手引导
  document.getElementById('onboardingPhoto').addEventListener('click', () => {
    document.getElementById('photoInput').click()
  })
  document.getElementById('onboardingSkip').addEventListener('click', () => {
    hideOnboarding()
  })

  // 语音输入
  document.getElementById('voiceBtn').addEventListener('click', toggleVoice)
  document.getElementById('voiceStopBtn').addEventListener('click', stopVoice)
  document.getElementById('voiceCancelBtn').addEventListener('click', cancelVoice)

  // 输入模式切换
  document.getElementById('inputModeToggle').addEventListener('click', () => {
    inputMode = inputMode === 'text' ? 'voice' : 'text'
    updateInputModeUI()
  })
}

// ===== 连击系统 =====
function accumulateHit(text) {
  comboWords.push(text)
  comboCount = comboWords.reduce((sum, w) => sum + w.length, 0)
  comboActive = true
  updateComboUI()
  vibrate('light')
  resetComboTimer()
  startComboTimer()
}

function resetComboTimer() {
  if (comboTimer) clearTimeout(comboTimer)
  comboTimer = setTimeout(() => {
    comboTimer = null
    if (comboWords.length > 0) {
      comboRelease()
    } else {
      comboActive = false
      comboCount = 0
      updateComboUI()
    }
  }, 1500)
}

function startComboTimer() {
  if (comboCountdownTimer) cancelAnimationFrame(comboCountdownTimer)
  const startTime = Date.now()
  const duration = 1500
  const fill = document.querySelector('.combo-timer-fill')

  const tick = () => {
    const elapsed = Date.now() - startTime
    const remaining = Math.max(0, 1 - elapsed / duration)
    if (fill) fill.style.transform = `scaleX(${remaining})`
    if (remaining > 0) {
      comboCountdownTimer = requestAnimationFrame(tick)
    }
  }
  comboCountdownTimer = requestAnimationFrame(tick)
}

function comboRelease() {
  if (comboWords.length === 0 || game.isAttacking()) return
  if (comboCountdownTimer) { cancelAnimationFrame(comboCountdownTimer); comboCountdownTimer = null }

  game.fireAttack(comboWords, comboCount)
  clearCombo()
}

function clearCombo() {
  comboWords = []
  comboCount = 0
  comboActive = false
  if (comboTimer) { clearTimeout(comboTimer); comboTimer = null }
  updateComboUI()
}

function updateComboUI() {
  const comboRow = document.getElementById('comboRow')
  const comboText = document.querySelector('.combo-fire-text')
  if (comboActive && comboCount > 0) {
    comboRow.classList.add('show')
    comboText.innerHTML = `<span class="combo-label">释放</span> ${comboCount} HIT!`
    // 更新连击按钮颜色
    const btn = document.getElementById('comboFireBtn')
    btn.className = `combo-fire-btn ${attackMode === 'dart' ? 'combo-dart-btn' : ''}`
    const textEl = btn.querySelector('.combo-fire-text')
    textEl.className = `combo-fire-text ${attackMode === 'dart' ? 'combo-dart-text' : ''}`
  } else {
    comboRow.classList.remove('show')
  }
}

// ===== 自定义输入 =====
function openCustomInput() {
  showCustomInput = true
  document.getElementById('customInputRow').classList.add('show')
  document.getElementById('customActions').classList.remove('show')
  document.getElementById('customInput').value = ''
  document.getElementById('customInput').focus()
}

function closeCustomInput() {
  showCustomInput = false
  document.getElementById('customInputRow').classList.remove('show')
  document.getElementById('customActions').classList.add('show')
  document.getElementById('emotionHint').classList.remove('show')
}

function confirmInput() {
  const input = document.getElementById('customInput')
  const text = input.value.trim()
  if (text) {
    accumulateHit(text)
  }
  closeCustomInput()
}

// ===== 模式切换 UI =====
function updateModeUI() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('mode-active', btn.dataset.mode === attackMode)
  })
  document.getElementById('inputModeToggle').textContent = inputMode === 'voice' ? '⌨' : '🎤'
}

function updateInputModeUI() {
  const toggle = document.getElementById('inputModeToggle')
  toggle.textContent = inputMode === 'voice' ? '⌨' : '🎤'
  if (inputMode === 'voice') {
    document.getElementById('customActions').classList.remove('show')
    document.getElementById('voiceActions').classList.add('show')
  } else {
    document.getElementById('customActions').classList.add('show')
    document.getElementById('voiceActions').classList.remove('show')
  }
}

// ===== 语音输入 =====
function checkVoiceSupport() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (SpeechRecognition) {
    voiceSupported = true
    document.getElementById('inputModeToggle').classList.add('show')
  }
}

function toggleVoice() {
  if (game.isAttacking()) return
  if (isRecording) {
    stopVoice()
  } else {
    startVoice()
  }
}

async function startVoice() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    showToast('需要麦克风权限')
    return
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    showToast('浏览器不支持语音识别')
    return
  }

  isRecording = true
  document.getElementById('voiceRow').classList.add('show')
  document.getElementById('voiceActions').classList.remove('show')
  vibrate('medium')

  mediaRecorder = new SpeechRecognition()
  mediaRecorder.lang = 'zh-CN'
  mediaRecorder.interimResults = false
  mediaRecorder.onresult = (e) => {
    const text = e.results[0][0].transcript
    if (text) {
      accumulateHit(text)
      vibrate('heavy')
    }
  }
  mediaRecorder.onerror = (e) => {
    console.error('语音识别失败:', e)
    showToast('识别失败')
    stopVoice()
  }
  mediaRecorder.onend = () => {
    if (isRecording) stopVoice()
  }
  mediaRecorder.start()
}

function stopVoice() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop()
  }
  isRecording = false
  document.getElementById('voiceRow').classList.remove('show')
  document.getElementById('voiceActions').classList.add('show')
}

function cancelVoice() {
  if (mediaRecorder) {
    mediaRecorder.abort()
  }
  isRecording = false
  document.getElementById('voiceRow').classList.remove('show')
  document.getElementById('voiceActions').classList.add('show')
}
