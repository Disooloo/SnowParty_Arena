/**
 * WebSocket клиент для подключения к сессии
 */
export class SessionWebSocket {
  constructor(sessionCode, onMessage, onError, onClose) {
    this.sessionCode = sessionCode
    this.onMessage = onMessage
    this.onError = onError
    this.onClose = onClose
    this.ws = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 1000
    this.shouldReconnect = true
  }

  connect() {
    // Закрываем предыдущее соединение, если оно есть
    if (this.ws) {
      try {
        this.ws.close()
      } catch (e) {
        // Игнорируем ошибки при закрытии
      }
      this.ws = null
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // Используем тот же хост, что и для фронтенда (будет работать и с localhost, и с IP)
    const host = window.location.hostname || 'localhost'
    // Если фронтенд на другом порту, бэкенд всегда на 8000
    const backendPort = '8000'
    const wsUrl = `${protocol}//${host}:${backendPort}/ws/session/${this.sessionCode}/`
    
    console.log('Connecting to WebSocket:', wsUrl)
    
    try {
      this.ws = new WebSocket(wsUrl)
      
      this.ws.onopen = () => {
        console.log('WebSocket connected to:', wsUrl)
        this.reconnectAttempts = 0
        // Уведомляем об успешном подключении
        if (this.onMessage) {
          this.onMessage({ type: 'ws.connected' })
        }
      }
      
      // Добавляем обработчик для проверки состояния соединения
      this.ws.addEventListener('open', () => {
        console.log('WebSocket OPEN event')
      })
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.onMessage(data)
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        if (this.onError) {
          this.onError(error)
        }
      }
      
      this.ws.onclose = () => {
        console.log('WebSocket closed')
        if (this.onClose) {
          this.onClose()
        }
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++
          const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
          console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts})`)
          setTimeout(() => this.connect(), delay)
        }
      }
    } catch (error) {
      console.error('Error creating WebSocket:', error)
      if (this.onError) {
        this.onError(error)
      }
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.ws) {
      this.ws.close()
    }
  }
}

