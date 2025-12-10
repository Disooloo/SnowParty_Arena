import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { getCurrentCrashGame, getCrashHistory, placeCrashBet, finishCrashGame, createCrashGame, getSessionState, joinSession } from '../utils/api'
import { getPlayerToken, getDeviceUuid } from '../utils/storage'
import './CrashScreen.css'

function CrashScreen() {
  const [searchParams] = useSearchParams()
  const params = useParams()
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
        // Если есть токен, пытаемся найти игрока в сессии
        if (playerToken) {
          // Пока используем имя из URL и токен
          // В будущем можно добавить API для получения данных игрока по токену
          setPlayer({
            name: playerName,
            final_score: 0,
            role: null,
            role_buff: 0,
            token: playerToken
          })
        } else {
          // Если нет токена, но есть имя - регистрируемся
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
    try {
      const newGame = await createCrashGame(sessionCode)
      setCurrentGame(newGame)
      setIsWaiting(false)
      setBettingPhase(true) // Можно ставить до начала игры
      setCanBet(true)
      setBettingTimeLeft(5)
      
      // Даем 5 секунд на ставки перед началом игры
      let timeLeft = 5
      const preGameTimer = setInterval(() => {
        timeLeft--
        setBettingTimeLeft(timeLeft)
        if (timeLeft <= 0) {
          clearInterval(preGameTimer)
          setIsGameActive(true)
          setCanBet(false) // Во время игры нельзя ставить
          setBettingPhase(false)
          const duration = newGame.duration_seconds || 20
          setGameDuration(duration)
          startGameAnimation(newGame.multiplier, duration)
        }
      }, 1000)
    } catch (err) {
      console.error('Ошибка создания игры:', err)
    }
  }

  const startGameAnimation = (targetMultiplier, durationSeconds) => {
    let currentMultiplier = 1.00
    const duration = durationSeconds * 1000 // Конвертируем секунды в миллисекунды
    const startTime = Date.now()
    const slowPhaseEnd = 3.0 // До 3x медленная анимация
    
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
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        // Игра завершена - переходим в фазу ставок
        setMultiplier(targetMultiplier)
        setIsGameActive(false)
        setBettingPhase(true)
        setCanBet(true)
        setBettingTimeLeft(10) // 10 секунд на ставку после завершения игры
        
        // Таймер обратного отсчета для ставок (минимум 5 секунд, максимум 10)
        let timeLeft = 10
        bettingTimerRef.current = setInterval(() => {
          timeLeft--
          setBettingTimeLeft(timeLeft)
          if (timeLeft <= 0) {
            clearInterval(bettingTimerRef.current)
            // Вызываем finishCurrentGame только один раз
            if (!finishingRef.current) {
              finishCurrentGame()
            }
          }
        }, 1000)
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
    
    // Очищаем таймеры ставок
    if (bettingTimeoutRef.current) {
      clearTimeout(bettingTimeoutRef.current)
    }
    if (bettingTimerRef.current) {
      clearInterval(bettingTimerRef.current)
    }
    
    try {
      const result = await finishCrashGame(currentGame.game_id)
      setGameResult(result)
      setBettingPhase(false)
      setCanBet(false)
      
      // Обновляем историю сразу после завершения игры
      try {
        const historyData = await getCrashHistory(sessionCode)
        setHistory(historyData.history || [])
        console.log('📊 История обновлена после завершения игры:', historyData.history)
      } catch (err) {
        console.error('Ошибка загрузки истории:', err)
      }
      
      // Проверяем, выиграл ли игрок
      if (myBet && myBet.multiplier <= result.multiplier) {
        // Выигрыш - подсвечиваем зеленым
        setTimeout(() => {
          setGameResult(null)
          setMyBet(null)
          setBetMultiplier('')
          setBetAmount(0)
          // Создаем новую игру через 2 секунды
          setTimeout(() => {
            finishingRef.current = false // Сбрасываем флаг перед созданием новой игры
            createNewGame()
          }, 2000)
        }, 3000)
      } else {
        // Проигрыш
        setTimeout(() => {
          setGameResult(null)
          setMyBet(null)
          setBetMultiplier('')
          setBetAmount(0)
          // Создаем новую игру через 2 секунды
          setTimeout(() => {
            finishingRef.current = false // Сбрасываем флаг перед созданием новой игры
            createNewGame()
          }, 2000)
        }, 3000)
      }
    } catch (err) {
      console.error('Ошибка завершения игры:', err)
      finishingRef.current = false // Сбрасываем флаг при ошибке
      // Пытаемся создать новую игру даже при ошибке
      setTimeout(() => {
        createNewGame()
      }, 2000)
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
        <h1>🎄 Игра Краш</h1>
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
        <div className="crash-graph">
          <div className="santa-icon" style={{
            left: `${Math.min((multiplier - 1) * 10, 90)}%`,
            bottom: `${Math.min((multiplier - 1) * 5, 80)}%`
          }}>
            🎅
          </div>
          <div className="multiplier-display">
            {multiplier.toFixed(2)}x
          </div>
        </div>

        {history.length > 0 && (
          <div className="crash-history">
            <h3>История игр (последние 4):</h3>
            <div className="history-items">
              {history.slice(0, 4).map((game, idx) => (
                <span key={idx} className="history-item" title={game.started_at ? new Date(game.started_at).toLocaleTimeString() : ''}>
                  {game.multiplier.toFixed(2)}x
                </span>
              ))}
            </div>
          </div>
        )}

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
          <div className={`game-result ${isWinner ? 'winner' : 'loser'}`}>
            {isWinner ? (
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

