import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { SessionWebSocket } from '../utils/websocket'
import { getSessionState, createSession, startSession, getSessionSelfies, getAudioTracks } from '../utils/api'
import QRCode from 'qrcode.react'
import './TVScreen.css'

// Функция для расчета позиции фотки в карусели
function getSelfiePosition(index, total, centerIndex) {
  if (total === 1) {
    return { x: 0, y: 0, z: 0, rotateY: 0 }
  }
  
  const isCenter = index === centerIndex
  const offset = index - centerIndex
  
  if (isCenter) {
    return { x: 0, y: 0, z: 0, rotateY: 0 }
  }
  
  // Располагаем фотки вокруг центральной в виде стопки
  // Если 2 фотки: одна по центру, вторая сзади
  // Если 3+: центральная по центру, остальные вокруг
  
  if (total === 2) {
    // Вторая фотка сзади центральной
    return {
      x: offset > 0 ? 80 : -80,
      y: 0,
      z: -50,
      rotateY: offset > 0 ? 15 : -15
    }
  }
  
  // Для 3+ фоток располагаем вокруг центральной
  const positions = []
  let posIndex = 0
  for (let i = 0; i < total; i++) {
    if (i !== centerIndex) {
      positions.push(i)
    }
  }
  
  const positionInCircle = positions.indexOf(index)
  const totalAround = positions.length
  const angle = (positionInCircle * 360) / totalAround
  const radius = 150 // Расстояние от центра
  const radian = (angle * Math.PI) / 180
  
  return {
    x: Math.sin(radian) * radius,
    y: Math.cos(radian) * radius * 0.2, // Немного вверх/вниз
    z: -Math.abs(offset) * 40, // Глубина для эффекта стопки
    rotateY: angle + 90
  }
}

function TVScreen() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionCodeParam = searchParams.get('session')
  
  const [session, setSession] = useState(null)
  const [players, setPlayers] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [gameStatus, setGameStatus] = useState('pending')
  const [error, setError] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [showFireworks, setShowFireworks] = useState(false)
  const [previousLeaderboard, setPreviousLeaderboard] = useState([])
  const [selfies, setSelfies] = useState([]) // Массив селфи игроков
  const [currentSelfieIndex, setCurrentSelfieIndex] = useState(0)
  const [previousSessionCode, setPreviousSessionCode] = useState(null)
  const [gameTime, setGameTime] = useState(0) // Время игры в секундах
  const [audioTracks, setAudioTracks] = useState([]) // Список треков
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0) // Индекс текущего трека
  const [isPlaying, setIsPlaying] = useState(false) // Состояние воспроизведения
  const [currentTrackName, setCurrentTrackName] = useState('') // Название текущего трека
  
  const wsRef = useRef(null)
  const audioRef = useRef(null)
  const fireworksTimeoutRef = useRef(null)
  const selfieCarouselRef = useRef(null)
  const gameTimerRef = useRef(null)

  useEffect(() => {
    initializeSession()
    loadAudioTracks()
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect()
      }
      if (fireworksTimeoutRef.current) {
        clearTimeout(fireworksTimeoutRef.current)
      }
      if (selfieCarouselRef.current) {
        clearInterval(selfieCarouselRef.current)
      }
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current)
      }
    }
  }, [sessionCodeParam]) // Переподключаемся при изменении кода сессии

  // Загрузка списка треков
  const loadAudioTracks = async () => {
    try {
      const data = await getAudioTracks()
      console.log('🎵 Данные треков:', data)
      if (data.tracks && data.tracks.length > 0) {
        setAudioTracks(data.tracks)
        setCurrentTrackIndex(0)
        setCurrentTrackName(data.tracks[0].name)
        // Устанавливаем первый трек
        if (audioRef.current) {
          const protocol = window.location.protocol || 'http:'
          const host = window.location.hostname || 'localhost'
          const port = window.location.port || '8000'
          const fullUrl = `${protocol}//${host}:${port}${data.tracks[0].url}`
          console.log('🎵 Загружаем трек:', fullUrl)
          audioRef.current.src = fullUrl
          audioRef.current.load() // Загружаем трек
          // НЕ запускаем автоматически - пользователь сам нажмет кнопку
          // Автоматическое воспроизведение может быть заблокировано браузером
        }
      } else {
        console.warn('⚠️ Треки не найдены:', data.message || data.error)
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки треков:', err)
    }
  }

  // Функция переключения на следующий трек
  const nextTrack = () => {
    if (audioTracks.length === 0) return
    
    const nextIndex = (currentTrackIndex + 1) % audioTracks.length
    setCurrentTrackIndex(nextIndex)
    setCurrentTrackName(audioTracks[nextIndex].name)
    
    if (audioRef.current) {
      const protocol = window.location.protocol || 'http:'
      const host = window.location.hostname || 'localhost'
      const port = window.location.port || '8000'
      const fullUrl = `${protocol}//${host}:${port}${audioTracks[nextIndex].url}`
      console.log('🎵 Переключаем на трек:', fullUrl)
      audioRef.current.src = fullUrl
      audioRef.current.load() // Загружаем новый трек
      
      // Если был включен, продолжаем воспроизведение
      if (isPlaying) {
        audioRef.current.play().then(() => {
          console.log('✅ Воспроизведение продолжено')
        }).catch(err => {
          console.error('❌ Ошибка воспроизведения:', err)
          setIsPlaying(false)
        })
      }
    }
  }

  // Функция паузы/воспроизведения
  const togglePlayPause = () => {
    const audio = audioRef.current
    if (!audio) {
      console.error('❌ Аудио элемент не найден')
      return
    }
    
    // Проверяем, есть ли src
    if (!audio.src) {
      console.error('❌ Аудио src не установлен')
      // Пытаемся загрузить текущий трек
      if (audioTracks.length > 0 && currentTrackIndex >= 0) {
        const protocol = window.location.protocol || 'http:'
        const host = window.location.hostname || 'localhost'
        const port = window.location.port || '8000'
        const fullUrl = `${protocol}//${host}:${port}${audioTracks[currentTrackIndex].url}`
        console.log('🎵 Устанавливаем src:', fullUrl)
        audio.src = fullUrl
        audio.load() // Загружаем трек
      } else {
        console.error('❌ Нет треков для воспроизведения')
        return
      }
    }
    
    if (audio.paused) {
      // Воспроизводим
      console.log('▶️ Запускаем воспроизведение')
      audio.play().then(() => {
        setIsPlaying(true)
        console.log('✅ Воспроизведение запущено')
      }).catch(err => {
        console.error('❌ Ошибка воспроизведения:', err)
        setIsPlaying(false)
      })
    } else {
      // Ставим на паузу
      console.log('⏸️ Ставим на паузу')
      audio.pause()
      setIsPlaying(false)
    }
  }

  // Обработка окончания трека
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || audioTracks.length === 0) return

    const handleEnded = () => {
      console.log('🎵 Трек закончился, переключаем на следующий')
      // Переключаем на следующий трек
      const nextIndex = (currentTrackIndex + 1) % audioTracks.length
      setCurrentTrackIndex(nextIndex)
      setCurrentTrackName(audioTracks[nextIndex].name)
      
      const protocol = window.location.protocol || 'http:'
      const host = window.location.hostname || 'localhost'
      const port = window.location.port || '8000'
      const fullUrl = `${protocol}//${host}:${port}${audioTracks[nextIndex].url}`
      console.log('🎵 Загружаем следующий трек:', fullUrl)
      audio.src = fullUrl
      audio.load()
      
      // Автоматически продолжаем воспроизведение
      audio.play().then(() => {
        setIsPlaying(true)
        console.log('✅ Следующий трек запущен')
      }).catch(err => {
        console.error('❌ Ошибка воспроизведения следующего трека:', err)
        setIsPlaying(false)
      })
    }

    audio.addEventListener('ended', handleEnded)
    return () => {
      audio.removeEventListener('ended', handleEnded)
    }
  }, [audioTracks, currentTrackIndex])

  // Обработчики событий аудио
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handlePlay = () => {
      console.log('🎵 Событие play')
      setIsPlaying(true)
    }
    const handlePause = () => {
      console.log('⏸️ Событие pause')
      setIsPlaying(false)
    }
    const handleError = (e) => {
      console.error('❌ Ошибка аудио:', e)
      setIsPlaying(false)
    }
    const handleLoadStart = () => {
      console.log('📥 Начало загрузки трека')
    }
    const handleCanPlay = () => {
      console.log('✅ Трек готов к воспроизведению')
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('error', handleError)
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('canplay', handleCanPlay)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('canplay', handleCanPlay)
    }
  }, [])

  // Автоматическая карусель селфи
  // Очистка селфи при смене сессии
  useEffect(() => {
    if (session && session.code !== previousSessionCode) {
      console.log('🔄 Новая сессия, очищаем старые селфи')
      setSelfies([])
      setCurrentSelfieIndex(0)
      setPreviousSessionCode(session.code)
    }
  }, [session, previousSessionCode])

  // Автоматическая смена центральной фотки каждые 5 секунд
  useEffect(() => {
    if (selfies.length > 1) {
      selfieCarouselRef.current = setInterval(() => {
        // Выбираем случайную фотку, но не текущую
        const availableIndices = selfies
          .map((_, idx) => idx)
          .filter(idx => idx !== currentSelfieIndex)
        if (availableIndices.length > 0) {
          const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)]
          setCurrentSelfieIndex(randomIndex)
        }
      }, 5000) // Меняем каждые 5 секунд
      
      return () => {
        if (selfieCarouselRef.current) {
          clearInterval(selfieCarouselRef.current)
        }
      }
    }
  }, [selfies.length, currentSelfieIndex])

  const initializeSession = async () => {
    try {
      setError(null)
      let code = sessionCodeParam
      
      // Запускаем таймер если игра уже идет
      if (gameStatus === 'active' && session && session.started_at) {
        const startTime = new Date(session.started_at).getTime()
        const updateTimer = () => {
          const now = Date.now()
          const elapsed = Math.floor((now - startTime) / 1000)
          setGameTime(elapsed)
        }
        updateTimer()
        if (gameTimerRef.current) clearInterval(gameTimerRef.current)
        gameTimerRef.current = setInterval(updateTimer, 1000)
      }
      
      // Проверяем сохранённую сессию в localStorage
      const savedSessionCode = localStorage.getItem('tv_session_code')
      
      if (!code && savedSessionCode) {
        code = savedSessionCode
        window.history.replaceState({}, '', `/tv?session=${code}`)
      }
      
      if (!code) {
        // Создаём новую сессию
        const newSession = await createSession({
          level_duration_seconds: 300,
          min_players: 2,
          auto_start: false,  // Ручной старт через кнопку на ТВ
        })
        code = newSession.code
        localStorage.setItem('tv_session_code', code)
        window.history.replaceState({}, '', `/tv?session=${code}`)
      } else {
        // Сохраняем код сессии
        localStorage.setItem('tv_session_code', code)
      }
      
      const sessionData = await getSessionState(code)
      setSession(sessionData)
      setGameStatus(sessionData.status)
      
      // Загружаем существующие селфи для этой сессии
      try {
        const selfiesData = await getSessionSelfies(code)
        console.log('📸 Загружены существующие селфи:', selfiesData.selfies?.length || 0)
        if (selfiesData.selfies && selfiesData.selfies.length > 0) {
          const formattedSelfies = selfiesData.selfies.map(selfie => ({
            player_id: selfie.player_id,
            player_name: selfie.player_name,
            task: selfie.task,
            image: selfie.image_url,
            image_url: selfie.image_url,
            selfie_id: selfie.selfie_id
          }))
          setSelfies(formattedSelfies)
          console.log('✅ Селфи добавлены в карусель:', formattedSelfies.length)
        }
      } catch (err) {
        console.error('❌ Ошибка загрузки селфи:', err)
        // Не критично, продолжаем работу
      }
      
      // Запускаем таймер если игра уже идет
      if (sessionData.status === 'active' && sessionData.started_at) {
        const startTime = new Date(sessionData.started_at).getTime()
        const updateTimer = () => {
          const now = Date.now()
          const elapsed = Math.floor((now - startTime) / 1000)
          setGameTime(elapsed)
        }
        updateTimer()
        if (gameTimerRef.current) clearInterval(gameTimerRef.current)
        gameTimerRef.current = setInterval(updateTimer, 1000)
      }
      
      // Подключаемся к WebSocket
      connectWebSocket(code)
      
      // Музыка будет загружена через loadAudioTracks
      // Автоматическое воспроизведение не запускаем, так как может быть заблокировано браузером
    } catch (err) {
      console.error('Error initializing session:', err)
      setError(err.message || 'Не удалось подключиться к серверу')
    }
  }

  const connectWebSocket = (code) => {
    if (wsRef.current) {
      wsRef.current.disconnect()
    }

    wsRef.current = new SessionWebSocket(
      code,
      handleWebSocketMessage,
      handleWebSocketError,
      () => {
        setWsConnected(false)
        console.log('WebSocket disconnected')
      }
    )
    
    wsRef.current.connect()
    // НЕ устанавливаем wsConnected в true сразу - только после успешного подключения
  }

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'ws.connected':
        setWsConnected(true)
        setError(null)
        console.log('WebSocket connected successfully')
        break
      case 'error':
        console.error('WebSocket error:', data.payload)
        setError(data.payload.message || 'Ошибка WebSocket')
        setWsConnected(false)
        break
      case 'session.state':
        setGameStatus(data.payload.status)
        // Обновляем сессию с started_at если пришло
        if (data.payload.started_at && session) {
          setSession({ ...session, started_at: data.payload.started_at })
        }
        if (data.payload.status === 'active') {
          // Игра началась - запускаем таймер
          const startTime = data.payload.started_at 
            ? new Date(data.payload.started_at).getTime()
            : (session?.started_at ? new Date(session.started_at).getTime() : null)
          
          if (startTime) {
            const updateTimer = () => {
              const now = Date.now()
              const elapsed = Math.floor((now - startTime) / 1000)
              setGameTime(elapsed)
            }
            updateTimer()
            if (gameTimerRef.current) clearInterval(gameTimerRef.current)
            gameTimerRef.current = setInterval(updateTimer, 1000)
            console.log('⏱️ Таймер запущен, старт игры:', new Date(startTime).toLocaleTimeString())
          }
        } else if (data.payload.status === 'finished') {
          // Игра завершена - останавливаем таймер
          if (gameTimerRef.current) {
            clearInterval(gameTimerRef.current)
            gameTimerRef.current = null
          }
        }
        break
      case 'game.event':
        console.log('Game event:', data.payload)
        // Обрабатываем старт игры
        if (data.payload.kind === 'game.started') {
          console.log('🎮 Игра началась через game.event!')
          // Обновляем статус и запускаем таймер
          setGameStatus('active')
          if (session) {
            // Обновляем сессию чтобы получить started_at
            getSessionState(session.code).then(sessionData => {
              setSession(sessionData)
              if (sessionData.started_at) {
                const startTime = new Date(sessionData.started_at).getTime()
                const updateTimer = () => {
                  const now = Date.now()
                  const elapsed = Math.floor((now - startTime) / 1000)
                  setGameTime(elapsed)
                }
                updateTimer()
                if (gameTimerRef.current) clearInterval(gameTimerRef.current)
                gameTimerRef.current = setInterval(updateTimer, 1000)
                console.log('⏱️ Таймер запущен после game.started')
              }
            }).catch(err => {
              console.error('❌ Ошибка получения состояния сессии:', err)
            })
          }
        }
        // Обрабатываем селфи от игроков
        else if (data.payload.kind === 'selfie.uploaded' && data.payload.data) {
          const selfieData = data.payload.data
          console.log('📸 Получено селфи через WebSocket:', selfieData)
          
          // Проверяем, что селфи относится к текущей сессии
          if (!session || !session.code) {
            console.log('❌ Нет активной сессии, пропускаем селфи')
            break
          }
          
          // Используем URL, который пришел с сервера (он уже полный)
          let imageUrl = selfieData.image_url
          
          // Если URL не полный (старый формат), формируем его
          if (imageUrl && !imageUrl.startsWith('http')) {
            const protocol = window.location.protocol || 'http:'
            const host = window.location.hostname || 'localhost'
            const port = window.location.port || '8000'
            imageUrl = `${protocol}//${host}:${port}${imageUrl}`
          }
          
          console.log('🖼️ URL изображения для карусели:', imageUrl)
          
          // Автоматически добавляем селфи в карусель
          if (imageUrl) {
            setSelfies(prev => {
              // Проверяем, нет ли уже такого селфи (по selfie_id)
              const exists = prev.some(s => s.selfie_id === selfieData.selfie_id)
              
              if (exists) {
                console.log('⚠️ Селфи уже есть в карусели, пропускаем')
                return prev
              }
              
              console.log('✅ Автоматически добавляем новое селфи в карусель:', {
                player_name: selfieData.player_name,
                task: selfieData.task,
                image_url: imageUrl
              })
              
              return [...prev, {
                selfie_id: selfieData.selfie_id || Date.now().toString(),
                player_id: selfieData.player_id,
                player_name: selfieData.player_name,
                task: selfieData.task,
                image_url: imageUrl,
                created_at: new Date().toISOString()
              }]
            })
          }
        }
        break
      case 'players.list':
        setPlayers(data.payload.players || [])
        break
      case 'leaderboard.update':
        const newLeaderboard = data.payload.leaderboard || []
        
        // Проверяем, изменился ли лидер (первое место)
        if (previousLeaderboard.length > 0 && newLeaderboard.length > 0) {
          const oldLeader = previousLeaderboard[0]
          const newLeader = newLeaderboard[0]
          
          // Если новый лидер или лидер изменил место в топ-3
          if (oldLeader && newLeader && (
            oldLeader.player_id !== newLeader.player_id ||
            (oldLeader.rank !== newLeader.rank && newLeader.rank <= 3)
          )) {
            // Запускаем фейерверк
            setShowFireworks(true)
            if (fireworksTimeoutRef.current) {
              clearTimeout(fireworksTimeoutRef.current)
            }
            fireworksTimeoutRef.current = setTimeout(() => {
              setShowFireworks(false)
            }, 3000) // 3 секунды
          }
        }
        
        setPreviousLeaderboard(newLeaderboard)
        setLeaderboard(newLeaderboard)
        break
      default:
        break
    }
  }

  const handleWebSocketError = (error) => {
    console.error('WebSocket error:', error)
    // Не показываем ошибку сразу, так как есть автоматическое переподключение
    // setError('Ошибка подключения к серверу')
  }

  const handleStartGame = async () => {
    if (!session) return
    try {
      await startSession(session.code)
    } catch (err) {
      setError(err.message)
    }
  }

  const getJoinUrl = () => {
    if (!session) return ''
    const protocol = window.location.protocol
    
    // Всегда используем IP адрес для QR-кода, чтобы работало на телефонах в той же сети
    let host = window.location.hostname
    
    // Если открыто на localhost, пытаемся использовать IP из URL или показываем инструкцию
    if (host === 'localhost' || host === '127.0.0.1') {
      // Пытаемся извлечь IP из текущего URL
      const currentUrl = window.location.href
      const ipMatch = currentUrl.match(/https?:\/\/(\d+\.\d+\.\d+\.\d+)/)
      if (ipMatch) {
        host = ipMatch[1]
      } else {
        // Если IP не найден в URL, используем первый IP из списка сетевых интерфейсов
        // В большинстве случаев это будет правильный IP для локальной сети
        // Но лучше открывать /tv по IP адресу напрямую
        host = '192.168.100.143' // Замените на ваш IP, если отличается
      }
    }
    
    // Используем текущий порт фронтенда
    const port = window.location.port || (protocol === 'https:' ? '443' : '5173')
    return `${protocol}//${host}:${port}/play?session=${session.code}`
  }

  const handleExitSession = () => {
    // Очищаем сохранённую сессию
    localStorage.removeItem('tv_session_code')
    // Отключаемся от WebSocket
    if (wsRef.current) {
      wsRef.current.disconnect()
    }
    // Перенаправляем на страницу без сессии
    navigate('/tv')
  }

  if (error) {
    return (
      <div className="tv-screen error">
        <h1>Ошибка</h1>
        <p>{error}</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="tv-screen loading">
        <h1>Загрузка...</h1>
      </div>
    )
  }

  const joinUrl = getJoinUrl()

  return (
    <div className="tv-screen">
      {/* Эффект фейерверка */}
      {showFireworks && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 9999,
          overflow: 'hidden'
        }}>
          {[...Array(50)].map((_, i) => {
            const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#8800ff']
            const color = colors[Math.floor(Math.random() * colors.length)]
            return (
              <div
                key={i}
                className="firework-particle"
                style={{
                  background: color,
                  left: `${50 + (Math.random() - 0.5) * 20}%`,
                  top: `${50 + (Math.random() - 0.5) * 20}%`,
                  animationDelay: `${Math.random() * 0.5}s`,
                  animationDuration: `${1 + Math.random()}s`
                }}
              />
            )
          })}
        </div>
      )}
      
      <audio ref={audioRef} style={{ display: 'none' }} />
      
      <div className="tv-header">
        <h1>🎄 Снежная арена </h1>
        <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
          <div style={{background: 'rgba(0, 0, 0, 0.5)', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontSize: '0.9rem'}}>
            Код сессии: <strong style={{color: '#44ff44'}}>{session?.code || 'неизвестен'}</strong>
          </div>
          <div className="status-indicator">
            <span className={`status-dot ${wsConnected ? 'connected' : 'disconnected'}`}></span>
            <span>{wsConnected ? 'Подключено' : 'Отключено'}</span>
          </div>
          <button 
            onClick={handleExitSession}
            style={{
              background: 'rgba(255, 68, 68, 0.8)',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Выйти из сессии
          </button>
        </div>
      </div>

      {gameStatus === 'pending' && (
        <div className="tv-start-screen" style={{
          display: 'flex',
          gap: '3rem',
          padding: '2rem',
          height: 'calc(100vh - 100px)',
          alignItems: 'center'
        }}>
          {/* Левая часть: Игроки */}
          <div style={{
            flex: '0 0 300px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            height: '100%'
          }}>
            <div className="players-waiting">
              <h3 style={{fontSize: '1.5rem', marginBottom: '1.5rem', textAlign: 'center'}}>Игроки ({players.length})</h3>
              <ul style={{listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
                {players.map((player, idx) => (
                  <li key={player.id} style={{
                    padding: '1rem',
                    background: 'rgba(255, 255, 255, 0.15)',
                    borderRadius: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    border: '2px solid rgba(68, 255, 68, 0.3)',
                    transition: 'all 0.3s'
                  }}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                      <span style={{
                        color: '#44ff44',
                        fontWeight: 'bold',
                        fontSize: '1.2rem',
                        minWidth: '40px',
                        textAlign: 'center'
                      }}>#{idx + 1}</span>
                      <span style={{fontSize: '1.1rem', flex: 1}}>{player.name}</span>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#aaa'}}>
                      <span>Очки: <strong style={{color: '#44ff44'}}>{player.final_score || 0}</strong></span>
                      <span>Статус: <strong style={{
                        color: player.status === 'playing' ? '#44ff44' : player.status === 'done' ? '#ffaa00' : '#888'
                      }}>{player.status === 'playing' ? 'Играет' : player.status === 'done' ? 'Закончил' : 'Готов'}</strong></span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {players.length >= session.min_players && (
              <button className="start-button" onClick={handleStartGame} style={{
                padding: '1.2rem 2rem',
                fontSize: '1.3rem',
                background: 'linear-gradient(135deg, #44ff44, #00cc00)',
                color: '#000',
                border: 'none',
                borderRadius: '0.75rem',
                cursor: 'pointer',
                fontWeight: 'bold',
                marginTop: '2rem',
                boxShadow: '0 4px 15px rgba(68, 255, 68, 0.4)',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                Начать игру
              </button>
            )}
          </div>
          
          {/* Центральная часть: QR-код и музыка */}
          <div style={{
            flex: '1',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2rem'
          }}>
            <div className="qr-container" style={{
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '2rem',
              borderRadius: '1.5rem',
              border: '3px solid rgba(68, 255, 68, 0.3)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              textAlign: 'center'
            }}>
              <QRCode value={joinUrl} size={350} />
              <p className="session-code" style={{
                marginTop: '1.5rem',
                fontSize: '1.3rem',
                fontWeight: 'bold'
              }}>
                Код сессии: <strong style={{color: '#44ff44', fontSize: '1.5rem'}}>{session.code}</strong>
              </p>
              <p className="join-url" style={{
                fontSize: '1rem',
                wordBreak: 'break-all',
                marginTop: '0.5rem',
                color: '#aaa'
              }}>{joinUrl}</p>
              {window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? (
                <p style={{color: '#ffaa00', marginTop: '1rem', fontSize: '0.9rem', textAlign: 'center'}}>
                  ⚠️ Для работы на телефонах откройте эту страницу по IP: <strong>http://192.168.100.143:5173/tv</strong>
                </p>
              ) : null}
            </div>
            
            <div style={{
              width: '100%',
              maxWidth: '400px',
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '1.5rem',
              borderRadius: '1rem',
              border: '2px solid rgba(68, 255, 68, 0.2)'
            }}>
              <h3 style={{marginBottom: '1rem', textAlign: 'center', fontSize: '1.2rem'}}>🎵 Новогодняя музыка</h3>
              {audioTracks.length > 0 ? (
                <>
                  <audio 
                    ref={audioRef} 
                    style={{display: 'none'}}
                  />
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    alignItems: 'center'
                  }}>
                    <div style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      width: '100%',
                      textAlign: 'center',
                      marginBottom: '0.5rem'
                    }}>
                      <p style={{
                        fontSize: '1rem',
                        color: '#fff',
                        fontWeight: 'bold',
                        margin: 0,
                        wordBreak: 'break-word'
                      }}>
                        {currentTrackName || 'Загрузка...'}
                      </p>
                      {audioTracks.length > 0 && (
                        <p style={{
                          fontSize: '0.8rem',
                          color: '#aaa',
                          margin: '0.5rem 0 0 0'
                        }}>
                          Трек {currentTrackIndex + 1} из {audioTracks.length}
                        </p>
                      )}
                    </div>
                    <div style={{
                      display: 'flex',
                      gap: '1rem',
                      alignItems: 'center'
                    }}>
                      <button
                        onClick={togglePlayPause}
                        style={{
                          padding: '0.75rem 1.5rem',
                          fontSize: '1rem',
                          background: isPlaying ? 'rgba(255, 68, 68, 0.8)' : 'rgba(68, 255, 68, 0.8)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          transition: 'all 0.2s'
                        }}
                      >
                        {isPlaying ? '⏸ Пауза' : '▶ Воспроизвести'}
                      </button>
                      <button
                        onClick={nextTrack}
                        style={{
                          padding: '0.75rem 1.5rem',
                          fontSize: '1rem',
                          background: 'rgba(68, 68, 255, 0.8)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          transition: 'all 0.2s'
                        }}
                      >
                        ⏭ Следующий
                      </button>
                    </div>
                    <p style={{fontSize: '0.8rem', color: '#888', textAlign: 'center', marginTop: '0.5rem'}}>
                      Трек {currentTrackIndex + 1} из {audioTracks.length}
                    </p>
                  </div>
                </>
              ) : (
                <p style={{fontSize: '0.9rem', color: '#aaa', textAlign: 'center'}}>
                  Музыка не найдена
                </p>
              )}
            </div>
          </div>
          
          {/* Правая часть: пустое пространство для баланса */}
          <div style={{flex: '0 0 300px'}}></div>
        </div>
      )}

      {gameStatus === 'active' && (
        <div className="tv-game-screen" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2rem',
          padding: '2rem'
        }}>
          {/* Левая колонка: Лидерборд и Игроки */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2rem'
          }}>
            <div className="leaderboard">
              <h2>🏆 Лидерборд</h2>
              <div className="leaderboard-list">
                {leaderboard.map((entry, idx) => (
                  <div key={entry.player_id} className={`leaderboard-entry ${idx < 3 ? `rank-${idx + 1}` : ''}`}>
                    <span className="rank">#{entry.rank}</span>
                    <span className="name">{entry.name}</span>
                    <span className="score">{entry.final_score} очков</span>
                    <span className="level">{entry.current_level}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="players-status">
              <h3>Игроки</h3>
              <div style={{
                maxHeight: '400px',
                overflowY: 'auto',
                overflowX: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                paddingRight: '0.5rem'
              }}>
                {players.map(player => (
                  <div key={player.id} style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                  }}>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.25rem'}}>{player.name}</div>
                      <div style={{fontSize: '0.85rem', color: '#aaa'}}>{player.current_level}</div>
                    </div>
                    <div style={{textAlign: 'right'}}>
                      <div style={{fontSize: '0.9rem', color: '#44ff44', fontWeight: 'bold'}}>{player.final_score || 0} очков</div>
                      <div style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        display: 'inline-block',
                        background: player.status === 'playing' ? 'rgba(68, 255, 68, 0.3)' : player.status === 'done' ? 'rgba(255, 170, 0, 0.3)' : 'rgba(136, 136, 136, 0.3)',
                        color: player.status === 'playing' ? '#44ff44' : player.status === 'done' ? '#ffaa00' : '#888'
                      }}>
                        {player.status === 'playing' ? 'Играет' : player.status === 'done' ? 'Закончил' : 'Готов'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Правая колонка: Таймер и Карусель */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2rem'
          }}>
            {/* Таймер игры с проигрывателем */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '2rem',
              borderRadius: '1rem',
              backdropFilter: 'blur(10px)',
              textAlign: 'center'
            }}>
              <h3 style={{fontSize: '1.5rem', marginBottom: '1.5rem'}}>⏱️ Идет игра</h3>
              <div style={{
                fontSize: '3rem',
                fontWeight: 'bold',
                color: '#44ff44',
                textShadow: '0 0 20px rgba(68, 255, 68, 0.8)',
                fontFamily: 'monospace',
                letterSpacing: '0.1em',
                marginBottom: '1.5rem'
              }}>
                {String(Math.floor(gameTime / 3600)).padStart(2, '0')}:
                {String(Math.floor((gameTime % 3600) / 60)).padStart(2, '0')}:
                {String(gameTime % 60).padStart(2, '0')}
              </div>
              <div style={{
                marginTop: '1rem'
              }}>
                <h4 style={{fontSize: '1.2rem', marginBottom: '1rem'}}>🎵 Новогодняя музыка</h4>
                {audioTracks.length > 0 ? (
                  <>
                    <audio 
                      ref={audioRef} 
                      style={{display: 'none'}}
                    />
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      alignItems: 'center'
                    }}>
                      <div style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        width: '100%',
                        textAlign: 'center',
                        marginBottom: '0.5rem'
                      }}>
                        <p style={{
                          fontSize: '1rem',
                          color: '#fff',
                          fontWeight: 'bold',
                          margin: 0,
                          wordBreak: 'break-word'
                        }}>
                          {currentTrackName || 'Загрузка...'}
                        </p>
                        {audioTracks.length > 0 && (
                          <p style={{
                            fontSize: '0.8rem',
                            color: '#aaa',
                            margin: '0.5rem 0 0 0'
                          }}>
                            Трек {currentTrackIndex + 1} из {audioTracks.length}
                          </p>
                        )}
                      </div>
                      <div style={{
                        display: 'flex',
                        gap: '1rem',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexWrap: 'wrap'
                      }}>
                        <button
                          onClick={togglePlayPause}
                          style={{
                            padding: '0.75rem 1.5rem',
                            fontSize: '1rem',
                            background: isPlaying ? 'rgba(255, 68, 68, 0.8)' : 'rgba(68, 255, 68, 0.8)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            transition: 'all 0.2s',
                            minWidth: '140px'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          {isPlaying ? '⏸ Пауза' : '▶ Воспроизвести'}
                        </button>
                        <button
                          onClick={nextTrack}
                          style={{
                            padding: '0.75rem 1.5rem',
                            fontSize: '1rem',
                            background: 'rgba(68, 68, 255, 0.8)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            transition: 'all 0.2s',
                            minWidth: '140px'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          ⏭ Следующий
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p style={{fontSize: '0.9rem', color: '#aaa', textAlign: 'center'}}>
                    Музыка не найдена
                  </p>
                )}
              </div>
            </div>
            
            {/* Карусель селфи */}
            {selfies.length > 0 && (
            <div className="selfie-carousel" style={{
              marginTop: '2rem',
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '2rem',
              borderRadius: '1rem',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <h3 style={{fontSize: '1.5rem', marginBottom: '1.5rem', textAlign: 'center'}}>📸 Селфи-миссия</h3>
              <div style={{
                position: 'relative',
                width: '400px',
                height: '400px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                perspective: '1000px'
              }}>
                {selfies.map((selfie, idx) => {
                  const isCenter = idx === currentSelfieIndex
                  const position = getSelfiePosition(idx, selfies.length, currentSelfieIndex)
                  
                  return (
                    <div
                      key={selfie.player_id || idx}
                      style={{
                        position: 'absolute',
                        width: isCenter ? '350px' : '250px',
                        height: isCenter ? '350px' : '250px',
                        transform: `
                          translateX(${position.x}px) 
                          translateY(${position.y}px) 
                          translateZ(${position.z}px)
                          scale(${isCenter ? 1 : 0.85})
                          rotateY(${position.rotateY}deg)
                        `,
                        transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                        opacity: isCenter ? 1 : 0.6,
                        zIndex: isCenter ? 10 : (selfies.length - Math.abs(idx - currentSelfieIndex)),
                        pointerEvents: 'none'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        width: '100%',
                        height: '100%'
                      }}>
                        <div style={{
                          background: 'rgba(255, 255, 255, 0.2)',
                          padding: '0.5rem',
                          borderRadius: '1rem',
                          width: '100%',
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          boxShadow: isCenter 
                            ? '0 10px 40px rgba(68, 255, 68, 0.3)' 
                            : '0 5px 20px rgba(0, 0, 0, 0.2)',
                          border: isCenter ? '3px solid rgba(68, 255, 68, 0.5)' : '2px solid rgba(255, 255, 255, 0.3)',
                          overflow: 'hidden'
                        }}>
                          <img 
                            src={selfie.image} 
                            alt={`Selfie from ${selfie.player_name}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              borderRadius: '0.5rem',
                              flex: 1
                            }}
                            onError={(e) => {
                              console.error('❌ Ошибка загрузки изображения:', selfie.image)
                              if (selfie.image_url && selfie.image_url !== selfie.image) {
                                e.target.src = selfie.image_url
                              } else {
                                e.target.style.display = 'none'
                                const placeholder = document.createElement('div')
                                placeholder.textContent = '📷'
                                placeholder.style.cssText = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 3rem; color: #aaa;'
                                e.target.parentNode.appendChild(placeholder)
                              }
                            }}
                            onLoad={() => {
                              if (isCenter) {
                                console.log('✅ Центральное изображение загружено:', selfie.image)
                              }
                            }}
                          />
                        </div>
                        {/* Информация под фоткой */}
                        <div style={{
                          padding: '0.75rem',
                          textAlign: 'center',
                          background: isCenter ? 'rgba(68, 255, 68, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                          borderRadius: '0.5rem',
                          marginTop: '0.5rem'
                        }}>
                          <div style={{
                            fontSize: isCenter ? '1.1rem' : '0.9rem',
                            fontWeight: 'bold',
                            color: '#fff',
                            marginBottom: '0.5rem'
                          }}>
                            {selfie.player_name}
                          </div>
                          <div style={{
                            fontSize: isCenter ? '1rem' : '0.8rem',
                            color: isCenter ? '#44ff44' : '#aaa',
                            fontWeight: isCenter ? 'bold' : 'normal',
                            padding: isCenter ? '0.5rem' : '0.25rem',
                            background: isCenter ? 'rgba(68, 255, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '0.5rem',
                            border: isCenter ? '2px solid rgba(68, 255, 68, 0.5)' : '1px solid rgba(255, 255, 255, 0.2)'
                          }}>
                            📸 Задание: {selfie.task}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {gameStatus === 'finished' && (
        <div className="tv-finish-screen">
          <h2>🎉 Игра завершена!</h2>
          <div className="final-leaderboard">
            <h3>Финальный рейтинг</h3>
            {leaderboard.slice(0, 3).map((entry, idx) => (
              <div key={entry.player_id} className={`podium rank-${idx + 1}`}>
                <div className="podium-medal">
                  {idx === 0 && '🥇'}
                  {idx === 1 && '🥈'}
                  {idx === 2 && '🥉'}
                </div>
                <div className="podium-name">{entry.name}</div>
                <div className="podium-score">{entry.final_score} очков</div>
              </div>
            ))}
          </div>
          <div className="full-leaderboard">
            {leaderboard.map((entry, idx) => (
              <div key={entry.player_id} className="leaderboard-entry">
                <span className="rank">#{entry.rank}</span>
                <span className="name">{entry.name}</span>
                <span className="score">{entry.final_score} очков</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default TVScreen

