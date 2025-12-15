import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useParams, useNavigate } from 'react-router-dom'
import { getCurrentCrashGame, getCrashHistory, placeCrashBet, finishCrashGame, createCrashGame, getSessionState, joinSession, submitProgress, getCrashBets } from '../utils/api'
import { getPlayerToken, getDeviceUuid } from '../utils/storage'
import './CrashScreen.css'

function CrashScreen() {
  const [searchParams] = useSearchParams()
  const params = useParams()
  const navigate = useNavigate()
  const sessionCode = params.session || searchParams.get('session')
  const playerNameParam = params.name ? decodeURIComponent(params.name) : null
  const playerName = playerNameParam || searchParams.get('name')
  
  const [player, setPlayer] = useState(null)
  const [currentGame, setCurrentGame] = useState(null)
  const [history, setHistory] = useState([])
  const [multiplier, setMultiplier] = useState(1.00)
  const [isGameActive, setIsGameActive] = useState(false)
  const [canBet, setCanBet] = useState(false)
  const [betMultiplier, setBetMultiplier] = useState('')
  const [betAmount, setBetAmount] = useState(0)
  const [myBet, setMyBet] = useState(null)
  const [gameResult, setGameResult] = useState(null)
  const [isWaiting, setIsWaiting] = useState(true)
  const [bettingPhase, setBettingPhase] = useState(true)
  const [bettingTimeLeft, setBettingTimeLeft] = useState(10)
  const [pathPoints, setPathPoints] = useState([])
  const [balance, setBalance] = useState(0)
  const [winAmount, setWinAmount] = useState(0)
  const [betHistory, setBetHistory] = useState([])
  const [betSuccessMessage, setBetSuccessMessage] = useState(null)
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 100, height: 100 })
  
  const animationRef = useRef(null)
  const gameIntervalRef = useRef(null)
  const bettingTimeoutRef = useRef(null)
  const bettingTimerRef = useRef(null)
  const finishingRef = useRef(false)
  const playerToken = getPlayerToken()

  // Загрузка данных игрока
  useEffect(() => {
    const loadPlayerData = async () => {
      if (!sessionCode || !playerName) return
      
      try {
        const sessionData = await getSessionState(sessionCode)
        const foundPlayer = sessionData.players?.find(p => p.name.toLowerCase() === playerName.toLowerCase())
        
        if (foundPlayer) {
          setPlayer({
            name: foundPlayer.name,
            final_score: foundPlayer.final_score || 0,
            role: foundPlayer.role,
            role_buff: foundPlayer.role_buff || 0,
            token: foundPlayer.token || playerToken
          })
          setBalance(foundPlayer.final_score || 0)
        } else if (playerToken) {
          setPlayer({
            name: playerName,
            final_score: 0,
            role: null,
            role_buff: 0,
            token: playerToken
          })
        } else {
          try {
            const deviceUuid = getDeviceUuid()
            const playerData = await joinSession(sessionCode, playerName, deviceUuid)
            setPlayer({
              name: playerData.name,
              final_score: playerData.final_score || 0,
              role: playerData.role,
              role_buff: playerData.role_buff || 0,
              token: playerData.token
            })
            setBalance(playerData.final_score || 0)
          } catch (err) {
            console.error('Ошибка регистрации:', err)
            setPlayer({
              name: playerName,
              final_score: 0,
              role: null,
              role_buff: 0
            })
          }
        }
      } catch (err) {
        console.error('Ошибка загрузки данных игрока:', err)
        setPlayer({
          name: playerName,
          final_score: 0,
          role: null,
          role_buff: 0,
          token: playerToken
        })
      }
    }
    
    loadPlayerData()
  }, [sessionCode, playerToken, playerName])

  // Загрузка истории ставок
  useEffect(() => {
    const loadBetHistory = async () => {
      if (!sessionCode || !player?.token) return
      
      try {
        const data = await getCrashBets(sessionCode, player.token)
        setBetHistory(data.bets || [])
      } catch (err) {
        console.error('Ошибка загрузки истории ставок:', err)
      }
    }
    
    if (player?.token) {
      loadBetHistory()
      const interval = setInterval(loadBetHistory, 5000)
      return () => clearInterval(interval)
    }
  }, [sessionCode, player?.token])

  // Загрузка истории и текущей игры
  useEffect(() => {
    if (!sessionCode) return
    
    const loadGameData = async () => {
      try {
        const [historyData, currentData] = await Promise.all([
          getCrashHistory(sessionCode),
          getCurrentCrashGame(sessionCode)
        ])
        
        setHistory(historyData.history || [])
        
        if (currentData.is_active && currentData.game_id) {
          setCurrentGame(currentData)
          setIsGameActive(true)
          setCanBet(false)
          setIsWaiting(false)
          setBettingPhase(false)
          const duration = currentData.duration_seconds || 25
          startGameAnimation(currentData.multiplier, duration)
        } else {
          setIsWaiting(false)
          await createNewGame()
        }
      } catch (err) {
        console.error('Ошибка загрузки игры:', err)
      }
    }
    
    loadGameData()
    
    const interval = setInterval(() => {
      if (!isGameActive) {
        getCrashHistory(sessionCode).then(data => {
          setHistory(data.history || [])
        }).catch(err => {
          console.error('Ошибка обновления истории:', err)
        })
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [sessionCode, isGameActive])

  const createNewGame = async () => {
    if (finishingRef.current) {
      console.log('⚠️ Игра еще завершается, ждем...')
      return
    }
    
    try {
      setMultiplier(1.00)
      setGameResult(null)
      setMyBet(null)
      setBetMultiplier('')
      setBetAmount(0)
      setWinAmount(0)
      setPathPoints([])
      setViewBox({ x: 0, y: 0, width: 100, height: 100 })
      setIsWaiting(true)
      // Останавливаем любую анимацию во время фазы ставок
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      
      const newGame = await createCrashGame(sessionCode)
      setCurrentGame(newGame)
      setIsWaiting(false)
      setBettingPhase(true)
      setCanBet(true)
      setBettingTimeLeft(10)
      
      // 10 секунд на ставки
      let timeLeft = 10
      const preGameTimer = setInterval(() => {
        timeLeft--
        setBettingTimeLeft(timeLeft)
        if (timeLeft <= 0) {
          clearInterval(preGameTimer)
          setIsGameActive(true)
          setCanBet(false)
          setBettingPhase(false)
          const duration = newGame.duration_seconds || 25
          startGameAnimation(newGame.multiplier, duration)
        }
      }, 1000)
      bettingTimerRef.current = preGameTimer
    } catch (err) {
      console.error('Ошибка создания игры:', err)
      setIsWaiting(false)
    }
  }

  const startGameAnimation = (targetMultiplier, durationSeconds) => {
    let currentMultiplier = 1.00
    const duration = durationSeconds * 1000
    const startTime = Date.now()
    const path = []
    let lastUpdateTime = 0
    const UPDATE_INTERVAL = 100 // Обновляем линию каждые 100ms для плавности
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Плавное увеличение с ease-out
      const easedProgress = 1 - Math.pow(1 - progress, 2)
      currentMultiplier = 1.00 + (targetMultiplier - 1.00) * easedProgress
      setMultiplier(currentMultiplier)
      
      // Добавляем точку в путь и обновляем состояние реже для оптимизации
      const timeSinceLastUpdate = elapsed - lastUpdateTime
      if (timeSinceLastUpdate >= UPDATE_INTERVAL || progress >= 1) {
        path.push({
          multiplier: currentMultiplier,
          time: elapsed,
          progress: progress
        })
        setPathPoints([...path])
        lastUpdateTime = elapsed
      } else {
        // Все равно добавляем точку в массив, но не обновляем состояние
        path.push({
          multiplier: currentMultiplier,
          time: elapsed,
          progress: progress
        })
      }
      
      // Зум камеры для маленьких коэффициентов
      if (currentMultiplier <= 2.0) {
        // Приближаем камеру для коэффициентов до 2.0
        const zoomFactor = 2.0 / currentMultiplier
        // Используем правильные координаты, привязанные к сетке
        const clampedMultiplier = Math.min(currentMultiplier, 10)
        const centerX = Math.min(clampedMultiplier * 10, 100)
        const centerY = Math.max(100 - clampedMultiplier * 10, 0)
        const viewWidth = 100 / zoomFactor
        const viewHeight = 100 / zoomFactor
        setViewBox({
          x: Math.max(0, centerX - viewWidth / 2),
          y: Math.max(0, centerY - viewHeight / 2),
          width: viewWidth,
          height: viewHeight
        })
      } else {
        // Полный обзор для больших коэффициентов
        setViewBox({ x: 0, y: 0, width: 100, height: 100 })
      }
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        setMultiplier(targetMultiplier)
        setIsGameActive(false)
        setViewBox({ x: 0, y: 0, width: 100, height: 100 })
        
        // Финальная точка
        path.push({
          multiplier: targetMultiplier,
          time: duration,
          progress: 1
        })
        setPathPoints([...path])
        
        if (!finishingRef.current) {
          finishCurrentGame()
        }
      }
    }
    
    animate()
  }

  const finishCurrentGame = async () => {
    if (!currentGame || !currentGame.game_id) return
    
    if (finishingRef.current) {
      console.log('⚠️ finishCurrentGame уже выполняется, пропускаем')
      return
    }
    finishingRef.current = true
    
    if (bettingTimeoutRef.current) {
      clearTimeout(bettingTimeoutRef.current)
    }
    if (bettingTimerRef.current) {
      clearInterval(bettingTimerRef.current)
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
    
    try {
      const currentData = await getCurrentCrashGame(sessionCode)
      if (!currentData.is_active || currentData.game_id !== currentGame.game_id) {
        console.log('⚠️ Игра уже завершена или изменилась, пропускаем')
        finishingRef.current = false
        setTimeout(() => {
          createNewGame()
        }, 3000)
        return
      }
      
      const result = await finishCrashGame(currentGame.game_id)
      setGameResult(result)
      setBettingPhase(false)
      setCanBet(false)
      setIsGameActive(false)
      
      // Обновляем историю
      try {
        const historyData = await getCrashHistory(sessionCode)
        setHistory(historyData.history || [])
      } catch (err) {
        console.error('Ошибка загрузки истории:', err)
      }
      
      // Обновляем данные игрока и рассчитываем выигрыш
      try {
        const sessionData = await getSessionState(sessionCode)
        const foundPlayer = sessionData.players?.find(p => p.name.toLowerCase() === playerName.toLowerCase())
        if (foundPlayer) {
          const oldBalance = balance
          setBalance(foundPlayer.final_score || 0)
          
          // Рассчитываем выигрыш
          if (myBet && myBet.multiplier && result.multiplier && myBet.multiplier <= result.multiplier) {
            const win = Math.floor((myBet.bet_amount || 0) * myBet.multiplier)
            setWinAmount(win)
            
            // Показываем сообщение о выигрыше
            setBetSuccessMessage({
              multiplier: myBet.multiplier,
              betAmount: myBet.bet_amount,
              winAmount: win,
              message: `Вы выиграли! Ставка: ${myBet.bet_amount} баллов на ${myBet.multiplier}x. Выигрыш: ${win} баллов`
            })
            
            // Обновляем баланс на сервере уже сделано через finishCrashGame
            // Но можно обновить локально
          } else if (myBet) {
            setWinAmount(0)
            setBetSuccessMessage({
              multiplier: myBet.multiplier,
              betAmount: myBet.bet_amount,
              winAmount: 0,
              message: `Вы проиграли. Ставка: ${myBet.bet_amount} баллов на ${myBet.multiplier}x`
            })
          }
          
          // Обновляем историю ставок
          if (player?.token) {
            try {
              const data = await getCrashBets(sessionCode, player.token)
              setBetHistory(data.bets || [])
            } catch (err) {
              console.error('Ошибка обновления истории ставок:', err)
            }
          }
        }
      } catch (err) {
        console.error('Ошибка обновления данных игрока:', err)
      }
      
      // Показываем результат 5 секунд, затем новая игра
      setTimeout(() => {
        setGameResult(null)
        setMyBet(null)
        setBetMultiplier('')
        setBetAmount(0)
        setWinAmount(0)
        setTimeout(() => {
          finishingRef.current = false
          createNewGame()
        }, 2000)
      }, 5000)
    } catch (err) {
      console.error('Ошибка завершения игры:', err)
      finishingRef.current = false
      setIsGameActive(false)
      setTimeout(() => {
        createNewGame()
      }, 5000)
    }
  }

  const handleBet = async (multiplierValue) => {
    const token = player?.token || playerToken
    if (!token || !currentGame || !canBet) {
      alert('Необходимо войти в игру для размещения ставки')
      return
    }
    
    if (betAmount <= 0 || betAmount > balance) {
      alert('Неверная ставка! Проверьте сумму.')
      return
    }
    
    if (!bettingPhase && isGameActive) {
      alert('Ставки принимаются только до начала игры')
      return
    }
    
    try {
      const bet = await placeCrashBet(
        token,
        currentGame.game_id,
        multiplierValue,
        betAmount
      )
      
      setMyBet({
        multiplier: multiplierValue,
        bet_amount: betAmount,
        status: 'pending'
      })
      
      // Списываем ставку локально
      setBalance(prev => prev - betAmount)
      
      // Показываем сообщение о успешной ставке
      setBetSuccessMessage({
        multiplier: multiplierValue,
        betAmount: betAmount,
        message: `Ставка размещена: ${betAmount} баллов на ${multiplierValue}x`
      })
      
      // Скрываем сообщение через 3 секунды
      setTimeout(() => {
        setBetSuccessMessage(null)
      }, 3000)
      
      // Обновляем историю ставок
      if (player?.token) {
        try {
          const data = await getCrashBets(sessionCode, player.token)
          setBetHistory(data.bets || [])
        } catch (err) {
          console.error('Ошибка обновления истории ставок:', err)
        }
      }
      
      if (isGameActive) {
        setCanBet(false)
      }
    } catch (err) {
      alert(`Ошибка размещения ставки: ${err.message}`)
    }
  }

  const handleQuickBet = (multiplierValue) => {
    setBetMultiplier(multiplierValue.toString())
    handleBet(multiplierValue)
  }

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (gameIntervalRef.current) {
        clearInterval(gameIntervalRef.current)
      }
      if (bettingTimeoutRef.current) {
        clearTimeout(bettingTimeoutRef.current)
      }
      if (bettingTimerRef.current) {
        clearInterval(bettingTimerRef.current)
      }
    }
  }, [])

  const isWinner = gameResult && myBet && myBet.multiplier <= gameResult.multiplier


  return (
    <div className="crash-screen">
      <div className="crash-header">
        <div className="header-top">
          <h1>🎄 Игра Краш</h1>
          <button 
            className="back-button-crash"
            onClick={() => navigate(`/kazino?session=${sessionCode}&name=${encodeURIComponent(playerName)}`)}
          >
            ← Вернуться
          </button>
        </div>
        {player && (
          <div className="player-info">
            <div className="player-name">{player.name}</div>
            <div className="player-balance">Баланс: <strong>{balance}</strong> баллов</div>
          </div>
        )}
      </div>

      <div className="crash-game">
        {/* История игр */}
        {history.length > 0 && (
          <div className="crash-history">
            <h3>История игр</h3>
            <div className="history-scroll">
              <div className="history-items">
                {history.slice(0, 10).map((game, idx) => (
                  <span key={idx} className="history-item">
                    {game.multiplier.toFixed(2)}x
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* История выигрышей в правом углу */}
        {betHistory.length > 0 && (
          <div className="wins-history-panel">
            <h3>История выигрышей</h3>
            <div className="wins-history-table">
              <div className="wins-history-header">
                <div className="wins-col-datetime">Дата/Время</div>
                <div className="wins-col-name">Имя</div>
                <div className="wins-col-bet">Ставка</div>
                <div className="wins-col-coef">Коэф. ставки</div>
                <div className="wins-col-result">Коэф. игры</div>
                <div className="wins-col-win">Выигрыш</div>
              </div>
              <div className="wins-history-scroll">
                {betHistory.slice(0, 20).map((bet, idx) => {
                  const betDate = bet.created_at ? new Date(bet.created_at) : null
                  const dateStr = betDate ? betDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '-'
                  const timeStr = betDate ? betDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '-'
                  
                  return (
                    <div 
                      key={bet.bet_id || idx} 
                      className={`wins-history-row ${bet.won ? 'won' : 'lost'}`}
                    >
                      <div className="wins-col-datetime">
                        <div className="datetime-date">{dateStr}</div>
                        <div className="datetime-time">{timeStr}</div>
                      </div>
                      <div className="wins-col-name">{bet.player_name || player?.name || 'Игрок'}</div>
                      <div className="wins-col-bet">{bet.bet_amount}</div>
                      <div className="wins-col-coef">{bet.multiplier}x</div>
                      <div className="wins-col-result">
                        {bet.game_multiplier ? `${bet.game_multiplier.toFixed(2)}x` : '-'}
                      </div>
                      <div className={`wins-col-win ${bet.won ? 'win' : 'loss'}`}>
                        {bet.won ? (
                          <span className="win-amount">+{bet.win_amount - bet.bet_amount}</span>
                        ) : (
                          <span className="loss-amount">-{bet.bet_amount}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        
        {/* График с сеткой координат */}
        <div className="crash-graph-container">
          <div className="crash-graph">
            {/* Сетка координат */}
            <svg className="grid-overlay" viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} preserveAspectRatio="none">
              <defs>
                <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="100" height="100" fill="url(#grid)" />
              
              {/* Подписи осей */}
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                <g key={num}>
                  <text x={num * 10} y="98" fontSize="2" fill="rgba(255, 255, 255, 0.5)" textAnchor="middle">{num}</text>
                  <text x="2" y={100 - num * 10} fontSize="2" fill="rgba(255, 255, 255, 0.5)" textAnchor="start">{num}</text>
                </g>
              ))}
            </svg>

            {/* Линия пути - оптимизированная версия */}
            {pathPoints.length > 0 && (
              <svg className="crash-path" viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style={{stopColor: '#44ff44', stopOpacity: 1}} />
                    <stop offset="100%" style={{stopColor: '#ffaa00', stopOpacity: 1}} />
                  </linearGradient>
                </defs>
                <polyline
                  points={(() => {
                    // Строим точки из pathPoints, привязанные к координатам сетки (0-10)
                    // Каждая единица множителя = 10% на графике (0 = 0%, 1 = 10%, 2 = 20%, ..., 10 = 100%)
                    const points = pathPoints.map((point) => {
                      // Ограничиваем множитель до 10 для соответствия сетке
                      const clampedMultiplier = Math.min(point.multiplier, 10)
                      // x координата: multiplier * 10 (но не больше 100)
                      const x = Math.min(clampedMultiplier * 10, 100)
                      // y координата: 100 - multiplier * 10 (но не меньше 0), так как y идет сверху вниз
                      const y = Math.max(100 - clampedMultiplier * 10, 0)
                      return `${x},${y}`
                    })
                    // Добавляем текущую позицию для плавного продолжения линии
                    if (isGameActive && multiplier > 1.00) {
                      const clampedMultiplier = Math.min(multiplier, 10)
                      const currentX = Math.min(clampedMultiplier * 10, 100)
                      const currentY = Math.max(100 - clampedMultiplier * 10, 0)
                      // Добавляем только если это новая точка
                      const lastPoint = points[points.length - 1]
                      if (!lastPoint || lastPoint !== `${currentX},${currentY}`) {
                        points.push(`${currentX},${currentY}`)
                      }
                    }
                    return points.join(' ')
                  })()}
                  fill="none"
                  stroke="url(#pathGradient)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="path-line"
                  vectorEffect="non-scaling-stroke"
                  shapeRendering="geometricPrecision"
                />
              </svg>
            )}
            
            
            {/* Отображение множителя - показываем только когда игра активна */}
            {isGameActive && (
              <div className="multiplier-display">
                {multiplier.toFixed(2)}x
              </div>
            )}
            {/* Во время фазы ставок показываем статичный 1.00x */}
            {bettingPhase && !isGameActive && (
              <div className="multiplier-display multiplier-static">
                1.00x
              </div>
            )}
          </div>
        </div>

        {/* Сообщение о успешной ставке */}
        {betSuccessMessage && (
          <div className={`bet-success-message ${betSuccessMessage.winAmount > 0 ? 'win' : betSuccessMessage.winAmount === 0 && betSuccessMessage.betAmount ? 'placed' : ''}`}>
            {betSuccessMessage.message}
          </div>
        )}

        {/* Статус игры */}
        {bettingPhase && !isGameActive && !myBet && (
          <div className="betting-phase">
            ⏰ Фаза ставок: {bettingTimeLeft} секунд до начала игры
          </div>
        )}

        {isGameActive && (
          <div className="game-status">
            🚀 Игра идет... Множитель растет!
          </div>
        )}

        {isWaiting && (
          <div className="waiting-message">
            Ожидание начала игры...
          </div>
        )}

        {/* Панель ставок */}
        {bettingPhase && canBet && !myBet && (
          <div className="bet-section">
            <h3>Сделайте ставку {bettingTimeLeft > 0 ? `(${bettingTimeLeft} сек)` : ''}</h3>
            <div className="bet-inputs">
              <div className="bet-input-group">
                <label>Множитель</label>
                <input
                  type="number"
                  step="0.01"
                  min="1.01"
                  max="50"
                  placeholder="1.01-50"
                  value={betMultiplier}
                  onChange={(e) => setBetMultiplier(e.target.value)}
                />
              </div>
              <div className="bet-input-group">
                <label>Ставка (баллы)</label>
                <input
                  type="number"
                  min="1"
                  max={balance}
                  placeholder={`Макс: ${balance}`}
                  value={betAmount}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0
                    if (value >= 0 && value <= balance) {
                      setBetAmount(value)
                    }
                  }}
                />
              </div>
            </div>
            <div className="quick-bets">
              <button onClick={() => handleQuickBet(1.5)}>x1.5</button>
              <button onClick={() => handleQuickBet(2)}>x2</button>
              <button onClick={() => handleQuickBet(3)}>x3</button>
              <button onClick={() => handleQuickBet(5)}>x5</button>
            </div>
            <button 
              className="place-bet-button"
              onClick={() => handleBet(parseFloat(betMultiplier) || 1.5)}
              disabled={!betMultiplier || betAmount <= 0 || betAmount > balance}
            >
              Поставить {betAmount > 0 ? `${betAmount} баллов` : ''}
            </button>
          </div>
        )}

        {/* Моя ставка */}
        {myBet && (
          <div className="my-bet">
            <h3>Ваша ставка:</h3>
            <div className="bet-info">
              Множитель: <strong>{myBet.multiplier}x</strong>
              {myBet.bet_amount > 0 && (
                <> | Ставка: <strong>{myBet.bet_amount} баллов</strong></>
              )}
            </div>
          </div>
        )}

        {/* Результат игры */}
        {gameResult && (
          <div className={`game-result ${isWinner ? 'winner' : myBet ? 'loser' : 'neutral'}`}>
            {!myBet ? (
              <>
                <h2>🎄 Игра завершена</h2>
                <p className="result-multiplier">Выпал коэффициент: <strong>{gameResult.multiplier?.toFixed(2)}x</strong></p>
                <p className="result-info">Вы не делали ставку в этом раунде</p>
              </>
            ) : isWinner ? (
              <>
                <h2>🎉 Вы выиграли!</h2>
                <p>Игра упала на {gameResult.multiplier?.toFixed(2)}x</p>
                <p>Ваша ставка: {myBet.multiplier}x ({myBet.bet_amount || 0} баллов)</p>
                <p className="win-amount">
                  Выигрыш: +{winAmount} баллов
                </p>
              </>
            ) : (
              <>
                <h2>😔 Вы проиграли</h2>
                <p>Игра упала на {gameResult.multiplier?.toFixed(2)}x</p>
                <p>Ваша ставка: {myBet.multiplier}x</p>
                <p>Потеряно: -{myBet.bet_amount || 0} баллов</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CrashScreen
