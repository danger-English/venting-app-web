const STORAGE_KEY = 'ventingGameState'

export function getState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
      hitCount: 0,
      photoData: '',
      cracks: []
    }
  } catch {
    return { hitCount: 0, photoData: '', cracks: [] }
  }
}

export function setState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function addHit() {
  const state = getState()
  state.hitCount += 1
  setState(state)
  return state
}

export function setPhoto(dataUrl) {
  const state = getState()
  state.photoData = dataUrl
  setState(state)
}

export function addCrack(x, y) {
  const state = getState()
  state.cracks.push({ x, y, size: Math.random() * 10 + 5 })
  setState(state)
}

export function resetState() {
  setState({ hitCount: 0, photoData: '', cracks: [] })
}

export function hasVisited() {
  return localStorage.getItem('hasVisited') === 'true'
}

export function markVisited() {
  localStorage.setItem('hasVisited', 'true')
}
