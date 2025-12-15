/**
 * API клиент для REST запросов
 */
function getApiBase() {
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE
  }
  // Автоматически определяем URL бэкенда
  const protocol = window.location.protocol || 'http:'
  const host = window.location.hostname || 'localhost'
  const apiUrl = `${protocol}//${host}:8000/api`
  console.log('API Base URL:', apiUrl)
  return apiUrl
}

const API_BASE = getApiBase()

export async function createSession(config = {}) {
  const response = await fetch(`${API_BASE}/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  })
  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`)
  }
  return response.json()
}

export async function getSessionState(code) {
  const response = await fetch(`${API_BASE}/session/${code}`)
  if (!response.ok) {
    throw new Error(`Failed to get session: ${response.statusText}`)
  }
  return response.json()
}

export async function joinSession(code, name, deviceUuid) {
  const response = await fetch(`${API_BASE}/session/${code}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, device_uuid: deviceUuid }),
  })
  if (!response.ok) {
    // Проверяем, что ответ JSON, а не HTML
    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      const error = await response.json()
      throw new Error(error.error || `Failed to join session: ${response.statusText}`)
    } else {
      throw new Error(`Failed to join session: ${response.statusText}`)
    }
  }
  return response.json()
}

export async function startSession(code) {
  const response = await fetch(`${API_BASE}/session/${code}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) {
    // Проверяем, что ответ JSON, а не HTML
    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      const error = await response.json()
      throw new Error(error.error || `Failed to start session: ${response.statusText}`)
    } else {
      throw new Error(`Failed to start session: ${response.statusText}`)
    }
  }
  return response.json()
}

export async function submitProgress(token, level, score, timeSpentMs, details = {}, isMinigame = false) {
  const response = await fetch(`${API_BASE}/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token,
      level,
      score,
      time_spent_ms: timeSpentMs,
      details,
      is_minigame: isMinigame,
    }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || `Failed to submit progress: ${response.statusText}`)
  }
  return response.json()
}

export async function uploadSelfie(token, imageFile, task) {
  const formData = new FormData()
  formData.append('token', token)
  formData.append('image', imageFile)
  formData.append('task', task)
  
  console.log('📤 Отправка селфи на сервер:', { token: token.substring(0, 10) + '...', task, fileSize: imageFile.size })
  
  const response = await fetch(`${API_BASE}/selfie/upload`, {
    method: 'POST',
    body: formData,
    // Не устанавливаем Content-Type - браузер сделает это автоматически с правильным boundary для FormData
  })
  
  console.log('📥 Ответ сервера:', response.status, response.statusText)
  
  if (!response.ok) {
    const contentType = response.headers.get('content-type')
    let error
    if (contentType && contentType.includes('application/json')) {
      error = await response.json()
    } else {
      const text = await response.text()
      console.error('❌ Ошибка (не JSON):', text.substring(0, 200))
      throw new Error(`Failed to upload selfie: ${response.statusText}`)
    }
    throw new Error(error.error || `Failed to upload selfie: ${response.statusText}`)
  }
  const result = await response.json()
  console.log('✅ Селфи загружено успешно:', result)
  return result
}

export async function getSessionSelfies(code) {
  const response = await fetch(`${API_BASE}/session/${code}/selfies`)
  if (!response.ok) {
    throw new Error(`Failed to get session selfies: ${response.statusText}`)
  }
  return response.json()
}

export async function getAudioTracks() {
  const response = await fetch(`${API_BASE}/audio/tracks`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to get audio tracks: ${response.statusText}`)
  }
  return response.json()
}

// Crash Game API
export async function getCrashHistory(code) {
  const response = await fetch(`${API_BASE}/crash/${code}/history`)
  if (!response.ok) {
    throw new Error(`Failed to get crash history: ${response.statusText}`)
  }
  return response.json()
}

export async function getCurrentCrashGame(code) {
  const response = await fetch(`${API_BASE}/crash/${code}/current`)
  if (!response.ok) {
    throw new Error(`Failed to get current crash game: ${response.statusText}`)
  }
  return response.json()
}

export async function createCrashGame(code) {
  const response = await fetch(`${API_BASE}/crash/${code}/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to create crash game: ${response.statusText}`)
  }
  return response.json()
}

export async function placeCrashBet(token, gameId, multiplier, betAmount = 0) {
  const response = await fetch(`${API_BASE}/crash/bet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token,
      game_id: gameId,
      multiplier,
      bet_amount: betAmount,
    }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(error.error || `Failed to place bet: ${response.statusText}`)
  }
  return response.json()
}

export async function finishCrashGame(gameId) {
  const response = await fetch(`${API_BASE}/crash/${gameId}/finish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to finish crash game: ${response.statusText}`)
  }
  return response.json()
}

export async function getCrashBets(code, token) {
  const response = await fetch(`${API_BASE}/crash/${code}/bets?token=${token}`)
  if (!response.ok) {
    throw new Error(`Failed to get crash bets: ${response.statusText}`)
  }
  return response.json()
}

// Admin API
export async function adminLogin(username, password) {
  const response = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Admin login failed')
  }
  return response.json()
}

export async function adminGetPlayers(token, { session, active } = {}) {
  const params = new URLSearchParams()
  if (session) params.append('session', session)
  if (active) params.append('active', '1')
  const response = await fetch(`${API_BASE}/admin/players?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error('Failed to load players')
  }
  return response.json()
}

export async function adminGetPlayer(token, playerId) {
  const response = await fetch(`${API_BASE}/admin/player/${playerId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error('Failed to load player')
  }
  return response.json()
}

export async function adminAdjustPoints(token, playerId, { delta, reason, hidden }) {
  const response = await fetch(`${API_BASE}/admin/player/${playerId}/points`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ delta, reason, hidden }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to adjust points')
  }
  return response.json()
}

export async function adminDeletePlayer(token, playerId) {
  const response = await fetch(`${API_BASE}/admin/player/${playerId}/delete`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to delete player')
  }
  return response.json()
}

export async function adminCreateRig(token, { session, value, player_id, apply_once = true }) {
  const response = await fetch(`${API_BASE}/admin/rig`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ session, value, player_id, apply_once }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to set rig')
  }
  return response.json()
}

export async function updatePlayerProgress(playerToken, progressData) {
  const response = await fetch(`${API_BASE}/player/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      player_token: playerToken,
      ...progressData
    }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to update player progress')
  }
  return response.json()
}

