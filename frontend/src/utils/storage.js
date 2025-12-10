/**
 * Утилиты для работы с localStorage
 */

export function getDeviceUuid() {
  let uuid = localStorage.getItem('device_uuid')
  if (!uuid) {
    // Используем crypto.randomUUID() если доступен, иначе генерируем вручную
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      uuid = crypto.randomUUID()
    } else {
      // Fallback для старых браузеров
      uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
      })
    }
    localStorage.setItem('device_uuid', uuid)
  }
  return uuid
}

export function getPlayerToken() {
  return localStorage.getItem('player_token')
}

export function setPlayerToken(token) {
  localStorage.setItem('player_token', token)
}

export function clearPlayerData() {
  localStorage.removeItem('player_token')
  localStorage.removeItem('session_code')
  clearGameState()
}

export function getSessionCode() {
  return localStorage.getItem('session_code')
}

export function setSessionCode(code) {
  localStorage.setItem('session_code', code)
}

export function saveGameState(state) {
  try {
    localStorage.setItem('game_state', JSON.stringify(state))
  } catch (err) {
    console.error('Error saving game state:', err)
  }
}

export function getGameState() {
  try {
    const state = localStorage.getItem('game_state')
    return state ? JSON.parse(state) : null
  } catch (err) {
    console.error('Error loading game state:', err)
    return null
  }
}

export function clearGameState() {
  localStorage.removeItem('game_state')
}


