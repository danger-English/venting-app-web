export function easeOutQuad(t) {
  return t * (2 - t)
}

export function easeInCubic(t) {
  return t * t * t
}

export function easeOutBack(t) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export function vibrate(type = 'light') {
  if (!navigator.vibrate) return
  switch (type) {
    case 'light': navigator.vibrate(15); break
    case 'medium': navigator.vibrate(40); break
    case 'heavy': navigator.vibrate(80); break
  }
}

let toastTimer = null
export function showToast(title, duration = 1500) {
  let el = document.getElementById('toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toast'
    el.className = 'toast'
    document.body.appendChild(el)
  }
  el.textContent = title
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), duration)
}

export function showModal(title, content) {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">${title}</div>
        <div class="modal-content">${content}</div>
        <div class="modal-btns">
          <button class="modal-cancel">取消</button>
          <button class="modal-confirm">确定</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    overlay.querySelector('.modal-cancel').onclick = () => {
      overlay.remove()
      resolve(false)
    }
    overlay.querySelector('.modal-confirm').onclick = () => {
      overlay.remove()
      resolve(true)
    }
  })
}
