import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { SessionWebSocket } from '../utils/websocket'
import { getSessionState, joinSession, submitProgress } from '../utils/api'
import { getDeviceUuid, getPlayerToken, setPlayerToken, setSessionCode, getSessionCode, clearPlayerData, saveGameState, getGameState, clearGameState } from '../utils/storage'
import GreenLevel from '../games/green/GreenLevel'
import FindCorrect from '../games/green/FindCorrect'
import TapBattle from '../games/green/TapBattle'
import TrueOrFalse from '../games/yellow/TrueOrFalse'
import Charades from '../games/yellow/Charades'
import FindToy from '../games/yellow/FindToy'
import CatchGame from '../games/red/CatchGame'
import Cipher from '../games/red/Cipher'
import Simon from '../games/red/Simon'
import BonusLevelIntro from '../games/bonus/BonusLevelIntro'
import CatchGifts from '../games/bonus/CatchGifts'
import Snowballs from '../games/bonus/Snowballs'
import Roulette from '../games/bonus/Roulette'
import SelfieMission from '../games/bonus/SelfieMission'
import './PlayerScreen.css'

function PlayerScreen() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionCodeParam = searchParams.get('session')
  
  const [session, setSession] = useState(null)
  const [player, setPlayer] = useState(null)
  const [playerName, setPlayerName] = useState('')
  const [isJoined, setIsJoined] = useState(false)
  const [currentLevel, setCurrentLevel] = useState(null)
  const [currentGreenGame, setCurrentGreenGame] = useState(0) // 0 = начало, 1 = игра 1, 2 = игра 2, 3 = игра 3, 4 = результаты
  const [currentYellowGame, setCurrentYellowGame] = useState(0) // 0 = начало, 1 = правда/ложь, 2 = шарады, 3 = найди игрушку
  const [currentRedGame, setCurrentRedGame] = useState(0) // 0 = начало, 1 = реакция и ловля, 2 = шифровка, 3 = саймон
  const [redGame1Score, setRedGame1Score] = useState(null) // Результат первой игры красного уровня
  const [greenTotalScore, setGreenTotalScore] = useState(0) // Общий счет зеленого уровня
  const [yellowTotalScore, setYellowTotalScore] = useState(0) // Общий счет желтого уровня
  const [redTotalScore, setRedTotalScore] = useState(0) // Общий счет красного уровня
  const [bonusGameActive, setBonusGameActive] = useState(false) // Активна ли бонусная игра
  const [bonusGameType, setBonusGameType] = useState(null) // Тип бонусной игры
  const [bonusGameIntroShown, setBonusGameIntroShown] = useState(false) // Показан ли интро бонусной игры
  const [playedBonusGames, setPlayedBonusGames] = useState(new Set()) // Уже сыгранные бонусные игры
  const [showFireworks, setShowFireworks] = useState(false) // Показать фейерверк после уровня
  const [gameStatus, setGameStatus] = useState('pending')
  const [error, setError] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [playersList, setPlayersList] = useState([]) // Список всех игроков
  const [balanceNotices, setBalanceNotices] = useState([])
  
  const wsRef = useRef(null)
  const deviceUuid = useRef(getDeviceUuid())

  const pushBalanceNotice = (notice) => {
    const id = `${Date.now()}-${Math.random()}`
    setBalanceNotices((prev) => [...prev, { id, ...notice }])
    setTimeout(() => {
      setBalanceNotices((prev) => prev.filter((n) => n.id !== id))
    }, 5000)
  }

  const renderBalanceToasts = () => {
    if (!balanceNotices.length) return null
    return (
      <div style={{position: 'fixed', top: '0.75rem', right: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 3000}}>
        {balanceNotices.map((n) => {
          const isGain = (n.amount || 0) >= 0
          return (
            <div key={n.id} style={{
              minWidth: '240px',
              padding: '0.75rem 1rem',
              borderRadius: '0.75rem',
              background: isGain ? 'rgba(34,197,94,0.15)' : 'rgba(248,113,113,0.15)',
              border: `1px solid ${isGain ? 'rgba(34,197,94,0.5)' : 'rgba(248,113,113,0.5)'}`,
              boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
              color: '#e2e8f0'
            }}>
              <div style={{fontWeight: 700, fontSize: '1.05rem', color: isGain ? '#4ade80' : '#f87171'}}>
                {isGain ? 'Баллы начислены' : 'Баллы списаны'}: {n.amount > 0 ? `+${n.amount}` : n.amount}
              </div>
              <div style={{fontSize: '0.9rem', color: '#cbd5e1', marginTop: '0.25rem'}}>
                {n.reason || 'Причина не указана'}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Функция для восстановления сессии
  const restoreSession = async () => {
    try {
      const savedToken = getPlayerToken()
      const savedGameState = getGameState()
      const savedCode = getSessionCode()
      
      if (!savedCode) {
        console.log('❌ Нет сохраненного кода сессии')
        return false
      }
      
      console.log('🔄 Восстанавливаем сессию после возврата из фонового режима...')
      
      // Инициализируем сессию
      await initializeSession(savedCode)
      
      if (savedToken && savedGameState) {
        // Восстанавливаем данные игрока
        if (savedGameState.playerName && savedGameState.playerId) {
          setPlayer({
            id: savedGameState.playerId,
            name: savedGameState.playerName,
            token: savedToken,
            status: 'ready'
          })
          setIsJoined(true)
          console.log('✅ Данные игрока восстановлены')
        }
        
        // Восстанавливаем статус игры
        if (savedGameState.gameStatus) {
          setGameStatus(savedGameState.gameStatus)
        }
        
          // Восстанавливаем уровень и прогресс
          if (savedGameState.currentLevel) {
            setCurrentLevel(savedGameState.currentLevel)
          }
          if (savedGameState.currentGreenGame !== undefined) {
            setCurrentGreenGame(savedGameState.currentGreenGame)
          }
          if (savedGameState.currentYellowGame !== undefined) {
            setCurrentYellowGame(savedGameState.currentYellowGame)
          }
          if (savedGameState.currentRedGame !== undefined) {
            setCurrentRedGame(savedGameState.currentRedGame)
          }
          
          // Восстанавливаем сыгранные бонусные игры
          if (savedGameState.playedBonusGames && Array.isArray(savedGameState.playedBonusGames)) {
            setPlayedBonusGames(new Set(savedGameState.playedBonusGames))
          }
        
        // Подключаемся к WebSocket
        connectWebSocket(savedCode)
        
        console.log('✅ Сессия восстановлена успешно')
        return true
      }
      
      return false
    } catch (err) {
      console.error('❌ Ошибка восстановления сессии:', err)
      return false
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        let code = sessionCodeParam
        
        // Приоритет: параметр URL > сохранённый код
        if (code) {
          setSessionCode(code)
          localStorage.setItem('session_code', code)
        } else {
          const savedCode = localStorage.getItem('session_code')
          if (savedCode) {
            code = savedCode
            setSessionCode(savedCode)
          } else {
            setError('Код сессии не указан. Отсканируйте QR-код с ТВ.')
            return
          }
        }
        
        await initializeSession(code)
        
        // Проверяем сохранённый токен и состояние игры
        const savedToken = getPlayerToken()
        const savedGameState = getGameState()
        
        if (savedToken && savedGameState) {
          // Восстанавливаем состояние игры
          console.log('🔄 Восстанавливаем состояние игры из localStorage:', savedGameState)
          
          // Восстанавливаем данные игрока если они есть
          if (savedGameState.playerName && savedGameState.playerId) {
            setPlayer({
              id: savedGameState.playerId,
              name: savedGameState.playerName,
              token: savedToken,
              status: 'ready'
            })
            setIsJoined(true)
          }
          
          // Восстанавливаем статус игры
          if (savedGameState.gameStatus) {
            setGameStatus(savedGameState.gameStatus)
          }
          
          console.log('Found saved token and game state, waiting for player data from WebSocket')
        } else if (savedToken) {
          // Если есть только токен, но нет состояния
          console.log('Found saved token, waiting for player data from WebSocket')
        }
      } catch (err) {
        console.error('Error in useEffect:', err)
        // Не показываем ошибку пользователю
      }
    }
    
    init()
    
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect()
      }
    }
  }, [sessionCodeParam])

  // Обработка возврата из фонового режима (затемнение экрана, сворачивание браузера)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('📱 Страница стала видимой, восстанавливаем сессию...')
        // Небольшая задержка, чтобы браузер успел восстановить соединения
        setTimeout(() => {
          restoreSession()
        }, 500)
      }
    }

    const handleFocus = () => {
      console.log('📱 Окно получило фокус, восстанавливаем сессию...')
      setTimeout(() => {
        restoreSession()
      }, 500)
    }

    const handlePageshow = (event) => {
      // Обработка восстановления из кэша браузера (back/forward navigation)
      if (event.persisted) {
        console.log('📱 Страница восстановлена из кэша, восстанавливаем сессию...')
        setTimeout(() => {
          restoreSession()
        }, 500)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handlePageshow)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageshow)
    }
  }, [])

  const initializeSession = async (code) => {
    try {
      setError(null)
      const sessionData = await getSessionState(code)
      setSession(sessionData)
      setGameStatus(sessionData.status)
      
      // Подключаемся к WebSocket для всех статусов, чтобы получать обновления
      connectWebSocket(code)
    } catch (err) {
      console.error('Error initializing session:', err)
      // Не показываем ошибку пользователю, просто логируем
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
      () => setWsConnected(false)
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
        // После подключения WebSocket восстанавливаем состояние если нужно
        const savedState = getGameState()
        if (savedState && savedState.playerToken === getPlayerToken()) {
          // Восстанавливаем данные игрока из сохраненного состояния
          if (!player && savedState.playerName && savedState.playerId) {
            setPlayer({
              id: savedState.playerId,
              name: savedState.playerName,
              token: savedState.playerToken,
              status: 'ready'
            })
            setIsJoined(true)
          }
        }
        break
      case 'error':
        console.error('WebSocket error:', data.payload)
        setError(data.payload.message || 'Ошибка WebSocket')
        setWsConnected(false)
        break
      case 'session.state':
        setGameStatus(data.payload.status)
        // Если игра началась и игрок зарегистрирован, сбрасываем currentLevel чтобы показать экран начала
        if (data.payload.status === 'active' && isJoined) {
          if (!currentLevel || currentLevel === 'none') {
            setCurrentLevel(null) // Сбрасываем, чтобы показать экран начала уровня
          }
          if (!wsConnected) {
            connectWebSocket(session.code)
          }
        }
        // Обновляем сессию для получения started_at
        if (data.payload.started_at && session) {
          setSession({ ...session, started_at: data.payload.started_at })
        }
        break
      case 'players.list':
        setPlayersList(data.payload.players || [])
        // Проверяем, есть ли наш игрок в списке (по токену)
        const savedToken = getPlayerToken()
        if (savedToken && !player && data.payload.players) {
          // Ищем игрока в списке - но у нас нет ID, только токен
          // Лучше не устанавливать isJoined автоматически, пусть пользователь войдёт заново
        }
        break
      case 'player.update':
        if (data.payload.player.id === player?.id) {
          setPlayer(data.payload.player)
          const newLevel = data.payload.player.current_level
          
          // Обновляем уровень игрока из сервера
          if (newLevel && newLevel !== 'none') {
            setCurrentLevel(newLevel)
            // Сохраняем актуальный уровень
            if (session && player) {
              saveGameState({
                sessionCode: session.code,
                playerToken: player.token,
                playerName: player.name,
                playerId: player.id,
                isJoined: true,
                gameStatus: gameStatus,
                currentLevel: newLevel,
                currentGreenGame: currentGreenGame,
                currentYellowGame: currentYellowGame,
                currentRedGame: currentRedGame,
                playedBonusGames: Array.from(playedBonusGames)
              })
            }
          } else if (!currentLevel || currentLevel === 'none') {
            setCurrentLevel(newLevel || 'green')
          }
        }
        break
      case 'player.balance_update':
        if (player && data.payload.player_id === player.id) {
          pushBalanceNotice({
            amount: data.payload.amount,
            reason: data.payload.reason || 'Причина не указана',
          })
        }
        break
      case 'game.event':
        console.log('Game event:', data.payload)
        break
      default:
        break
    }
  }

  const handleWebSocketError = (error) => {
    console.error('WebSocket error:', error)
    setError('Ошибка подключения к серверу')
  }

  const handleExitSession = () => {
    // Очищаем данные игрока
    clearPlayerData()
    clearGameState()
    // Отключаемся от WebSocket
    if (wsRef.current) {
      wsRef.current.disconnect()
    }
    // Перенаправляем на страницу без сессии
    navigate('/play')
  }

  const handleJoin = async () => {
    if (!playerName.trim() || playerName.trim().length < 2) {
      // Не показываем ошибку пользователю, просто не делаем ничего
      return
    }
    
    if (!session) {
      // Не показываем ошибку пользователю
      return
    }

    try {
      setError(null) // Очищаем ошибки перед запросом
      console.log('Joining session:', session.code, playerName.trim())
      const playerData = await joinSession(session.code, playerName.trim(), deviceUuid.current)
      console.log('Player data received:', playerData)
      
      // Обновляем данные сессии, чтобы получить актуальный статус
      const updatedSession = await getSessionState(session.code)
      setSession(updatedSession)
      setGameStatus(updatedSession.status)
      
      // Сохраняем данные игрока
      setPlayer(playerData)
      setPlayerToken(playerData.token)
      setIsJoined(true) // Это должно переключить на экран ожидания
      
      // Сохраняем код сессии
      setSessionCode(session.code)
      
      // Подключаемся к WebSocket для получения обновлений
      connectWebSocket(session.code)
      
      console.log('Player joined successfully, isJoined set to true, gameStatus:', updatedSession.status)
    } catch (err) {
      // Не показываем ошибку пользователю, просто логируем
      console.error('Error joining session:', err)
      // Можно показать мягкое сообщение, но не техническую ошибку
    }
  }

  const handleStartLevel = () => {
    if (!player) return
    const nextLevel = player.current_level === 'none' ? 'green' : player.current_level
    setCurrentLevel(nextLevel)
  }

  // Функция для запуска бонусной игры (только те, которые еще не играли)
  const maybeTriggerBonusGame = (forceSelfie = false) => {
    const allBonusTypes = ['gifts', 'snowballs', 'roulette', 'selfie']
    const availableTypes = allBonusTypes.filter(type => !playedBonusGames.has(type))
    
    // Если это зеленый уровень и селфи еще не играли - 100% селфи
    if (forceSelfie && currentLevel === 'green' && !playedBonusGames.has('selfie')) {
      const newPlayedSet = new Set(playedBonusGames).add('selfie')
      setPlayedBonusGames(newPlayedSet)
      setBonusGameType('selfie')
      setBonusGameActive(true)
      setBonusGameIntroShown(false)
      
      // Сохраняем в состояние игры
      if (session) {
        saveGameState({
          sessionCode: session.code,
          playerToken: player?.token,
          playerName: player?.name,
          playerId: player?.id,
          isJoined: true,
          gameStatus: gameStatus,
          currentLevel: currentLevel,
          currentGreenGame: currentGreenGame,
          currentYellowGame: currentYellowGame,
          currentRedGame: currentRedGame,
          playedBonusGames: Array.from(newPlayedSet)
        })
      }
      
      console.log('🎉 Бонусная игра активирована (гарантированно): selfie')
      return true
    }
    
    // Если есть доступные игры, выбираем случайную
    if (availableTypes.length > 0 && Math.random() < 0.5) {
      const randomType = availableTypes[Math.floor(Math.random() * availableTypes.length)]
      const newPlayedSet = new Set(playedBonusGames).add(randomType)
      setPlayedBonusGames(newPlayedSet)
      setBonusGameType(randomType)
      setBonusGameActive(true)
      setBonusGameIntroShown(false)
      
      // Сохраняем в состояние игры
      if (session) {
        saveGameState({
          sessionCode: session.code,
          playerToken: player?.token,
          playerName: player?.name,
          playerId: player?.id,
          isJoined: true,
          gameStatus: gameStatus,
          currentLevel: currentLevel,
          currentGreenGame: currentGreenGame,
          currentYellowGame: currentYellowGame,
          currentRedGame: currentRedGame,
          playedBonusGames: Array.from(newPlayedSet)
        })
      }
      
      console.log('🎉 Бонусная игра активирована:', randomType)
      return true
    }
    return false
  }

  const handleBonusGameComplete = async (score, timeSpentMs, details = {}) => {
    console.log('🎮 handleBonusGameComplete вызван', { score, timeSpentMs, details, player: !!player })
    if (!player) {
      console.error('❌ Нет данных игрока')
      return
    }
    
    try {
      console.log('📤 Отправляем прогресс бонусной игры...')
      await submitProgress(
        player.token,
        'bonus',
        score,
        timeSpentMs,
        { ...details, bonus_game: true },
        true  // is_minigame = true для бонусных игр
      )
      console.log('✅ Прогресс бонусной игры отправлен')
      
      // Селфи уже отправлено через API, событие придет через WebSocket от сервера
      
      setBonusGameActive(false)
      setBonusGameType(null)
      setBonusGameIntroShown(false)
      // Показываем фейерверк
      setShowFireworks(true)
      setTimeout(() => setShowFireworks(false), 3000)
      
      // НЕ меняем currentLevel - остаемся на текущем уровне
      // Игра продолжается с того места, где была прервана бонусной игрой
      
      // Сохраняем состояние после завершения бонусной игры
      if (session && player) {
        // Получаем актуальный уровень игрока с сервера
        try {
          const sessionData = await getSessionState(session.code)
          const updatedPlayer = sessionData.players?.find(p => p.id === player.id)
          const actualLevel = updatedPlayer?.current_level || currentLevel || 'green'
          
          saveGameState({
            sessionCode: session.code,
            playerToken: player.token,
            playerName: player.name,
            playerId: player.id,
            isJoined: true,
            gameStatus: gameStatus,
            currentLevel: actualLevel,
            currentGreenGame: currentGreenGame,
            currentYellowGame: currentYellowGame,
            currentRedGame: currentRedGame,
            playedBonusGames: Array.from(playedBonusGames) // Сохраняем сыгранные бонусные игры
          })
          
          // Обновляем локальное состояние уровня
          if (actualLevel !== currentLevel) {
            setCurrentLevel(actualLevel)
          }
        } catch (err) {
          console.error('❌ Ошибка получения состояния сессии:', err)
          // Сохраняем с текущим уровнем
          saveGameState({
            sessionCode: session.code,
            playerToken: player.token,
            playerName: player.name,
            playerId: player.id,
            isJoined: true,
            gameStatus: gameStatus,
            currentLevel: currentLevel || 'green',
            currentGreenGame: currentGreenGame,
            currentYellowGame: currentYellowGame,
            currentRedGame: currentRedGame,
            playedBonusGames: Array.from(playedBonusGames)
          })
        }
      }
      
      console.log('✅ Бонусная игра завершена, возвращаемся к основному уровню')
    } catch (err) {
      console.error('❌ Ошибка отправки прогресса бонусной игры:', err)
      // Даже при ошибке закрываем бонусную игру
      setBonusGameActive(false)
      setBonusGameType(null)
      setBonusGameIntroShown(false)
      alert(`Ошибка: ${err.message}`)
    }
  }

  const handleLevelComplete = async (score, timeSpentMs, details = {}) => {
    if (!player) return
    
    try {
      // Проверяем, не активна ли бонусная игра
      if (bonusGameActive) {
        return // Игнорируем завершение уровня, если идет бонусная игра
      }
      // Если это красный уровень, обрабатываем последовательность игр
      if (currentLevel === 'red') {
        if (currentRedGame === 1) {
          // Игра 1 завершена, сохраняем результат и показываем экран результатов
          await submitProgress(
            player.token,
            'red',
            score,
            timeSpentMs,
            { ...details, game: 1 },
            false
          )
          setRedGame1Score(score)
          // Показываем экран результатов (currentRedGame остается 1, но будет проверка на redGame1Score)
          return
        } else if (currentRedGame === 2) {
          // Игра 2 завершена, переходим к игре 3
          setRedTotalScore(prev => prev + score)
          await submitProgress(
            player.token,
            'red',
            score,
            timeSpentMs,
            { ...details, game: 2 },
            false
          )
          setCurrentRedGame(3)
          // Сохраняем состояние
          if (session && player) {
            saveGameState({
              sessionCode: session.code,
              playerToken: player.token,
              playerName: player.name,
              playerId: player.id,
              isJoined: true,
              gameStatus: gameStatus,
              currentLevel: 'red',
              currentGreenGame: currentGreenGame,
              currentYellowGame: currentYellowGame,
              currentRedGame: 3,
              playedBonusGames: Array.from(playedBonusGames)
            })
          }
          // Проверяем бонусную игру
          if (maybeTriggerBonusGame()) {
            return
          }
          return
        } else if (currentRedGame === 3) {
          // Игра 3 завершена - показываем экран результатов
          setRedTotalScore(prev => prev + score)
          await submitProgress(
            player.token,
            'red',
            score,
            timeSpentMs,
            { ...details, game: 3 },
            false
          )
          // Показываем фейерверк
          setShowFireworks(true)
          setTimeout(() => setShowFireworks(false), 3000)
          // Показываем экран результатов красного уровня
          setCurrentRedGame(4)
          // Сохраняем состояние после завершения красного уровня
          saveGameState({
            sessionCode: session?.code,
            playerToken: player.token,
            playerName: player.name,
            playerId: player.id,
            isJoined: true,
            gameStatus: gameStatus,
            currentLevel: 'red',
            currentRedGame: 4,
            redTotalScore: redTotalScore + score
          })
          return
          // Показываем фейерверк
          setShowFireworks(true)
          setTimeout(() => setShowFireworks(false), 3000)
          // Проверяем бонусную игру
          if (maybeTriggerBonusGame()) {
            return
          }
          // Показываем экран результатов красного уровня
          setCurrentRedGame(4)
          // Сохраняем состояние после завершения красного уровня
          saveGameState({
            sessionCode: session?.code,
            playerToken: player.token,
            playerName: player.name,
            playerId: player.id,
            isJoined: true,
            gameStatus: gameStatus,
            currentLevel: 'red',
            currentRedGame: 4,
            redTotalScore: redTotalScore + score
          })
          return
        }
      }
      
      // Если это жёлтый уровень, обрабатываем последовательность игр
      if (currentLevel === 'yellow') {
        if (currentYellowGame === 1) {
          // Игра 1 завершена, переходим к игре 2
          await submitProgress(
            player.token,
            'yellow',
            score,
            timeSpentMs,
            { ...details, game: 1 },
            false
          )
          setCurrentYellowGame(2)
          // Сохраняем состояние
          if (session && player) {
            saveGameState({
              sessionCode: session.code,
              playerToken: player.token,
              playerName: player.name,
              playerId: player.id,
              isJoined: true,
              gameStatus: gameStatus,
              currentLevel: 'yellow',
              currentGreenGame: currentGreenGame,
              currentYellowGame: 2,
              currentRedGame: currentRedGame,
              playedBonusGames: Array.from(playedBonusGames)
            })
          }
          // Проверяем бонусную игру
          if (maybeTriggerBonusGame()) {
            return
          }
          return
        } else if (currentYellowGame === 2) {
          // Игра 2 завершена, переходим к игре 3
          setYellowTotalScore(prev => prev + score)
          await submitProgress(
            player.token,
            'yellow',
            score,
            timeSpentMs,
            { ...details, game: 2 },
            false
          )
          setCurrentYellowGame(3)
          // Сохраняем состояние
          if (session && player) {
            saveGameState({
              sessionCode: session.code,
              playerToken: player.token,
              playerName: player.name,
              playerId: player.id,
              isJoined: true,
              gameStatus: gameStatus,
              currentLevel: 'yellow',
              currentGreenGame: currentGreenGame,
              currentYellowGame: 3,
              currentRedGame: currentRedGame,
              playedBonusGames: Array.from(playedBonusGames)
            })
          }
          // Проверяем бонусную игру
          if (maybeTriggerBonusGame()) {
            return
          }
          return
        } else if (currentYellowGame === 3) {
          // Игра 3 завершена
          setYellowTotalScore(prev => prev + score)
          await submitProgress(
            player.token,
            'yellow',
            score,
            timeSpentMs,
            { ...details, game: 3 },
            false
          )
          // Показываем фейерверк
          setShowFireworks(true)
          setTimeout(() => setShowFireworks(false), 3000)
          // Проверяем бонусную игру
          if (maybeTriggerBonusGame()) {
            return
          }
          // Показываем экран результатов желтого уровня
          setCurrentYellowGame(4)
          // Сохраняем состояние после завершения желтого уровня
          saveGameState({
            sessionCode: session?.code,
            playerToken: player.token,
            playerName: player.name,
            playerId: player.id,
            isJoined: true,
            gameStatus: gameStatus,
            currentLevel: 'yellow',
            currentYellowGame: 4,
            yellowTotalScore: yellowTotalScore + score
          })
          return
          // Сохраняем состояние при переходе на новый уровень
          if (session && player) {
            saveGameState({
              sessionCode: session.code,
              playerToken: player.token,
              playerName: player.name,
              playerId: player.id,
              isJoined: true,
              gameStatus: gameStatus,
              currentLevel: 'red',
              currentGreenGame: currentGreenGame,
              currentYellowGame: 0,
              currentRedGame: 0,
              playedBonusGames: Array.from(playedBonusGames)
            })
          }
          return
        }
      }
      
      // Если это зелёный уровень, обрабатываем последовательность игр
      if (currentLevel === 'green') {
        if (currentGreenGame === 1) {
          // Игра 1 завершена, переходим к игре 2
          setGreenTotalScore(prev => prev + score)
          await submitProgress(
            player.token,
            'green',
            score,
            timeSpentMs,
            { ...details, game: 1 },
            false
          )
          setCurrentGreenGame(2)
          // Проверяем бонусную игру
          if (maybeTriggerBonusGame()) {
            return
          }
          return
        } else if (currentGreenGame === 2) {
          // Игра 2 завершена, переходим к игре 3
          setGreenTotalScore(prev => prev + score)
          await submitProgress(
            player.token,
            'green',
            score,
            timeSpentMs,
            { ...details, game: 2 },
            false
          )
          setCurrentGreenGame(3)
          // Сохраняем состояние
          if (session && player) {
            saveGameState({
              sessionCode: session.code,
              playerToken: player.token,
              playerName: player.name,
              playerId: player.id,
              isJoined: true,
              gameStatus: gameStatus,
              currentLevel: 'green',
              currentGreenGame: 3,
              currentYellowGame: currentYellowGame,
              currentRedGame: currentRedGame,
              playedBonusGames: Array.from(playedBonusGames)
            })
          }
          // Проверяем бонусную игру (гарантированно селфи, если еще не играли)
          if (maybeTriggerBonusGame(true)) {
            return
          }
          return
        } else if (currentGreenGame === 3) {
          // Игра 3 завершена, показываем страницу результатов
          setGreenTotalScore(prev => prev + score)
          await submitProgress(
            player.token,
            'green',
            score,
            timeSpentMs,
            { ...details, game: 3 },
            false
          )
          // Показываем фейерверк
          setShowFireworks(true)
          setTimeout(() => setShowFireworks(false), 3000)
          // Проверяем бонусную игру перед переходом к результатам (гарантированно селфи, если еще не играли)
          if (maybeTriggerBonusGame(true)) {
            return
          }
          // Показываем экран результатов зеленого уровня
          setCurrentGreenGame(4)
          // Сохраняем состояние после завершения зеленого уровня
          saveGameState({
            sessionCode: session?.code,
            playerToken: player.token,
            playerName: player.name,
            playerId: player.id,
            isJoined: true,
            gameStatus: gameStatus,
            currentLevel: 'green',
            currentGreenGame: 4,
            greenTotalScore: greenTotalScore + score
          })
          return
        }
      }
      
      // Для других уровней или финального завершения зеленого
      await submitProgress(
        player.token,
        currentLevel,
        score,
        timeSpentMs,
        details,
        false
      )
      // Обновление произойдёт через WebSocket
      // Определяем следующий уровень
      const levelOrder = ['green', 'yellow', 'red']
      const currentIndex = levelOrder.indexOf(currentLevel)
      if (currentIndex < levelOrder.length - 1) {
        // Есть следующий уровень - сбрасываем currentLevel, чтобы показать экран начала следующего уровня
        setCurrentLevel(null)
        // Обновим player.current_level через WebSocket, но пока оставим null для показа экрана правил
      } else {
        // Все уровни пройдены
        setCurrentLevel(null)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const toastLayer = renderBalanceToasts()

  if (error && !session) {
    return (
      <>
        {toastLayer}
        <div className="player-screen error">
          <h1>Ошибка</h1>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Обновить страницу</button>
        </div>
      </>
    )
  }

  if (!session) {
    return (
      <>
        {toastLayer}
        <div className="player-screen loading">
          <h1>Загрузка...</h1>
          <p>Подключение к серверу...</p>
          {error && <p className="error-message">Ошибка: {error}</p>}
        </div>
      </>
    )
  }

  if (!isJoined) {
    return (
      <>
        {toastLayer}
        <div className="player-screen join-screen">
          <div style={{position: 'fixed', top: '0.5rem', right: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', zIndex: 1000}}>
            <div style={{background: 'rgba(0, 0, 0, 0.7)', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontSize: '0.85rem', maxWidth: '150px', textAlign: 'right'}}>
              Код: <strong style={{color: '#44ff44'}}>{session?.code || 'неизвестен'}</strong>
            </div>
            <button 
              onClick={handleExitSession}
              style={{
                background: 'rgba(255, 68, 68, 0.8)',
                color: 'white',
                border: 'none',
                padding: '0.4rem 0.8rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              Выйти
            </button>
          </div>
          <div style={{paddingTop: '4rem'}}>
            <h1>🎄 Арена снежных вечеринок</h1>
          <div className="join-form">
            <h2>Введите ваше имя</h2>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Ваше имя"
              maxLength={50}
              onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
              autoFocus
            />
            <button onClick={handleJoin} disabled={!playerName.trim() || playerName.trim().length < 2}>
              Войти
            </button>
            {playerName.trim().length > 0 && playerName.trim().length < 2 && (
              <p style={{color: '#ffaa00', fontSize: '0.9rem', marginTop: '0.5rem'}}>
                Имя должно содержать минимум 2 символа
              </p>
            )}
            <p className="session-info">Сессия: {session?.code || 'неизвестна'}</p>
          </div>
          </div>
        </div>
      </>
    )
  }

  // Экран ожидания показывается только если игрок зарегистрирован и игра не началась
  // Также проверяем, что есть данные игрока
  if (gameStatus === 'pending' && isJoined && player) {
    // Отладочный лог
    console.log('Rendering waiting screen - isJoined:', isJoined, 'gameStatus:', gameStatus, 'player:', player?.name)
    return (
      <>
        {toastLayer}
        <div className="player-screen waiting-screen">
        <div style={{position: 'fixed', top: '0.5rem', right: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', zIndex: 1000}}>
          <div style={{background: 'rgba(0, 0, 0, 0.7)', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontSize: '0.85rem', maxWidth: '150px', textAlign: 'right'}}>
            Код: <strong style={{color: '#44ff44'}}>{session?.code || 'неизвестен'}</strong>
          </div>
          <button 
            onClick={handleExitSession}
            style={{
              background: 'rgba(255, 68, 68, 0.8)',
              color: 'white',
              border: 'none',
              padding: '0.4rem 0.8rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            Выйти
          </button>
        </div>
        <div style={{paddingTop: '4rem'}}>
          <h1>🎄 Ожидание начала игры</h1>
        <p>Сессия: <strong>{session?.code || 'неизвестна'}</strong></p>
        
        {player ? (
          <div className="player-info-waiting" style={{
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '1.5rem',
            borderRadius: '1rem',
            margin: '1.5rem 0'
          }}>
            <p style={{fontSize: '1.3rem', marginBottom: '0.5rem'}}>
              Вы вошли как: <strong style={{color: '#44ff44'}}>{player.name}</strong>
            </p>
            <p style={{color: '#44ff44', fontSize: '1.2rem', marginTop: '1rem'}}>
              ✓ Вы готовы к игре!
            </p>
          </div>
        ) : (
          <div style={{padding: '1rem', textAlign: 'center'}}>
            <p>Загрузка данных игрока...</p>
          </div>
        )}

        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          padding: '1.5rem',
          borderRadius: '1rem',
          margin: '1.5rem 0'
        }}>
          <h2 style={{fontSize: '1.3rem', marginBottom: '1rem'}}>Игроки ({playersList.length})</h2>
          <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
            {playersList.map(p => (
              <div key={p.id} style={{
                padding: '0.75rem',
                background: p.id === player?.id ? 'rgba(68, 255, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                borderRadius: '0.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{p.name}</span>
                <span style={{color: '#44ff44'}}>✓ Готов</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          padding: '1.5rem',
          borderRadius: '1rem',
          margin: '1.5rem 0'
        }}>
          <h2 style={{fontSize: '1.2rem', marginBottom: '1rem'}}>📋 Правила игры</h2>
          <div style={{textAlign: 'left', fontSize: '0.95rem', lineHeight: '1.6'}}>
            <p>🎮 Вас ждёт игра из 3 этапов:</p>
            <ul style={{marginLeft: '1.5rem', marginTop: '0.5rem'}}>
              <li>🟢 <strong>Зелёный уровень</strong> - 1 балл за задание</li>
              <li>🟡 <strong>Жёлтый уровень</strong> - 5 баллов за задание</li>
              <li>🔴 <strong>Красный уровень</strong> - 10 баллов за задание</li>
            </ul>
            <p style={{marginTop: '1rem'}}>🎁 Также будут попадаться <strong>бонусные уровни</strong> за которые вы получите <strong>15 баллов</strong>!</p>
            <p style={{marginTop: '1rem', color: '#ffaa00'}}>⏳ Игра начнётся, когда ведущий нажмёт "Начать игру" на ТВ</p>
          </div>
        </div>

        <div className={`connection-status ${wsConnected ? 'connected' : 'disconnected'}`} style={{marginTop: '1rem'}}>
          {wsConnected ? '✓ Подключено' : '✗ Отключено'}
        </div>
        </div>
      </div>
      </>
    )
  }

  if (gameStatus === 'active') {
    if (!player) {
      return (
        <>
          {toastLayer}
          <div className="player-screen loading">
            <h1>Загрузка данных игрока...</h1>
            <p>Пожалуйста, подождите</p>
          </div>
        </>
      )
    }
    
    // Если уровень не установлен, показываем экран начала уровня
    if (!currentLevel || currentLevel === 'none') {
      // Определяем, какой уровень показывать
      const levelOrder = ['green', 'yellow', 'red']
      let nextLevel = 'green'
      let levelInfo = {
        name: 'Зелёный уровень',
        emoji: '🟢',
        description: 'Перемешанные слова - соберите новогодние слова из букв',
        points: '1 балл',
        pointsPer: 'за каждое слово'
      }
      
      // Если игрок уже прошёл уровни, определяем следующий
      if (player.current_level && player.current_level !== 'none') {
        const currentIndex = levelOrder.indexOf(player.current_level)
        if (currentIndex < levelOrder.length - 1) {
          nextLevel = levelOrder[currentIndex + 1]
          if (nextLevel === 'yellow') {
            levelInfo = {
              name: 'Жёлтый уровень',
              emoji: '🟡',
              description: 'Угадай мелодию, пазл, правда/ложь - новогодние факты',
              points: '5 баллов',
              pointsPer: 'за задание'
            }
          } else if (nextLevel === 'red') {
            levelInfo = {
              name: 'Красный уровень',
              emoji: '🔴',
              description: 'Реакция и ловля, шифровка, Саймон - сложные задания',
              points: '10 баллов',
              pointsPer: 'за задание'
            }
          }
        } else {
          // Все уровни пройдены
          return (
            <>
              {toastLayer}
              <div className="player-screen level-start">
                <div style={{position: 'absolute', top: '1rem', right: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', zIndex: 1000}}>
                  <div style={{background: 'rgba(0, 0, 0, 0.7)', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontSize: '0.85rem', maxWidth: '150px', textAlign: 'right'}}>
                    Код: <strong style={{color: '#44ff44'}}>{session?.code || 'неизвестен'}</strong>
                  </div>
                  <button 
                    onClick={handleExitSession}
                    style={{
                      background: 'rgba(255, 68, 68, 0.8)',
                      color: 'white',
                      border: 'none',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    Выйти
                  </button>
                </div>
                <div style={{paddingTop: '4rem'}}>
                  <h1>🎉 Поздравляем!</h1>
                  <p>Вы прошли все уровни!</p>
                  <p style={{fontSize: '1.1rem', marginTop: '1rem'}}>Игрок: <strong>{player.name}</strong></p>
                  <p style={{fontSize: '1.2rem', marginTop: '1rem', color: '#44ff44'}}>Ваши очки: <strong>{player.final_score}</strong></p>
                </div>
              </div>
            </>
          )
        }
      }
      
      return (
        <>
        {toastLayer}
        <div className="player-screen level-start">
          <div style={{position: 'fixed', top: '0.5rem', right: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', zIndex: 1000}}>
            <div style={{background: 'rgba(0, 0, 0, 0.7)', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontSize: '0.85rem', maxWidth: '150px', textAlign: 'right'}}>
              Код: <strong style={{color: '#44ff44'}}>{session?.code || 'неизвестен'}</strong>
            </div>
            <button 
              onClick={handleExitSession}
              style={{
                background: 'rgba(255, 68, 68, 0.8)',
                color: 'white',
                border: 'none',
                padding: '0.4rem 0.8rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              Выйти
            </button>
          </div>
          <div style={{paddingTop: '4rem'}}>
            <h1>🎮 {levelInfo.emoji} {levelInfo.name}</h1>
            <p style={{fontSize: '1.1rem', marginTop: '1rem'}}>Игрок: <strong>{player.name}</strong></p>
            <div style={{
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '1.5rem',
              borderRadius: '1rem',
              margin: '1.5rem 0',
              textAlign: 'left'
            }}>
              <h3 style={{marginBottom: '0.5rem'}}>{levelInfo.emoji} {levelInfo.name}</h3>
              <p>{levelInfo.description}</p>
              <p style={{color: '#44ff44', marginTop: '0.5rem'}}>💰 {levelInfo.points} {levelInfo.pointsPer}</p>
            </div>
            <button onClick={() => setCurrentLevel(nextLevel)} className="start-level-button">
              Начать {levelInfo.name.toLowerCase()}
            </button>
          </div>
        </div>
        </>
      )
    }

    // Рендерим компоненты уровней
    return (
      <>
      {toastLayer}
      <div className="player-screen game-screen" style={{overflowX: 'hidden', maxWidth: '100%'}}>
        {/* Фейерверк */}
        {showFireworks && (
          <div className="fireworks-container" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            zIndex: 9999,
            overflow: 'hidden'
          }}>
            {Array.from({ length: 50 }).map((_, i) => (
              <div
                key={i}
                className="firework-particle"
                style={{
                  left: `${Math.random() * 100}vw`,
                  top: `${Math.random() * 100}vh`,
                  backgroundColor: `hsl(${Math.random() * 360}, 100%, 50%)`,
                  animationDelay: `${Math.random() * 1.5}s`,
                }}
              ></div>
            ))}
          </div>
        )}
        
        {/* Бонусная игра */}
        {bonusGameActive && !bonusGameIntroShown && (
          <BonusLevelIntro 
            gameType={bonusGameType}
            onStart={() => setBonusGameIntroShown(true)}
          />
        )}
        
        {bonusGameActive && bonusGameIntroShown && bonusGameType === 'gifts' && (
          <CatchGifts onComplete={handleBonusGameComplete} />
        )}
        
        {bonusGameActive && bonusGameIntroShown && bonusGameType === 'snowballs' && (
          <Snowballs onComplete={handleBonusGameComplete} />
        )}
        
        {bonusGameActive && bonusGameIntroShown && bonusGameType === 'roulette' && (
          <Roulette onComplete={handleBonusGameComplete} />
        )}
        
        {bonusGameActive && bonusGameIntroShown && bonusGameType === 'selfie' && (
          <SelfieMission 
            onComplete={handleBonusGameComplete} 
            playerName={player?.name || ''}
            playerToken={player?.token || ''}
          />
        )}
        
        {!bonusGameActive && (
          <>
            <div style={{
              position: 'fixed', 
              top: '0.5rem', 
              right: '0.5rem', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'flex-end', 
              gap: '0.5rem', 
              zIndex: 1000,
              maxWidth: 'calc(100% - 1rem)'
            }}>
              <div style={{
                background: 'rgba(0, 0, 0, 0.7)', 
                padding: '0.4rem 0.8rem', 
                borderRadius: '0.5rem', 
                fontSize: '0.75rem', 
                maxWidth: '120px', 
                textAlign: 'right',
                wordBreak: 'break-word'
              }}>
                Код: <strong style={{color: '#44ff44'}}>{session?.code || 'неизвестен'}</strong>
              </div>
              <button 
                onClick={handleExitSession}
                style={{
                  background: 'rgba(255, 68, 68, 0.8)',
                  color: 'white',
                  border: 'none',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap'
                }}
              >
                Выйти
              </button>
            </div>
            
            <div style={{paddingTop: '4rem', paddingBottom: '2rem', maxWidth: '100%', overflowX: 'hidden', paddingLeft: '1rem', paddingRight: '1rem'}}>
              <div className="level-content" style={{maxWidth: '100%', overflowX: 'hidden'}}>
                {/* Заголовок уровня - в карточке, разделен на две строки */}
                <div className="game-header" style={{
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '0.5rem',
                  textAlign: 'center'
                }}>
                  <div style={{fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem'}}>
                    {currentLevel === 'green' ? '🟢 Зелёный уровень' : currentLevel === 'yellow' ? '🟡 Жёлтый уровень' : currentLevel === 'red' ? '🔴 Красный уровень' : 'Неизвестен'}
                  </div>
                  <div style={{fontSize: '1rem', display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap'}}>
                    <span>Игрок: <strong>{player?.name || 'Неизвестен'}</strong></span>
                    <span>Очки: <strong style={{color: '#44ff44'}}>{player?.total_score || 0}</strong></span>
                  </div>
                </div>
                {currentLevel === 'green' && currentGreenGame === 1 && (
            <GreenLevel onComplete={handleLevelComplete} />
          )}
          {currentLevel === 'green' && currentGreenGame === 2 && (
            <FindCorrect onComplete={handleLevelComplete} />
          )}
          {currentLevel === 'green' && currentGreenGame === 3 && (
            <TapBattle onComplete={handleLevelComplete} />
          )}
          {currentLevel === 'green' && currentGreenGame === 0 && (
            <div style={{textAlign: 'center', padding: '2rem'}}>
              <h2>🟢 Зелёный уровень</h2>
              <p>Готовы начать первую игру?</p>
              <button onClick={() => setCurrentGreenGame(1)} className="start-button">
                Начать игру 1: Перемешанные слова
              </button>
            </div>
          )}
          {currentLevel === 'green' && currentGreenGame === 4 && (
            <div style={{textAlign: 'center', padding: '1rem', color: 'white', minHeight: '50vh', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
              <h2 style={{fontSize: '1.8rem', marginBottom: '1rem'}}>🎉 Поздравляем!</h2>
              <h3 style={{fontSize: '1.3rem', marginBottom: '1.5rem'}}>Вы прошли все уровни сложности: 🟢 Зелёный</h3>
              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                padding: '1.5rem',
                borderRadius: '1rem',
                marginBottom: '1.5rem',
                maxWidth: '100%'
              }}>
                <p style={{fontSize: '1.1rem', marginBottom: '0.5rem'}}>Ваш результат:</p>
                <p style={{fontSize: '2rem', color: '#44ff44', fontWeight: 'bold', wordBreak: 'break-word'}}>
                  {greenTotalScore} баллов
                </p>
              </div>
              <button 
                onClick={() => {
                  setCurrentLevel('yellow')
                  setCurrentGreenGame(0)
                  setCurrentYellowGame(0)
                  // Сохраняем состояние при переходе на желтый уровень
                  saveGameState({
                    sessionCode: session?.code,
                    playerToken: player?.token,
                    playerName: player?.name,
                    playerId: player?.id,
                    isJoined: true,
                    gameStatus: gameStatus,
                    currentLevel: 'yellow',
                    currentGreenGame: 0,
                    currentYellowGame: 0
                  })
                }} 
                className="start-button"
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1.1rem',
                  background: '#ffaa00',
                  color: '#000',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  maxWidth: '100%',
                  width: '100%'
                }}
              >
                Продолжить на 🟡 Жёлтый уровень
              </button>
            </div>
          )}
          {currentLevel === 'yellow' && currentYellowGame === 0 && (
            <div style={{textAlign: 'center', padding: '2rem'}}>
              <h2>🟡 Жёлтый уровень</h2>
              <p>Готовы начать первую игру?</p>
              <button onClick={() => setCurrentYellowGame(1)} className="start-button">
                Начать игру 1: Правда или Ложь
              </button>
            </div>
          )}
          {currentLevel === 'yellow' && currentYellowGame === 1 && (
            <TrueOrFalse onComplete={handleLevelComplete} />
          )}
          {currentLevel === 'yellow' && currentYellowGame === 2 && (
            <Charades onComplete={handleLevelComplete} />
          )}
          {currentLevel === 'yellow' && currentYellowGame === 3 && (
            <FindToy onComplete={handleLevelComplete} />
          )}
          {currentLevel === 'red' && currentRedGame === 0 && (
            <div style={{textAlign: 'center', padding: '2rem'}}>
              <h2>🔴 Красный уровень</h2>
              <p>Готовы начать первую игру?</p>
              <button onClick={() => setCurrentRedGame(1)} className="start-button">
                Начать игру 1: Реакция и ловля
              </button>
            </div>
          )}
          {currentLevel === 'red' && currentRedGame === 1 && redGame1Score === null && (
            <CatchGame onComplete={handleLevelComplete} />
          )}
          {currentLevel === 'red' && currentRedGame === 1 && redGame1Score !== null && (
            <div style={{textAlign: 'center', padding: '2rem', color: 'white'}}>
              <h2 style={{fontSize: '2rem', marginBottom: '1rem'}}>🎉 Игра 1 завершена!</h2>
              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                padding: '2rem',
                borderRadius: '1rem',
                marginBottom: '2rem'
              }}>
                <p style={{fontSize: '1.2rem', marginBottom: '1rem'}}>Ваш результат:</p>
                <p style={{fontSize: '2.5rem', color: '#44ff44', fontWeight: 'bold'}}>
                  {redGame1Score} баллов
                </p>
              </div>
              <button 
                onClick={() => {
                  setCurrentRedGame(2)
                  setRedGame1Score(null)
                }} 
                className="start-button"
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1.2rem',
                  background: '#ff4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Продолжить на игру 2: Шифровка
              </button>
            </div>
          )}
          {currentLevel === 'red' && currentRedGame === 2 && (
            <Cipher onComplete={handleLevelComplete} />
          )}
          {currentLevel === 'red' && currentRedGame === 3 && (
            <Simon onComplete={handleLevelComplete} />
          )}
          {currentLevel === 'red' && currentRedGame === 4 && (
            <div style={{textAlign: 'center', padding: '1rem', color: 'white', minHeight: '50vh', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
              <h2 style={{fontSize: '1.8rem', marginBottom: '1rem'}}>🎉 Поздравляем!</h2>
              <h3 style={{fontSize: '1.3rem', marginBottom: '1.5rem'}}>Вы прошли все уровни сложности: 🔴 Красный</h3>
              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                padding: '1.5rem',
                borderRadius: '1rem',
                marginBottom: '1.5rem',
                maxWidth: '100%'
              }}>
                <p style={{fontSize: '1.1rem', marginBottom: '0.5rem'}}>Ваш результат:</p>
                <p style={{fontSize: '2rem', color: '#ff4444', fontWeight: 'bold', wordBreak: 'break-word'}}>
                  {redTotalScore} баллов
                </p>
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                padding: '1.5rem',
                borderRadius: '1rem',
                marginBottom: '1.5rem',
                maxWidth: '100%'
              }}>
                <p style={{fontSize: '1.1rem', marginBottom: '0.5rem'}}>Общий результат за все уровни:</p>
                <p style={{fontSize: '2rem', color: '#44ff44', fontWeight: 'bold', wordBreak: 'break-word'}}>
                  {greenTotalScore + yellowTotalScore + redTotalScore} баллов
                </p>
              </div>
              <p style={{fontSize: '1rem', marginTop: '1rem', opacity: 0.8}}>
                Игра завершена! Ожидайте финальных результатов на экране TV.
              </p>
            </div>
          )}
          {currentLevel === 'finished' && (
            <div style={{textAlign: 'center', padding: '2rem', color: 'white'}}>
              <h2 style={{fontSize: '2rem', marginBottom: '1rem'}}>🎉 Поздравляем!</h2>
              <h3 style={{fontSize: '1.5rem', marginBottom: '2rem'}}>Вы прошли все уровни!</h3>
              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                padding: '2rem',
                borderRadius: '1rem',
                marginBottom: '2rem'
              }}>
                <p style={{fontSize: '1.2rem'}}>Игра завершена!</p>
                <p style={{fontSize: '1rem', marginTop: '1rem', color: '#aaa'}}>
                  Ожидайте финальных результатов на ТВ
                </p>
              </div>
            </div>
          )}
              </div>
            </div>
          </>
        )}
      </div>
      </>
    )
  }

  if (gameStatus === 'finished') {
    return (
      <>
        {toastLayer}
        <div className="player-screen finish-screen">
          <h1>🎉 Игра завершена!</h1>
          {player ? (
            <>
              <p>Ваш финальный счёт: {player.final_score || 0} очков</p>
              <p>Смотрите результаты на ТВ</p>
            </>
          ) : (
            <p>Загрузка результатов...</p>
          )}
        </div>
      </>
    )
  }

  // Fallback - если статус неизвестен
  return (
    <>
      {toastLayer}
      <div className="player-screen loading">
        <h1>Загрузка...</h1>
        <p>Статус игры: {gameStatus}</p>
        {error && <p className="error-message">Ошибка: {error}</p>}
      </div>
    </>
  )
}

export default PlayerScreen

