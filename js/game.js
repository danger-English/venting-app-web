import { getState, addHit, setPhoto } from './state.js'
import { analyzeWord, getEmotionColor } from './emotions.js'
import { easeOutQuad, vibrate } from './utils.js'

export class Game {
  constructor(canvasEl) {
    this.canvas = canvasEl
    this.ctx = canvasEl.getContext('2d')
    this.dpr = window.devicePixelRatio || 2

    // 攻击模式
    this.attackMode = 'gun' // 'gun' | 'dart'
    this._attacking = false

    // Canvas 尺寸
    this._canvasW = 0
    this._canvasH = 0

    // 木偶/靶子状态
    this.puppetState = {
      hitCount: 0,
      cracks: [],
      tiltAngle: 0,
      scale: 1,
      faceBounds: { cx: 0, cy: 0, rx: 50, ry: 60 }
    }

    // 飞镖模式状态
    this.dartState = {
      stuckDarts: [],
      ringPulses: [],
      slotIndex: 0
    }

    // 照片
    this._faceImg = null
    this._faceImgLoaded = false

    // 全局视觉效果
    this._effects = {
      flashAlpha: 0,
      shakeX: 0,
      shakeY: 0,
      shakeDecay: 0,
      shakeType: 'jitter',
      shockwaves: [],
      debris: [],
      emotionFlashColor: null
    }

    // 特效
    this._specialEffects = []
    this._damageNumbers = []
    this._burstText = null
    this._bgParticles = []

    // 动画
    this._animFrameId = null
    this._bgParticleTimer = null

    // 飞镖盘缓存
    this._dartboard = null

    this._initCanvas()
    this._loadState()
  }

  _raf(cb) { return requestAnimationFrame(cb) }
  _caf(id) { cancelAnimationFrame(id) }

  _initCanvas() {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = window.devicePixelRatio || 2
    this.canvas.width = rect.width * this.dpr
    this.canvas.height = rect.height * this.dpr
    this.ctx.scale(this.dpr, this.dpr)
    this._canvasW = rect.width
    this._canvasH = rect.height

    const cx = rect.width / 2
    const cy = rect.height * 0.35
    const scale = Math.min(rect.width / 400, rect.height / 500)
    this.puppetState.scale = scale
    this.puppetState.faceBounds = { cx, cy, rx: 45 * scale, ry: 55 * scale }

    this._initBgParticles(rect.width, rect.height)
    this._drawStatic()
  }

  resize() {
    this._stopBgParticles()
    if (this._animFrameId) { this._caf(this._animFrameId); this._animFrameId = null }
    this._initCanvas()
    if (this._faceImgLoaded && this._faceImg) {
      this._drawStatic()
    }
    setTimeout(() => this._animateBgParticles(), 500)
  }

  _loadState() {
    const state = getState()
    this.puppetState.hitCount = state.hitCount || 0
    this.puppetState.cracks = state.cracks || []
    if (state.photoData) {
      this._loadFaceImage(state.photoData)
    }
  }

  // ===== 照片加载 =====
  loadFaceFromDataURL(dataUrl) {
    setPhoto(dataUrl)
    this.puppetState.tiltAngle = 0
    this.puppetState.cracks = []
    this.puppetState.hitCount = 0
    this.dartState.stuckDarts = []
    this.dartState.ringPulses = []
    this.dartState.slotIndex = 0
    this._loadFaceImage(dataUrl)
  }

  _loadFaceImage(src) {
    this._faceImgLoaded = false
    this._faceImg = null
    const img = new Image()
    img.onload = () => {
      this._faceImg = img
      this._faceImgLoaded = true
      this._drawStatic()
    }
    img.onerror = () => {
      this._faceImg = null
      this._faceImgLoaded = false
      this._drawStatic()
    }
    img.src = src
  }

  // ===== 背景粒子 =====
  _initBgParticles(w, h) {
    this._bgParticles = []
    for (let i = 0; i < 18; i++) {
      this._bgParticles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.15 - Math.random() * 0.25,
        size: 1 + Math.random() * 1.5,
        alpha: 0.05 + Math.random() * 0.12,
        color: Math.random() > 0.5 ? 'rgba(255,42,42,' : 'rgba(240,236,228,'
      })
    }
  }

  _drawBgParticles() {
    const ctx = this.ctx
    const w = this._canvasW
    const h = this._canvasH
    if (!ctx || this._bgParticles.length === 0) return

    this._bgParticles.forEach(p => {
      p.x += p.vx
      p.y += p.vy
      if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w }
      if (p.x < -10) p.x = w + 10
      if (p.x > w + 10) p.x = -10
      ctx.fillStyle = p.color + p.alpha + ')'
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  _animateBgParticles() {
    if (!this.canvas) return
    this._drawStatic()
    this._bgParticleTimer = this._raf(() => this._animateBgParticles())
  }

  _stopBgParticles() {
    if (this._bgParticleTimer) {
      this._caf(this._bgParticleTimer)
      this._bgParticleTimer = null
    }
  }

  startBgParticles() {
    setTimeout(() => {
      if (!this._attacking && this.canvas) this._animateBgParticles()
    }, 300)
  }

  // ===== 静态绘制 =====
  _drawStatic() {
    const { ctx, _canvasW: w, _canvasH: h } = this
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)
    this._drawCanvasBg()
    this._drawTarget()
    this._drawSpecialEffects()
    this._drawComboUI()
  }

  _drawCanvasBg() {
    const { ctx, _canvasW: w, _canvasH: h } = this
    const g = ctx.createLinearGradient(0, h * 0.6, 0, h)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(80,10,10,0.06)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    const vg = ctx.createRadialGradient(w / 2, h * 0.35, w * 0.15, w / 2, h * 0.45, w * 0.8)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(0.6, 'rgba(0,0,0,0.15)')
    vg.addColorStop(1, 'rgba(0,0,0,0.4)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, w, h)

    this._drawBgParticles()
  }

  // ===== 目标绘制 =====
  _drawTarget() {
    if (this.attackMode === 'dart') {
      this._drawDartboard()
      this._drawStuckDarts()
      this._drawRingPulses()
    } else {
      this._drawGunPuppet()
    }
  }

  _drawGunPuppet() {
    const { ctx } = this
    if (!ctx) return
    const { cx: fx, cy: fy, rx, ry } = this.puppetState.faceBounds
    const s = this.puppetState.scale || 1
    const tilt = this.puppetState.tiltAngle || 0

    ctx.save()
    if (tilt) {
      ctx.translate(fx, fy)
      ctx.rotate(tilt * Math.PI / 180)
      ctx.translate(-fx, -fy)
    }

    // 身体骨架（按比例缩放）
    const neckH = 30 * s
    const shoulderW = 40 * s
    const bodyH = 120 * s
    const hipW = 35 * s
    const armEndX = 70 * s
    const armEndY = 90 * s
    const legEndX = 30 * s
    const legEndY = 180 * s

    ctx.strokeStyle = 'rgba(240,236,228,0.35)'
    ctx.lineWidth = 2 * s
    ctx.beginPath()
    // 脖子
    ctx.moveTo(fx, fy + ry)
    ctx.lineTo(fx, fy + ry + neckH)
    // 肩膀
    ctx.moveTo(fx - shoulderW, fy + ry + neckH)
    ctx.lineTo(fx + shoulderW, fy + ry + neckH)
    // 躯干
    ctx.lineTo(fx + hipW, fy + ry + bodyH)
    ctx.lineTo(fx - hipW, fy + ry + bodyH)
    ctx.closePath()
    ctx.stroke()
    // 左臂
    ctx.moveTo(fx - shoulderW, fy + ry + neckH + 10 * s)
    ctx.lineTo(fx - armEndX, fy + ry + armEndY)
    // 右臂
    ctx.moveTo(fx + shoulderW, fy + ry + neckH + 10 * s)
    ctx.lineTo(fx + armEndX, fy + ry + armEndY)
    ctx.stroke()
    // 左腿
    ctx.moveTo(fx - 20 * s, fy + ry + bodyH)
    ctx.lineTo(fx - legEndX, fy + ry + legEndY)
    // 右腿
    ctx.moveTo(fx + 20 * s, fy + ry + bodyH)
    ctx.lineTo(fx + legEndX, fy + ry + legEndY)
    ctx.stroke()

    // 脸部
    if (this._faceImgLoaded && this._faceImg) {
      this._drawFaceWithPhoto(fx, fy, rx, ry)
    } else {
      this._drawDefaultFace(fx, fy, rx, ry)
    }

    ctx.restore()

    if (this.puppetState.hitCount > 0) {
      ctx.save()
      ctx.font = `600 ${Math.round(16 * s)}px sans-serif`
      ctx.fillStyle = 'rgba(240,236,228,0.25)'
      ctx.textAlign = 'center'
      ctx.fillText(`${this.puppetState.hitCount} HIT`, fx, fy + ry + 210 * s)
      ctx.restore()
    }
  }

  _drawDartboard() {
    const { ctx, _canvasW: w, _canvasH: h } = this
    if (!ctx) return
    const cx = w / 2
    const cy = h * 0.35
    const R = Math.min(w, h) * 0.30
    const tilt = this.puppetState.tiltAngle || 0

    this._dartboard = { cx, cy, radius: R }

    ctx.save()
    ctx.shadowColor = 'rgba(255, 179, 0, 0.15)'
    ctx.shadowBlur = 30
    ctx.strokeStyle = 'rgba(255, 179, 0, 0.08)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, R + 6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()

    ctx.save()
    if (tilt) {
      ctx.translate(cx, cy)
      ctx.rotate(tilt * Math.PI / 180)
      ctx.translate(-cx, -cy)
    }

    const segments = 20
    const segAngle = (Math.PI * 2) / segments
    const outerR = R
    const tripleOuterR = R * 0.88
    const tripleInnerR = R * 0.80
    const doubleInnerR = R * 0.60

    this._drawRingSegments(cx, cy, doubleInnerR, tripleInnerR, segments, ['#1a1a1a', '#e8e0d0'])
    this._drawRingSegments(cx, cy, tripleInnerR, tripleOuterR, segments, ['#cc0000', '#1a8c1a'])
    this._drawRingSegments(cx, cy, tripleOuterR, outerR, segments, ['#1a1a1a', '#e8e0d0'])

    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1
    ;[doubleInnerR, tripleInnerR, tripleOuterR, outerR].forEach(r => {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    })

    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1
    for (let i = 0; i < segments; i++) {
      const a = segAngle * i - Math.PI / 2
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * doubleInnerR, cy + Math.sin(a) * doubleInnerR)
      ctx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR)
      ctx.stroke()
    }

    const bullR = R * 0.40
    ctx.fillStyle = '#1a8c1a'
    ctx.beginPath()
    ctx.arc(cx, cy, bullR, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.stroke()

    const eyeR = R * 0.05
    ctx.fillStyle = '#cc0000'
    ctx.beginPath()
    ctx.arc(cx, cy, eyeR, 0, Math.PI * 2)
    ctx.fill()

    if (this._faceImgLoaded && this._faceImg) {
      const img = this._faceImg
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, bullR * 0.92, 0, Math.PI * 2)
      ctx.clip()
      const scale = Math.max((bullR * 1.84) / img.width, (bullR * 1.84) / img.height)
      const dw = img.width * scale
      const dh = img.height * scale
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
      ctx.restore()
      ctx.strokeStyle = 'rgba(255, 179, 0, 0.3)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy, bullR * 0.92, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      this._drawDefaultFace(cx, cy, bullR * 0.92, bullR * 0.92)
    }

    ctx.restore()

    if (this.puppetState.hitCount > 0) {
      ctx.save()
      ctx.font = '600 16px sans-serif'
      ctx.fillStyle = 'rgba(255, 179, 0, 0.35)'
      ctx.textAlign = 'center'
      ctx.fillText(`${this.puppetState.hitCount} HIT`, cx, cy + R + 30)
      ctx.restore()
    }
  }

  _drawRingSegments(cx, cy, innerR, outerR, segments, colors) {
    const ctx = this.ctx
    const segAngle = (Math.PI * 2) / segments
    for (let i = 0; i < segments; i++) {
      const startAngle = segAngle * i - Math.PI / 2
      const endAngle = startAngle + segAngle
      ctx.fillStyle = colors[i % 2]
      ctx.beginPath()
      ctx.arc(cx, cy, outerR, startAngle, endAngle)
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true)
      ctx.closePath()
      ctx.fill()
    }
  }

  _drawStuckDarts() {
    const { ctx } = this
    if (!ctx) return
    this.dartState.stuckDarts.forEach(d => this._drawDartShape(d.x, d.y, d.angle, d.char, d.color))
  }

  _drawDartShape(x, y, angle, char, color) {
    const ctx = this.ctx
    const s = 22
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(s * 2.2, 0)
    ctx.lineTo(s * 0.5, -s * 0.35)
    ctx.lineTo(s * 0.2, 0)
    ctx.lineTo(s * 0.5, s * 0.35)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    ctx.moveTo(s * 2.2, 0)
    ctx.lineTo(s * 0.5, -s * 0.35)
    ctx.lineTo(s * 0.8, 0)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.moveTo(s * 0.2, 0)
    ctx.lineTo(-s * 1.8, 0)
    ctx.stroke()

    ctx.strokeStyle = '#999'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-s * 0.6, 0)
    ctx.lineTo(-s * 1.4, 0)
    ctx.stroke()

    ctx.fillStyle = color
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.moveTo(-s * 1.8, 0)
    ctx.lineTo(-s * 2.4, -s * 0.55)
    ctx.lineTo(-s * 1.5, 0)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-s * 1.8, 0)
    ctx.lineTo(-s * 2.4, s * 0.55)
    ctx.lineTo(-s * 1.5, 0)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  _drawRingPulses() {
    const { ctx } = this
    if (!ctx) return
    const pulses = this.dartState.ringPulses
    if (pulses.length === 0) return
    ctx.save()
    pulses.forEach(p => {
      ctx.strokeStyle = p.color
      ctx.globalAlpha = p.alpha
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      ctx.stroke()
    })
    ctx.restore()
  }

  // ===== 脸部绘制 =====
  _drawDefaultFace(cx, cy, rx, ry) {
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(180, 160, 140, 0.15)'
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(240, 236, 228, 0.2)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    const scale = Math.min(rx / 45, ry / 55)
    ctx.fillStyle = 'rgba(240, 236, 228, 0.35)'
    ctx.beginPath()
    ctx.ellipse(cx - 18 * scale, cy - 8 * scale, 5 * scale, 7 * scale, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx + 18 * scale, cy - 8 * scale, 5 * scale, 7 * scale, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = 'rgba(240, 236, 228, 0.3)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy + 10 * scale, 18 * scale, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
  }

  _drawFaceWithPhoto(cx, cy, rx, ry) {
    const ctx = this.ctx
    const img = this._faceImg
    if (!img || !this._faceImgLoaded) return

    ctx.save()
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.clip()
    const scale = Math.max((rx * 2) / img.width, (ry * 2) / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
    ctx.restore()

    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  // ===== 连击 UI =====
  drawComboUI(comboCount, comboWords) {
    const { ctx, _canvasW: w } = this
    if (!ctx || comboCount === 0) return

    const s = this.puppetState.scale || 1
    ctx.save()
    const counterSize = Math.min(64 * s, (36 + comboCount * 2) * s)
    const pulse = 0.85 + Math.sin(Date.now() / 180) * 0.15

    if (this.attackMode === 'dart') {
      const board = this._dartboard
      const hitX = board ? board.cx : w / 2
      const hitY = board ? board.cy - board.radius - 30 : 60

      ctx.shadowColor = '#ffcc00'
      ctx.shadowBlur = 35 * pulse
      ctx.font = `900 ${counterSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillStyle = `rgba(255, 200, 0, ${0.3 * pulse})`
      ctx.fillText(`${comboCount} HIT!`, hitX, hitY)
      ctx.shadowBlur = 18 * pulse
      ctx.fillStyle = `rgba(255, 220, 50, ${0.95 * pulse})`
      ctx.fillText(`${comboCount} HIT!`, hitX, hitY)
    } else {
      ctx.font = `900 ${counterSize}px sans-serif`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'

      ctx.shadowColor = '#ff3333'
      ctx.shadowBlur = 40 * pulse
      ctx.fillStyle = `rgba(255, 50, 50, ${0.25 * pulse})`
      ctx.fillText(`${comboCount} HIT!`, w - 24, 50)
      ctx.shadowBlur = 20 * pulse
      ctx.fillStyle = `rgba(255, 60, 60, ${0.95 * pulse})`
      ctx.fillText(`${comboCount} HIT!`, w - 24, 50)

      if (comboWords && comboWords.length > 0) {
        const { cx: fx, cy: fy, ry } = this.puppetState.faceBounds
        const startY = fy + ry + 230 * s
        ctx.font = `600 ${Math.round(20 * s)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.shadowColor = '#ff6600'
        ctx.shadowBlur = 8
        ctx.fillStyle = 'rgba(255, 150, 50, 0.7)'
        const display = comboWords.slice(-3)
        display.forEach((word, i) => {
          ctx.globalAlpha = 0.4 + (i / display.length) * 0.5
          ctx.fillText(word, fx, startY + i * 28 * s)
        })
      }
    }
    ctx.restore()
  }

  _drawComboUI() {
    // 由外部调用 drawComboUI
  }

  // ===== 模式切换 =====
  switchMode(mode) {
    if (this._attacking || mode === this.attackMode) return
    this.attackMode = mode
    this.puppetState.tiltAngle = 0
    this.puppetState.cracks = []
    this.dartState.stuckDarts = []
    this.dartState.ringPulses = []
    this.dartState.slotIndex = 0
    this._drawStatic()
  }

  // ===== 视觉效果 =====
  _triggerHitEffect(hitX, hitY, char, color) {
    const ef = this._effects
    const isDart = this.attackMode === 'dart'

    if (isDart) {
      ef.flashAlpha = Math.min(ef.flashAlpha + 0.35, 0.75)
      ef.shakeType = 'thud'
      ef.shakeX = 0
      ef.shakeY = 10 + Math.random() * 5
      ef.shakeDecay = 1
    } else {
      ef.flashAlpha = Math.min(ef.flashAlpha + 0.30, 0.65)
      ef.shakeType = 'jitter'
      const intensity = 8 + Math.random() * 6
      const shakeAngle = Math.random() * Math.PI * 2
      ef.shakeX = Math.cos(shakeAngle) * intensity
      ef.shakeY = Math.sin(shakeAngle) * intensity
      ef.shakeDecay = 1
    }

    if (this.attackMode === 'gun') {
      ef.shockwaves.push({
        x: hitX, y: hitY,
        radius: 5,
        maxRadius: 80 + Math.random() * 40,
        alpha: 0.9,
        color
      })

      const pCount = 7 + Math.floor(Math.random() * 5)
      for (let i = 0; i < pCount; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 2 + Math.random() * 5
        ef.debris.push({
          x: hitX, y: hitY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          size: 2 + Math.random() * 4,
          color, alpha: 1,
          life: 0.4 + Math.random() * 0.3
        })
      }
      const fragCount = 2 + Math.floor(Math.random() * 2)
      for (let i = 0; i < fragCount; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 1.5 + Math.random() * 3
        ef.debris.push({
          x: hitX + (Math.random() - 0.5) * 10,
          y: hitY + (Math.random() - 0.5) * 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3,
          size: 8 + Math.random() * 6,
          color, alpha: 1,
          life: 0.3 + Math.random() * 0.2,
          char: i === 0 ? char : '·'
        })
      }
    } else {
      this.dartState.ringPulses.push(
        { x: hitX, y: hitY, radius: 3, maxRadius: 70, alpha: 0.8, color },
        { x: hitX, y: hitY, radius: 1, maxRadius: 40, alpha: 0.95, color },
        { x: hitX, y: hitY, radius: 0, maxRadius: 20, alpha: 1, color: '#fff' }
      )

      const sparkCount = 5 + Math.floor(Math.random() * 3)
      for (let i = 0; i < sparkCount; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 2 + Math.random() * 4
        ef.debris.push({
          x: hitX, y: hitY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          size: 1.5 + Math.random() * 3,
          color: i % 2 === 0 ? color : '#fff',
          alpha: 1,
          life: 0.3 + Math.random() * 0.3
        })
      }
    }
  }

  _updateEffects(dt) {
    const ef = this._effects

    if (ef.flashAlpha > 0) {
      const decayRate = this.attackMode === 'dart' ? 6 : 4
      ef.flashAlpha = Math.max(0, ef.flashAlpha - dt * decayRate)
    }

    ef.shockwaves = ef.shockwaves.filter(sw => {
      sw.radius += dt * 200
      sw.alpha = Math.max(0, 1 - sw.radius / sw.maxRadius) * 0.7
      return sw.radius < sw.maxRadius
    })

    ef.debris = ef.debris.filter(p => {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.15
      p.life -= dt
      p.alpha = Math.max(0, p.life * 2)
      return p.life > 0
    })

    if (ef.shakeDecay > 0) {
      if (ef.shakeType === 'thud') {
        ef.shakeDecay = Math.max(0, ef.shakeDecay - dt * 5)
        const t = 1 - ef.shakeDecay
        if (t < 0.3) {
          ef.shakeY = ef.shakeY * (1 - t / 0.3) * 0.8
        } else {
          const rebound = Math.sin((t - 0.3) / 0.7 * Math.PI * 2.5) * ef.shakeDecay * 4
          ef.shakeY = -rebound
        }
        ef.shakeX *= 0.85
      } else {
        ef.shakeDecay = Math.max(0, ef.shakeDecay - dt * 6)
        const jitter = (Math.random() - 0.5) * 2
        ef.shakeX = (ef.shakeX * 0.7 + jitter * ef.shakeDecay * 6)
        ef.shakeY = (ef.shakeY * 0.7 + (Math.random() - 0.5) * 2 * ef.shakeDecay * 6)
      }
    }

    this.dartState.ringPulses = this.dartState.ringPulses.filter(p => {
      p.radius += dt * 80
      p.alpha = Math.max(0, 1 - p.radius / p.maxRadius) * 0.6
      return p.radius < p.maxRadius
    })
  }

  _drawVignette() {
    const { ctx, _canvasW: w, _canvasH: h } = this
    if (!ctx) return
    const alpha = this._effects.flashAlpha
    if (alpha < 0.02) return

    ctx.save()
    if (this.attackMode === 'dart') {
      const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.55)
      gradient.addColorStop(0, `rgba(255,230,100,${alpha * 0.45})`)
      gradient.addColorStop(0.25, `rgba(255,180,30,${alpha * 0.3})`)
      gradient.addColorStop(0.6, `rgba(200,120,0,${alpha * 0.12})`)
      gradient.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, w, h)
    } else {
      const ec = this._effects.emotionFlashColor
      let r = 100, g = 0, b = 0
      if (ec) {
        r = parseInt(ec.slice(1, 3), 16) || 100
        g = parseInt(ec.slice(3, 5), 16) || 0
        b = parseInt(ec.slice(5, 7), 16) || 0
      }
      const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.7)
      gradient.addColorStop(0, 'rgba(0,0,0,0)')
      gradient.addColorStop(0.5, `rgba(${r},${g},${b},${alpha * 0.4})`)
      gradient.addColorStop(1, `rgba(${r},${g},${b},${alpha * 0.7})`)
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, w, h)
    }
    ctx.restore()
  }

  _drawEffects() {
    const { ctx } = this
    if (!ctx) return
    const ef = this._effects
    if (ef.shockwaves.length > 0) {
      ctx.save()
      ef.shockwaves.forEach(sw => {
        ctx.strokeStyle = sw.color
        ctx.globalAlpha = sw.alpha
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2)
        ctx.stroke()
        if (sw.radius > 10) {
          ctx.globalAlpha = sw.alpha * 0.5
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(sw.x, sw.y, sw.radius * 0.6, 0, Math.PI * 2)
          ctx.stroke()
        }
      })
      ctx.restore()
    }
  }

  _drawDebris() {
    const { ctx } = this
    if (!ctx) return
    const debris = this._effects.debris
    if (debris.length === 0) return
    ctx.save()
    debris.forEach(p => {
      ctx.globalAlpha = p.alpha
      if (p.char) {
        ctx.font = `bold ${p.size}px sans-serif`
        ctx.fillStyle = p.color
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowColor = p.color
        ctx.shadowBlur = 6
        ctx.fillText(p.char, p.x, p.y)
      } else {
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = 4
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
    })
    ctx.restore()
  }

  // ===== 情绪特效 =====
  _spawnSpecialEffect(type, x, y, intensity, emotionColor) {
    switch (type) {
      case 'crack': this._spawnCrackEffect(x, y, intensity, emotionColor); break
      case 'fog': this._spawnFogEffect(x, y, intensity, emotionColor); break
      case 'fly': this._spawnFlyEffect(x, y, intensity, emotionColor); break
      case 'flood': this._spawnFloodEffect(x, y, intensity, emotionColor); break
      case 'distort': this._spawnDistortEffect(x, y, intensity, emotionColor); break
      case 'cry': this._spawnCryEffect(x, y, intensity, emotionColor); break
    }
  }

  _spawnCrackEffect(x, y, intensity, emotionColor) {
    const branches = 4 + Math.floor(intensity * 4)
    const lines = []
    for (let i = 0; i < branches; i++) {
      const angle = (Math.PI * 2 / branches) * i + (Math.random() - 0.5) * 0.6
      const segs = []
      let cx = x, cy = y
      const segCount = 3 + Math.floor(Math.random() * 3)
      for (let s = 0; s < segCount; s++) {
        const len = 15 + Math.random() * 25 * intensity
        const a = angle + (Math.random() - 0.5) * 0.5
        const nx = cx + Math.cos(a) * len
        const ny = cy + Math.sin(a) * len
        segs.push({ x1: cx, y1: cy, x2: nx, y2: ny })
        cx = nx; cy = ny
      }
      lines.push(segs)
    }
    this._specialEffects.push({
      type: 'crack', x, y, lines, emotionColor: emotionColor || '#cc2222',
      alpha: 0.9, progress: 0, born: Date.now(), intensity
    })
  }

  _drawCrackEffect(ef) {
    const ctx = this.ctx
    const color = ef.emotionColor || '#cc2222'
    const r = parseInt(color.slice(1, 3), 16) || 200
    const g = parseInt(color.slice(3, 5), 16) || 40
    const b = parseInt(color.slice(5, 7), 16) || 40
    ctx.save()
    ef.lines.forEach(segs => {
      const visible = Math.floor(ef.progress * segs.length)
      for (let i = 0; i <= visible && i < segs.length; i++) {
        const s = segs[i]
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${ef.alpha})`
        ctx.lineWidth = 2 + ef.intensity
        ctx.beginPath()
        ctx.moveTo(s.x1, s.y1)
        ctx.lineTo(
          s.x1 + (s.x2 - s.x1) * Math.min(1, ef.progress * segs.length - i),
          s.y1 + (s.y2 - s.y1) * Math.min(1, ef.progress * segs.length - i)
        )
        ctx.stroke()
      }
    })
    const glow = ctx.createRadialGradient(ef.x, ef.y, 0, ef.x, ef.y, 30 * ef.intensity)
    glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${ef.alpha * 0.4})`)
    glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
    ctx.fillStyle = glow
    ctx.fillRect(ef.x - 40, ef.y - 40, 80, 80)
    ctx.restore()
  }

  _spawnFogEffect(x, y, intensity, emotionColor) {
    const particles = []
    const count = 12 + Math.floor(intensity * 10)
    for (let i = 0; i < count; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 60,
        y: y + Math.random() * 30,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -1 - Math.random() * 2,
        size: 20 + Math.random() * 30 * intensity,
        alpha: 0.3 + Math.random() * 0.4,
        growth: 0.8 + Math.random() * 0.5
      })
    }
    this._specialEffects.push({
      type: 'fog', x, y, particles, emotionColor: emotionColor || '#8800cc',
      born: Date.now(), intensity
    })
  }

  _drawFogEffect(ef) {
    const ctx = this.ctx
    const color = ef.emotionColor || '#8800cc'
    const r = parseInt(color.slice(1, 3), 16) || 136
    const g = parseInt(color.slice(3, 5), 16) || 0
    const b = parseInt(color.slice(5, 7), 16) || 204
    ctx.save()
    ef.particles.forEach(p => {
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size)
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.alpha})`)
      grad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.5})`)
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2)
    })
    ctx.restore()
  }

  _spawnFlyEffect(x, y, intensity, emotionColor) {
    const angle = Math.random() * Math.PI * 2
    const speed = 15 + intensity * 20
    this._specialEffects.push({
      type: 'fly', x, y, emotionColor: emotionColor || '#00ccff',
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 5,
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 20,
      alpha: 1,
      born: Date.now(), intensity,
      originX: x, originY: y,
      returning: false,
      returnStart: 0
    })
  }

  _spawnFloodEffect(x, y, intensity, emotionColor) {
    const chars = []
    const count = 15 + Math.floor(intensity * 15)
    const words = ['烦', '躁', '闷', '啊', '!', '#', '烦', '烦']
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist = 20 + Math.random() * 80 * intensity
      chars.push({
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        char: words[Math.floor(Math.random() * words.length)],
        size: 12 + Math.random() * 14,
        alpha: 0.5 + Math.random() * 0.5,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -0.3 - Math.random() * 0.5,
        rotation: (Math.random() - 0.5) * 0.5
      })
    }
    this._specialEffects.push({
      type: 'flood', x, y, chars, emotionColor: emotionColor || '#aa44ff',
      born: Date.now(), intensity
    })
  }

  _drawFloodEffect(ef) {
    const ctx = this.ctx
    const color = ef.emotionColor || '#aa44ff'
    ctx.save()
    ef.chars.forEach(c => {
      ctx.globalAlpha = c.alpha
      ctx.font = `bold ${c.size}px sans-serif`
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = color
      ctx.shadowBlur = 4
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.rotate(c.rotation)
      ctx.fillText(c.char, 0, 0)
      ctx.restore()
    })
    ctx.restore()
  }

  _spawnDistortEffect(x, y, intensity, emotionColor) {
    this._specialEffects.push({
      type: 'distort', x, y, emotionColor: emotionColor || '#cc66ff',
      waveAmplitude: 5 + intensity * 10,
      waveFreq: 0.15,
      phase: 0,
      alpha: 0.7,
      born: Date.now(), intensity
    })
  }

  _drawDistortEffect(ef) {
    const ctx = this.ctx
    const color = ef.emotionColor || '#cc66ff'
    ctx.save()
    ctx.globalAlpha = ef.alpha
    ctx.strokeStyle = color + '66'
    ctx.lineWidth = 1.5
    for (let i = 0; i < 6; i++) {
      const baseY = ef.y - 40 + i * 16
      ctx.beginPath()
      for (let px = ef.x - 60; px < ef.x + 60; px += 3) {
        const distFromCenter = Math.abs(px - ef.x) / 60
        const amp = ef.waveAmplitude * (1 - distFromCenter) * Math.sin(ef.phase + i)
        const py = baseY + Math.sin(px * ef.waveFreq + ef.phase * 3) * amp
        if (px === ef.x - 60) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
    ctx.restore()
  }

  _spawnCryEffect(x, y, intensity, emotionColor) {
    const drops = []
    const count = 10 + Math.floor(intensity * 8)
    for (let i = 0; i < count; i++) {
      drops.push({
        x: x + (Math.random() - 0.5) * 80,
        y: y - 20 + Math.random() * 20,
        vy: 1.5 + Math.random() * 2,
        size: 3 + Math.random() * 4,
        alpha: 0.5 + Math.random() * 0.4,
        delay: Math.random() * 500
      })
    }
    this._specialEffects.push({
      type: 'cry', x, y, drops, emotionColor: emotionColor || '#4488cc',
      born: Date.now(), intensity
    })
  }

  _drawCryEffect(ef) {
    const ctx = this.ctx
    const now = Date.now()
    const color = ef.emotionColor || '#4488cc'
    const r = parseInt(color.slice(1, 3), 16) || 68
    const g = parseInt(color.slice(3, 5), 16) || 136
    const b = parseInt(color.slice(5, 7), 16) || 204
    ctx.save()
    ef.drops.forEach(d => {
      if (now - ef.born < d.delay) return
      ctx.globalAlpha = d.alpha
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.ellipse(d.x, d.y, d.size * 0.6, d.size, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = `rgba(${Math.min(255, r + 80)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 50)}, ${d.alpha * 0.5})`
      ctx.beginPath()
      ctx.ellipse(d.x - d.size * 0.15, d.y - d.size * 0.3, d.size * 0.2, d.size * 0.3, 0, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.restore()
  }

  _updateSpecialEffects(dt) {
    const now = Date.now()
    this._specialEffects = this._specialEffects.filter(ef => {
      const age = (now - ef.born) / 1000
      switch (ef.type) {
        case 'crack':
          ef.progress = Math.min(1, age / 0.4)
          if (age > 0.4) ef.alpha = Math.max(0, 0.9 - (age - 0.4) / 1.5)
          return age < 1.9
        case 'fog':
          ef.particles.forEach(p => {
            p.x += p.vx; p.y += p.vy; p.size += p.growth
            if (age > 0.5) p.alpha *= 0.985
          })
          return age < 2.5
        case 'fly':
          if (!ef.returning) {
            ef.x += ef.vx; ef.y += ef.vy; ef.vy += 0.3
            ef.rotation += ef.rotSpeed
            ef.alpha = Math.max(0, 1 - age / 0.6)
            if (age > 0.6) { ef.returning = true; ef.returnStart = now }
          } else {
            const returnAge = (now - ef.returnStart) / 800
            const t = Math.min(1, returnAge)
            ef.x = ef.originX * t + ef.x * (1 - t)
            ef.y = ef.originY * t + ef.y * (1 - t)
            ef.rotation *= 0.9
            ef.alpha = t * 0.5
            if (t >= 1) return false
          }
          return true
        case 'flood':
          ef.chars.forEach(c => {
            c.x += c.vx; c.y += c.vy; c.rotation += 0.02
            if (age > 0.8) c.alpha *= 0.98
          })
          return age < 2.5
        case 'distort':
          ef.phase += dt * 5
          if (age > 0.5) ef.alpha = Math.max(0, 0.7 - (age - 0.5) / 1.5)
          return age < 2.0
        case 'cry':
          ef.drops.forEach(d => {
            if (now - ef.born < d.delay) return
            d.y += d.vy
            if (age > 1.0) d.alpha *= 0.98
          })
          return age < 2.5
        default: return false
      }
    })
  }

  _drawSpecialEffects() {
    this._specialEffects.forEach(ef => {
      switch (ef.type) {
        case 'crack': this._drawCrackEffect(ef); break
        case 'fog': this._drawFogEffect(ef); break
        case 'flood': this._drawFloodEffect(ef); break
        case 'distort': this._drawDistortEffect(ef); break
        case 'cry': this._drawCryEffect(ef); break
      }
    })
  }

  // ===== 伤害数字 =====
  _spawnDamageNumber(x, y, char, color) {
    const s = this.puppetState.scale || 1
    this._damageNumbers.push({
      x: x + (Math.random() - 0.5) * 20 * s,
      y: y - 10 * s,
      vy: -2.5 * s - Math.random() * 1.5 * s,
      text: char,
      color,
      alpha: 1,
      size: (32 + Math.random() * 16) * s,
      born: Date.now()
    })
  }

  _drawDamageNumbers() {
    const ctx = this.ctx
    if (!ctx || this._damageNumbers.length === 0) return
    ctx.save()
    this._damageNumbers.forEach(d => {
      ctx.globalAlpha = d.alpha
      ctx.font = `900 ${d.size}px sans-serif`
      ctx.fillStyle = d.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = d.color
      ctx.shadowBlur = 12
      ctx.fillText(d.text, d.x, d.y)
    })
    ctx.restore()
  }

  _animateDamageNumbers() {
    if (!this.canvas) return
    const now = Date.now()
    this._damageNumbers = this._damageNumbers.filter(d => {
      const age = (now - d.born) / 1000
      d.y += d.vy
      d.vy *= 0.97
      if (age > 0.5) d.alpha = Math.max(0, 1 - (age - 0.5) / 0.7)
      d.size *= 0.998
      return age < 1.2
    })
    this._drawStatic()
    this._drawDamageNumbers()
    if (this._damageNumbers.length > 0) {
      requestAnimationFrame(() => this._animateDamageNumbers())
    }
  }

  // ===== 爆发文字 =====
  _spawnBurstText(text, color) {
    this._burstText = { text, color, born: Date.now() }
  }

  _drawBurstText() {
    const ctx = this.ctx
    const burst = this._burstText
    if (!ctx || !burst) return
    const age = (Date.now() - burst.born) / 1000
    if (age > 0.8) { this._burstText = null; return }
    const { _canvasW: w, _canvasH: h } = this
    const s = this.puppetState.scale || 1
    const alpha = age < 0.15 ? age / 0.15 : Math.max(0, 1 - (age - 0.15) / 0.65)
    const scale = age < 0.1 ? 0.5 + (age / 0.1) * 0.8 : 1.3 - (age - 0.1) * 0.4
    const fontSize = Math.max(20 * s, 64 * scale * s)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.font = `900 ${fontSize}px sans-serif`
    ctx.fillStyle = burst.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = burst.color
    ctx.shadowBlur = 30 * alpha
    ctx.fillText(burst.text, w / 2, h * 0.45)
    ctx.restore()
  }

  // ===== 攻击系统 =====
  fireAttack(comboWords, comboCount) {
    if (comboWords.length === 0 || this._attacking) return

    this._attacking = true
    this._stopBgParticles()

    vibrate('heavy')
    if (comboCount > 8) {
      setTimeout(() => vibrate('heavy'), 100)
      setTimeout(() => vibrate('heavy'), 250)
    }

    if (comboCount >= 6) {
      const burstColor = this.attackMode === 'dart' ? '#ffcc00' : '#ff3333'
      this._spawnBurstText(comboCount >= 12 ? 'BOOM!' : 'FIRE!', burstColor)
    }

    this._firePerCharBullets(comboWords.join(''))
  }

  _firePerCharBullets(text) {
    const { ctx, _canvasW: w, _canvasH: h } = this
    if (!ctx) { this._attacking = false; return }

    const chars = text.split('')
    const mode = this.attackMode
    const colors = ['#ff3333', '#ff6600', '#ffcc00', '#ff0066', '#ff9900']

    // 全文情绪分析
    const fullAnalysis = analyzeWord(text)
    if (fullAnalysis.effectType) {
      const emotionColor = getEmotionColor(fullAnalysis.emotion)
      this._effects.emotionFlashColor = emotionColor
      const spawnX = mode === 'dart' ? (this._dartboard ? this._dartboard.cx : w / 2) : this.puppetState.faceBounds.cx
      const spawnY = mode === 'dart' ? (this._dartboard ? this._dartboard.cy : h * 0.35) : this.puppetState.faceBounds.cy
      this._spawnSpecialEffect(fullAnalysis.effectType, spawnX, spawnY, fullAnalysis.intensity, emotionColor)
      vibrate('heavy')
    } else {
      this._effects.emotionFlashColor = null
    }

    let targetCx, targetCy, targetR
    if (mode === 'dart') {
      const board = this._dartboard || { cx: w / 2, cy: h * 0.35, radius: Math.min(w, h) * 0.30 }
      targetCx = board.cx; targetCy = board.cy; targetR = board.radius
    } else {
      targetCx = this.puppetState.faceBounds.cx
      targetCy = this.puppetState.faceBounds.cy
      targetR = Math.max(this.puppetState.faceBounds.rx, this.puppetState.faceBounds.ry)
    }

    const delayPerBullet = chars.length > 15 ? 35 : chars.length > 8 ? 50 : 70
    const existingDartCount = mode === 'dart' ? this.dartState.slotIndex : 0

    const bullets = chars.map((ch, i) => {
      let startX, startY
      if (mode === 'dart') {
        const totalWidth = Math.min(chars.length * 30, w * 0.8)
        const spacing = totalWidth / Math.max(chars.length, 1)
        startX = (w - totalWidth) / 2 + spacing * (i + 0.5)
        startY = h + 20
      } else {
        const spreadAngle = (Math.PI * 0.6) / Math.max(chars.length - 1, 1)
        const startAngle = -Math.PI * 0.3
        const angle = startAngle + spreadAngle * i
        startX = w / 2 + Math.cos(angle) * (w * 0.4)
        startY = h + 30
      }

      let hitX, hitY
      if (mode === 'dart') {
        const dartIndex = existingDartCount + i
        const ringCapacities = [12, 10, 8, 6, 4]
        let ring = 0, offset = dartIndex
        for (let r = 0; r < ringCapacities.length; r++) {
          if (offset < ringCapacities[r]) { ring = r; break }
          offset -= ringCapacities[r]
          ring = r + 1
        }
        const cap = ringCapacities[Math.min(ring, ringCapacities.length - 1)]
        const ringRadius = targetR * (0.90 - ring * 0.17)
        const ringAngle = (Math.PI * 2 / cap) * offset - Math.PI / 2
        hitX = targetCx + Math.cos(ringAngle) * ringRadius
        hitY = targetCy + Math.sin(ringAngle) * ringRadius
      } else {
        hitX = targetCx + (Math.random() - 0.5) * this.puppetState.faceBounds.rx * 1.6
        hitY = targetCy + (Math.random() - 0.5) * this.puppetState.faceBounds.ry * 1.6
      }

      return {
        char: ch, startX, startY, hitX, hitY,
        size: (28 + Math.random() * 12) * (this.puppetState.scale || 1),
        color: colors[i % colors.length],
        fireDelay: i * delayPerBullet,
        duration: 160 + Math.random() * 100,
        hit: false, hitTriggered: false,
        fragments: null, explosionStart: 0
      }
    })

    const startTime = Date.now()
    const explosionDuration = 500
    let lastFrameTime = startTime
    let hitPausedUntil = 0

    const animate = () => {
      if (!this.ctx) return
      const now = Date.now()
      const isPaused = now < hitPausedUntil
      const dt = isPaused ? 0 : Math.min((now - lastFrameTime) / 1000, 0.05)
      if (!isPaused) lastFrameTime = now

      this._updateEffects(dt)
      this.ctx.clearRect(0, 0, w, h)
      this._drawVignette()

      const flyEf = this._specialEffects.find(e => e.type === 'fly' && !e.returning)
      const flyOffX = flyEf ? (flyEf.x - flyEf.originX) * 0.3 : 0
      const flyOffY = flyEf ? (flyEf.y - flyEf.originY) * 0.3 : 0
      this.ctx.save()
      this.ctx.translate(this._effects.shakeX + flyOffX, this._effects.shakeY + flyOffY)

      this._drawTarget()
      this._updateSpecialEffects(dt)
      this._drawSpecialEffects()

      let allDone = true
      bullets.forEach(b => {
        const localTime = now - startTime - b.fireDelay
        if (localTime < 0) {
          allDone = false
          if (mode === 'dart') {
            this._drawFlyingDart(b.startX, b.startY, -Math.PI / 2, b.size * 0.6, b.color, 0.4)
          } else {
            this._drawBulletChar(b.startX, b.startY, b.char, b.size * 0.6, b.color, 0.4)
          }
          return
        }
        if (!b.hit) {
          const t = Math.min(localTime / b.duration, 1)
          if (t < 1) {
            allDone = false
            const eased = easeOutQuad(t)
            const x = b.startX + (b.hitX - b.startX) * eased
            const y = b.startY + (b.hitY - b.startY) * eased
            const flightAngle = Math.atan2(b.hitY - b.startY, b.hitX - b.startX)
            if (mode === 'dart') {
              this._drawDartTrail(b.startX, b.startY, x, y, b.color)
              this._drawFlyingDart(x, y, flightAngle, b.size, b.color, 1)
            } else {
              this._drawBulletTrail(b.startX, b.startY, x, y, b.color)
              this._drawBulletChar(x, y, b.char, b.size, b.color, 1)
            }
          } else {
            b.hit = true
            b.explosionStart = now
            if (mode === 'dart') {
              const angle = Math.atan2(b.hitY - targetCy, b.hitX - targetCx) + Math.PI
              if (this.dartState.slotIndex >= 40) {
                this.dartState.stuckDarts.length = 22
                this.dartState.slotIndex = 22
              }
              this.dartState.slotIndex++
              this.dartState.stuckDarts.push({ x: b.hitX, y: b.hitY, angle, char: b.char, color: b.color })
              b.fragments = []
            } else {
              b.fragments = this._genFragments(b.char, b.hitX, b.hitY, b.color)
            }
            if (!b.hitTriggered) {
              b.hitTriggered = true
              this._triggerHitEffect(b.hitX, b.hitY, b.char, b.color)
              if (now > hitPausedUntil) hitPausedUntil = now + 40
            }
            allDone = false
          }
        } else {
          if (b.fragments && b.fragments.length > 0) {
            const elapsed = now - b.explosionStart
            const progress = Math.min(elapsed / explosionDuration, 1)
            if (progress < 1) {
              allDone = false
              this._drawExplosionFragments(b.fragments, progress)
            }
          }
        }
      })

      if (mode === 'dart') {
        this._drawStuckDarts()
        this._drawRingPulses()
      }
      this._drawDebris()
      this.ctx.restore()
      this._drawEffects()

      // 连击 UI
      this.drawComboUI(0, [])

      this._drawBurstText()

      if (!allDone) {
        this._animFrameId = this._raf(animate)
      } else {
        this._animFrameId = null
        this._onAttackComplete(bullets)
      }
    }

    this._animFrameId = this._raf(animate)
  }

  _drawBulletChar(x, y, char, size, color, alpha) {
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.font = `bold ${size}px sans-serif`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = color
    ctx.shadowBlur = 15
    ctx.fillText(char, x, y)
    ctx.restore()
  }

  _drawBulletTrail(x1, y1, x2, y2, color) {
    const ctx = this.ctx
    ctx.save()
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.3
    ctx.lineWidth = 2
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  _drawFlyingDart(x, y, angle, size, color, alpha) {
    const ctx = this.ctx
    const s = size * 0.6
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(x, y)
    ctx.rotate(angle)

    ctx.shadowColor = color
    ctx.shadowBlur = 6
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(s * 1.8, 0)
    ctx.lineTo(s * 0.4, -s * 0.32)
    ctx.lineTo(s * 0.1, 0)
    ctx.lineTo(s * 0.4, s * 0.32)
    ctx.closePath()
    ctx.fill()

    ctx.shadowBlur = 0
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(s * 0.1, 0)
    ctx.lineTo(-s * 1.5, 0)
    ctx.stroke()

    ctx.fillStyle = color
    ctx.globalAlpha = alpha * 0.7
    ctx.beginPath()
    ctx.moveTo(-s * 1.5, 0)
    ctx.lineTo(-s * 2.0, -s * 0.5)
    ctx.lineTo(-s * 1.2, 0)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-s * 1.5, 0)
    ctx.lineTo(-s * 2.0, s * 0.5)
    ctx.lineTo(-s * 1.2, 0)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  _drawDartTrail(x1, y1, x2, y2, color) {
    const ctx = this.ctx
    ctx.save()
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.2
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.restore()
  }

  _genFragments(char, hitX, hitY, color) {
    const count = 3 + Math.floor(Math.random() * 3)
    const fragments = []
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.8
      const dist = 40 + Math.random() * 80
      fragments.push({
        char: i === 0 ? char : '·',
        startX: hitX, startY: hitY,
        endX: hitX + Math.cos(angle) * dist,
        endY: hitY + Math.sin(angle) * dist - 20,
        size: i === 0 ? 20 + Math.random() * 8 : 10 + Math.random() * 6,
        color,
        rotation: (Math.random() - 0.5) * 90
      })
    }
    return fragments
  }

  _drawExplosionFragments(fragments, progress) {
    const ctx = this.ctx
    fragments.forEach(f => {
      const t = progress
      const x = f.startX + (f.endX - f.startX) * t
      const y = f.startY + (f.endY - f.startY) * t - Math.sin(t * Math.PI) * 25
      const alpha = 1 - progress * progress
      const rot = f.rotation * progress

      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot * Math.PI / 180)
      ctx.globalAlpha = alpha
      ctx.font = `bold ${f.size}px sans-serif`
      ctx.fillStyle = f.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = f.color
      ctx.shadowBlur = 8
      ctx.fillText(f.char, 0, 0)
      ctx.restore()
    })
  }

  _onAttackComplete(bullets) {
    const state = addHit()
    this.puppetState.hitCount = state.hitCount

    if (this.attackMode === 'gun') {
      const tiltInc = Math.min(bullets.length * 2.5, 12)
      this.puppetState.tiltAngle = Math.min(this.puppetState.tiltAngle + tiltInc, 30)
      this._rolyPolyBounce()
      vibrate('heavy')
    } else {
      this._dartBoardShake()
    }

    const colors = ['#ff3333', '#ff6600', '#ffcc00', '#ff0066', '#ff9900']
    bullets.forEach((b, i) => {
      setTimeout(() => {
        this._spawnDamageNumber(b.hitX, b.hitY, b.char, colors[i % colors.length])
      }, i * 30)
    })
    setTimeout(() => this._animateDamageNumbers(), 50)

    this._attacking = false

    setTimeout(() => {
      if (!this._attacking && this.canvas) this._animateBgParticles()
    }, 2500)
  }

  _rolyPolyBounce() {
    const start = this.puppetState.tiltAngle
    if (Math.abs(start) < 2) {
      this.puppetState.tiltAngle = 0
      this._drawStatic()
      return
    }
    const steps = [
      { angle: -start * 0.6, delay: 80 },
      { angle: start * 0.35, delay: 160 },
      { angle: -start * 0.18, delay: 230 },
      { angle: start * 0.08, delay: 290 },
      { angle: 0, delay: 340 }
    ]
    steps.forEach(step => {
      setTimeout(() => {
        this.puppetState.tiltAngle = step.angle
        this._drawStatic()
      }, step.delay)
    })
  }

  _dartBoardShake() {
    this.puppetState.tiltAngle = 2
    this._drawStatic()
    setTimeout(() => {
      this.puppetState.tiltAngle = -1
      this._drawStatic()
      setTimeout(() => {
        this.puppetState.tiltAngle = 0
        this._drawStatic()
      }, 80)
    }, 80)
  }

  reset() {
    this.puppetState.tiltAngle = 0
    this.puppetState.cracks = []
    this.puppetState.hitCount = 0
    this.dartState.stuckDarts = []
    this.dartState.ringPulses = []
    this.dartState.slotIndex = 0
    this._drawStatic()
    vibrate('medium')
  }

  isAttacking() {
    return this._attacking
  }
}
