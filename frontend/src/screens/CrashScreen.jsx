import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useParams, useNavigate } from 'react-router-dom'
import { getCurrentCrashGame, getCrashHistory, placeCrashBet, finishCrashGame, createCrashGame, getSessionState, joinSession } from '../utils/api'
import { getPlayerToken, getDeviceUuid } from '../utils/storage'
import './CrashScreen.css'

function CrashScreen() {
  const [searchParams] = useSearchParams()
  const params = useParams()
  const navigate = useNavigate()
  // Поддерживаем оба формата: /crash/:session/:name и /crash?session=...&name=...
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
  const [bettingPhase, setBettingPhase] = useState(true) // Фаза размещения ставок (до и после игры)
  const [gameDuration, setGameDuration] = useState(20) // Длительность игры в секундах
  const [bettingTimeLeft, setBettingTimeLeft] = useState(10) // Оставшееся время на ставку
  const [pathPoints, setPathPoints] = useState([]) // Точки пути для линии за дедом морозом
  
  const animationRef = useRef(null)
  const gameIntervalRef = useRef(null)
  const bettingTimeoutRef = useRef(null)
  const bettingTimerRef = useRef(null)
  const finishingRef = useRef(false) // Флаг для предотвращения повторных вызовов finishCurrentGame
  const playerToken = getPlayerToken()

  // Загрузка данных игрока
  useEffect(() => {
    const loadPlayerData = async () => {
      if (!sessionCode || !playerName) return
      
      try {
        // Получаем данные сессии, чтобы найти игрока
        const sessionData = await getSessionState(sessionCode)
        
        // Ищем игрока по имени в списке игроков
        const foundPlayer = sessionData.players?.find(p => p.name.toLowerCase() === playerName.toLowerCase())
        
        if (foundPlayer) {
          // Игрок найден в сессии - используем его данные
          setPlayer({
            name: foundPlayer.name,
            final_score: foundPlayer.final_score || 0,
            role: foundPlayer.role,
            role_buff: foundPlayer.role_buff || 0,
            token: foundPlayer.token || playerToken
          })
        } else if (playerToken) {
          // Игрок не найден, но есть токен - используем токен
          setPlayer({
            name: playerName,
            final_score: 0,
            role: null,
            role_buff: 0,
            token: playerToken
          })
        } else {
          // Игрок не найден и нет токена - регистрируемся
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
          } catch (err) {
            console.error('Ошибка регистрации:', err)
            // Используем имя из URL
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
        // Fallback - используем имя из URL
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
          setCanBet(false) // Нельзя ставить во время игры
          setIsWaiting(false)
          setBettingPhase(false)
          const duration = currentData.duration_seconds || 25
          setGameDuration(duration)
          startGameAnimation(currentData.multiplier, duration)
        } else {
          // Нет активной игры - создаем новую
          setIsWaiting(false)
          await createNewGame()
        }
      } catch (err) {
        console.error('Ошибка загрузки игры:', err)
      }
    }
    
    loadGameData()
    
    // Обновляем каждые 3 секунды (реже, чтобы не перегружать)
    const interval = setInterval(() => {
      // Обновляем только историю, если игра не активна
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
    // Проверяем, не создается ли уже новая игра
    if (finishingRef.current) {
      console.log('⚠️ Игра еще завершается, ждем...')
      return
    }
    
    try {
      // Сбрасываем состояние
      setMultiplier(1.00)
      setGameResult(null)
      setMyBet(null)
      setBetMultiplier('')
      setBetAmount(0)
      setIsWaiting(true)
      
      const newGame = await createCrashGame(sessionCode)
      setCurrentGame(newGame)
      setIsWaiting(false)
      setBettingPhase(true) // Можно ставить до начала игры
      setCanBet(true)
      setBettingTimeLeft(10)
      
      // Даем 10 секунд на ставки перед началом игры
      let timeLeft = 10
      const preGameTimer = setInterval(() => {
        timeLeft--
        setBettingTimeLeft(timeLeft)
        if (timeLeft <= 0) {
          clearInterval(preGameTimer)
          setIsGameActive(true)
          setCanBet(false) // Во время игры нельзя ставить
          setBettingPhase(false)
          const duration = newGame.duration_seconds || 25
          setGameDuration(duration)
          startGameAnimation(newGame.multiplier, duration)
        }
      }, 1000)
    } catch (err) {
      console.error('Ошибка создания игры:', err)
      setIsWaiting(false)
    }
  }

  const startGameAnimation = (targetMultiplier, durationSeconds) => {
    let currentMultiplier = 1.00
    const duration = durationSeconds * 1000 // Конвертируем секунды в миллисекунды
    const startTime = Date.now()
    const slowPhaseEnd = 3.0 // До 3x медленная анимация
    const path = [] // Массив точек для линии
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Плавное увеличение множителя до финального числа
      // До 3x - медленная анимация, после 3x - быстрее
      let easedProgress
      if (targetMultiplier <= slowPhaseEnd) {
        // Если финальное число <= 3, используем медленную анимацию
        easedProgress = 1 - Math.pow(1 - progress, 2)
      } else {
        // Если финальное число > 3, до 3x медленно, потом быстрее
        const slowPhaseProgress = slowPhaseEnd / targetMultiplier
        if (progress <= slowPhaseProgress) {
          // Медленная фаза (до 3x)
          const slowProgress = progress / slowPhaseProgress
          easedProgress = slowProgress * slowPhaseProgress * 0.6 // Замедляем
        } else {
          // Быстрая фаза (после 3x)
          const fastProgress = (progress - slowPhaseProgress) / (1 - slowPhaseProgress)
          easedProgress = slowPhaseProgress * 0.6 + fastProgress * (1 - slowPhaseProgress * 0.6)
        }
      }
      
      currentMultiplier = 1.00 + (targetMultiplier - 1.00) * easedProgress
      setMultiplier(currentMultiplier)
      
      // Добавляем точку в путь (каждые ~50ms для плавности)
      if (path.length === 0 || elapsed - (path[path.length - 1]?.time || 0) > 50) {
        path.push({
          multiplier: currentMultiplier,
          time: elapsed,
          progress: progress
        })
        setPathPoints([...path])
      }
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        // Игра завершена - останавливаем анимацию и завершаем игру
        setMultiplier(targetMultiplier)
        setIsGameActive(false)
        
        // Добавляем финальную точку
        path.push({
          multiplier: targetMultiplier,
          time: duration,
          progress: 1
        })
        setPathPoints([...path])
        
        // Не переходим в фазу ставок после завершения - сразу завершаем игру
        // Вызываем finishCurrentGame только один раз
        if (!finishingRef.current) {
          finishCurrentGame()
        }
      }
    }
    
    animate()
  }

  const finishCurrentGame = async () => {
    if (!currentGame || !currentGame.game_id) return
    
    // Предотвращаем повторные вызовы
    if (finishingRef.current) {
      console.log('⚠️ finishCurrentGame уже выполняется, пропускаем')
      return
    }
    finishingRef.current = true
    
    // Очищаем таймеры ставок и анимации
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
      // Проверяем, не завершена ли уже игра
      const currentData = await getCurrentCrashGame(sessionCode)
      if (!currentData.is_active || currentData.game_id !== currentGame.game_id) {
        console.log('⚠️ Игра уже завершена или изменилась, пропускаем')
        finishingRef.current = false
        // Создаем новую игру
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
      
      // Обновляем историю сразу после завершения игры
      try {
        const historyData = await getCrashHistory(sessionCode)
        setHistory(historyData.history || [])
        console.log('📊 История обновлена после завершения игры:', historyData.history)
      } catch (err) {
        console.error('Ошибка загрузки истории:', err)
      }
      
      // Обновляем данные игрока после завершения игры
      try {
        const sessionData = await getSessionState(sessionCode)
        const foundPlayer = sessionData.players?.find(p => p.name.toLowerCase() === playerName.toLowerCase())
        if (foundPlayer) {
          setPlayer(prev => ({
            ...prev,
            final_score: foundPlayer.final_score || 0,
            role: foundPlayer.role,
            role_buff: foundPlayer.role_buff || 0
          }))
        }
      } catch (err) {
        console.error('Ошибка обновления данных игрока:', err)
      }
      
      // Проверяем, выиграл ли игрок
      if (myBet && myBet.multiplier && result.multiplier && myBet.multiplier <= result.multiplier) {
        // Выигрыш - подсвечиваем зеленым
        setTimeout(() => {
          setGameResult(null)
          setMyBet(null)
          setBetMultiplier('')
          setBetAmount(0)
          // Создаем новую игру через 5 секунд (пауза между играми)
          setTimeout(() => {
            finishingRef.current = false // Сбрасываем флаг перед созданием новой игры
            createNewGame()
          }, 5000)
        }, 3000)
      } else {
        // Проигрыш
        setTimeout(() => {
          setGameResult(null)
          setMyBet(null)
          setBetMultiplier('')
          setBetAmount(0)
          // Создаем новую игру через 5 секунд (пауза между играми)
          setTimeout(() => {
            finishingRef.current = false // Сбрасываем флаг перед созданием новой игры
            createNewGame()
          }, 5000)
        }, 3000)
      }
    } catch (err) {
      console.error('Ошибка завершения игры:', err)
      finishingRef.current = false // Сбрасываем флаг при ошибке
      setIsGameActive(false)
      // Пытаемся создать новую игру даже при ошибке (через 5 секунд)
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
    
    // Можно ставить до начала игры или после завершения (в фазе ставок)
    if (!bettingPhase && isGameActive) {
      alert('Ставки принимаются до начала игры или после её завершения')
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
      // После размещения ставки можно ставить еще (если не началась игра)
      if (isGameActive) {
        setCanBet(false) // Если игра уже идет, больше нельзя ставить
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
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
          <h1>🎄 Игра Краш</h1>
          <button 
            className="back-button-crash"
            onClick={() => navigate(`/kazino?session=${sessionCode}&name=${encodeURIComponent(playerName)}`)}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              background: 'rgba(255, 68, 68, 0.8)',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 68, 68, 1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 68, 68, 0.8)'}
          >
            ← Вернуться
          </button>
        </div>
        {player && (
          <div className="player-info">
            <div className="player-name">{player.name}</div>
            <div className="player-score">{player.final_score || 0} баллов</div>
            {player.role && (
              <div className="player-role">
                {player.role} (+{player.role_buff} баллов)
              </div>
            )}
          </div>
        )}
      </div>

      <div className="crash-game">
        {/* История игр - над игрой */}
        {history.length > 0 && (
          <div className="crash-history">
            <h3>История игр</h3>
            <div className="history-scroll">
              <div className="history-items">
                {history.map((game, idx) => (
                  <span key={idx} className="history-item" title={game.started_at ? new Date(game.started_at).toLocaleTimeString() : ''}>
                    {game.multiplier.toFixed(2)}x
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
        
        <div className="crash-graph">
          {/* Линия пути за дедом морозом */}
          {pathPoints.length > 1 && (
            <svg className="crash-path" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline
                points={pathPoints.map((point, idx) => {
                  const x = Math.min((point.multiplier - 1) * 10, 90)
                  const y = 100 - Math.min((point.multiplier - 1) * 5, 80)
                  return `${x},${y}`
                }).join(' ')}
                fill="none"
                stroke="#4CAF50"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          
          <div className="santa-icon" style={{
            left: `${Math.min((multiplier - 1) * 10, 90)}%`,
            bottom: `${Math.min((multiplier - 1) * 5, 80)}%`
          }}>
            🎅
          </div>
          <div className="multiplier-display">
            {/* Во время фазы ставок показываем 1.00x */}
            {bettingPhase && !isGameActive ? '1.00x' : `${multiplier.toFixed(2)}x`}
          </div>
        </div>


        {isGameActive && (
          <div className="game-status">
            Игра идет... Множитель растет
          </div>
        )}

        {bettingPhase && !isGameActive && !myBet && (
          <div className="betting-phase">
            ⏰ Фаза ставок: у вас есть {bettingTimeLeft} секунд для размещения ставки перед началом игры
          </div>
        )}

        {bettingPhase && isGameActive && !myBet && (
          <div className="betting-phase">
            ⏰ Фаза ставок: у вас есть {bettingTimeLeft} секунд для размещения ставки после завершения игры
          </div>
        )}

        {isWaiting && (
          <div className="waiting-message">
            Ожидание начала игры...
          </div>
        )}

        {bettingPhase && canBet && !myBet && (
          <div className="bet-section">
            <h3>
              {isGameActive ? 'Игра завершена. Сделайте ставку:' : `Сделайте ставку перед началом игры${bettingTimeLeft > 0 ? ` (осталось ${bettingTimeLeft} сек)` : ''}:`}
            </h3>
            <div className="bet-inputs">
              <input
                type="number"
                step="0.01"
                min="1.01"
                max="50"
                placeholder="Множитель (1.01-50)"
                value={betMultiplier}
                onChange={(e) => setBetMultiplier(e.target.value)}
              />
              <input
                type="number"
                min="0"
                placeholder="Ставка (баллы)"
                value={betAmount}
                onChange={(e) => setBetAmount(parseInt(e.target.value) || 0)}
              />
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
              disabled={!betMultiplier}
            >
              Поставить
            </button>
          </div>
        )}

        {myBet && (
          <div className="my-bet">
            <h3>Ваша ставка:</h3>
            <div className="bet-info">
              Множитель: <strong>{myBet.multiplier}x</strong>
              {betAmount > 0 && (
                <> | Ставка: <strong>{betAmount} баллов</strong></>
              )}
            </div>
          </div>
        )}

        {gameResult && (
          <div className={`game-result ${isWinner ? 'winner' : myBet ? 'loser' : 'neutral'}`}>
            {!myBet ? (
              // Если не ставили - просто показываем результат
              <>
                <h2>🎄 Игра завершена</h2>
                {gameResult && gameResult.multiplier && (
                  <p className="result-multiplier">Выпал коэффициент: <strong>{gameResult.multiplier.toFixed(2)}x</strong></p>
                )}
                <p className="result-info">Вы не делали ставку в этом раунде</p>
              </>
            ) : isWinner ? (
              // Выигрыш
              <>
                <h2>🎉 Вы выиграли!</h2>
                {gameResult && gameResult.multiplier && (
                  <p>Игра упала на {gameResult.multiplier.toFixed(2)}x</p>
                )}
                {myBet && myBet.multiplier && (
                  <>
                    <p>Ваша ставка: {myBet.multiplier}x ({myBet.bet_amount || 0} баллов)</p>
                    <p className="win-amount">
                      Возврат ставки: {myBet.bet_amount || 0} баллов
                    </p>
                    <p className="win-amount">
                      Выигрыш: {Math.floor((myBet.bet_amount || 0) * myBet.multiplier)} баллов
                    </p>
                    <p className="win-amount">
                      Итого получено: {(myBet.bet_amount || 0) + Math.floor((myBet.bet_amount || 0) * myBet.multiplier)} баллов
                    </p>
                  </>
                )}
              </>
            ) : (
              // Проигрыш (только если ставили)
              <>
                <h2>😔 Вы проиграли</h2>
                {gameResult && gameResult.multiplier && (
                  <p>Игра упала на {gameResult.multiplier.toFixed(2)}x</p>
                )}
                {myBet && myBet.multiplier && (
                  <p>Ваша ставка: {myBet.multiplier}x</p>
                )}
                <p>Ставка не вернулась</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CrashScreen

