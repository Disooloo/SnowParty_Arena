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

