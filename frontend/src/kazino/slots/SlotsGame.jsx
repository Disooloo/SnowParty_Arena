import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getSessionState, submitProgress } from '../../utils/api'
import { getPlayerToken, getDeviceUuid } from '../../utils/storage'
import './SlotsGame.css'

// Новогодние символы для слотов
const SYMBOLS = ['🎁', '❄️', '⭐', '🎄', '🔔', '🍬', '🎅', '⛄']

// Таблица выплат (множители)
const PAYOUTS = {
  '🎁🎁🎁': 10,  // Три подарка
  '❄️❄️❄️': 8,   // Три снежинки
  '⭐⭐⭐': 6,     // Три звезды
  '🎄🎄🎄': 5,    // Три ёлки
  '🔔🔔🔔': 4,    // Три колокольчика
  '🍬🍬🍬': 3,    // Три конфеты
  '🎅🎅🎅': 2,    // Три деда мороза
  '⛄⛄⛄': 2,     // Три снеговика
}

function SlotsGame() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionCode = searchParams.get('session')
  const playerName = searchParams.get('name')
  
  const [player, setPlayer] = useState(null)
  const [balance, setBalance] = useState(0)
  const [betAmount, setBetAmount] = useState(10)
  const [isSpinning, setIsSpinning] = useState(false)
  // Каждый барабан содержит массив из 7 символов (3 сверху, 1 в центре, 3 снизу)
  const [reels, setReels] = useState([
    [SYMBOLS[0], SYMBOLS[1], SYMBOLS[2], SYMBOLS[3], SYMBOLS[4], SYMBOLS[5], SYMBOLS[6]],
    [SYMBOLS[1], SYMBOLS[2], SYMBOLS[3], SYMBOLS[4], SYMBOLS[5], SYMBOLS[6], SYMBOLS[0]],
    [SYMBOLS[2], SYMBOLS[3], SYMBOLS[4], SYMBOLS[5], SYMBOLS[6], SYMBOLS[0], SYMBOLS[1]]
  ])
  const [spinningReels, setSpinningReels] = useState([false, false, false]) // Какие барабаны вращаются
  const [reelOffsets, setReelOffsets] = useState([0, 0, 0]) // Смещение для анимации
  const [lastResult, setLastResult] = useState(null) // Последний результат
  const [winAmount, setWinAmount] = useState(0) // Выигрыш
  const [finalReels, setFinalReels] = useState([SYMBOLS[0], SYMBOLS[1], SYMBOLS[2]]) // Финальные символы для расчета выигрыша

  const spinIntervalRefs = useRef([null, null, null])
  const animationFrameRefs = useRef([null, null, null])

  useEffect(() => {
    const loadPlayerData = async () => {
      if (!sessionCode) {
        console.warn('⚠️ Нет кода сессии')
        return
      }
      
      try {
        const sessionState = await getSessionState(sessionCode)
        console.log('📊 Состояние сессии:', sessionState)
        
        // Проверяем наличие players (может быть в разных форматах)
        let players = null
        if (sessionState.players && Array.isArray(sessionState.players)) {
          players = sessionState.players
        } else if (sessionState.players_list && Array.isArray(sessionState.players_list)) {
          players = sessionState.players_list
        } else {
          console.warn('⚠️ Нет данных об игроках в сессии, пытаемся присоединиться...', sessionState)
          
          // Если игроков нет, но есть сессия, попробуем присоединиться
          const playerToken = getPlayerToken()
          const deviceUuid = getDeviceUuid()
          
          if (!playerToken || !deviceUuid) {
            console.warn('⚠️ Нет токена или device UUID, нужно сначала присоединиться к сессии')
            return
          }
          
          // Пробуем использовать токен для поиска игрока
          // Но сначала нужно получить список игроков через другой способ
          // Пока просто выходим - пользователь должен сначала присоединиться через /play
          console.warn('⚠️ Сначала нужно присоединиться к сессии через /play')
          return
        }
        
        console.log('👥 Игроки в сессии:', players)
        
        // Если есть имя игрока, ищем по имени, иначе берем первого игрока
        let currentPlayer = null
        if (playerName) {
          currentPlayer = players.find(p => p.name === playerName)
        } else if (players.length > 0) {
          currentPlayer = players[0]
        }
        
        // Если игрок не найден, но есть токен, попробуем найти по токену
        if (!currentPlayer) {
          const playerToken = getPlayerToken()
          if (playerToken && players.length > 0) {
            currentPlayer = players.find(p => p.token === playerToken)
            console.log('🔍 Поиск по токену:', { playerToken, found: !!currentPlayer })
          }
        }
        
        if (currentPlayer) {
          console.log('✅ Игрок найден:', currentPlayer)
          const playerData = {
            id: currentPlayer.id,
            name: currentPlayer.name,
            final_score: currentPlayer.final_score || 0,
            token: currentPlayer.token
          }
          setPlayer(playerData)
          setBalance(currentPlayer.final_score || 0)
          
          // Устанавливаем ставку по умолчанию, если баланс позволяет
          if (currentPlayer.final_score > 0 && betAmount === 10) {
            const defaultBet = Math.min(10, currentPlayer.final_score)
            setBetAmount(defaultBet)
          }
        } else {
          console.warn('⚠️ Игрок не найден', { playerName, playersCount: sessionState.players.length })
        }
      } catch (err) {
        console.error('❌ Ошибка загрузки данных игрока:', err)
      }
    }
    
    loadPlayerData()
  }, [sessionCode, playerName])

  // Очистка интервалов и анимаций при размонтировании
  useEffect(() => {
    return () => {
      spinIntervalRefs.current.forEach(interval => {
        if (interval) clearInterval(interval)
      })
      animationFrameRefs.current.forEach(raf => {
        if (raf) cancelAnimationFrame(raf)
      })
    }
  }, [])

  const spinReel = (reelIndex, targetSymbol) => {
    return new Promise((resolve) => {
      const minSpinDuration = 2500 // Минимум 2.5 секунды
      const maxSpinDuration = 4000 // Максимум 4 секунды
      const spinDuration = minSpinDuration + Math.random() * (maxSpinDuration - minSpinDuration)
      const startTime = Date.now()
      const symbolHeight = 110 // Высота одного символа
      const minSpins = 10 // Минимум 10 полных оборотов
      const maxSpins = 18 // Максимум 18 полных оборотов
      const totalSpins = minSpins + Math.floor(Math.random() * (maxSpins - minSpins))
      const targetOffset = totalSpins * symbolHeight // Финальное смещение
      
      console.log(`🎰 Вращение барабана ${reelIndex}, цель: ${targetSymbol}, оборотов: ${totalSpins}`)
      
      // Запускаем вращение
      setSpinningReels(prev => {
        const newSpinning = [...prev]
        newSpinning[reelIndex] = true
        return newSpinning
      })
      
      // Инициализируем барабан с достаточным количеством символов для плавной прокрутки
      // Создаем массив из 20 символов для бесконечной прокрутки
      const initialReel = Array.from({ length: 20 }, () => 
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
      )
      // Устанавливаем целевой символ в нужной позиции
      const targetPosition = Math.floor(totalSpins) % 20
      initialReel[targetPosition] = targetSymbol
      
      setReels(prev => prev.map((reel, idx) => {
        if (idx === reelIndex) {
          return initialReel
        }
        return reel
      }))
      
      let lastSymbolUpdate = 0
      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / spinDuration, 1)
        
        // Замедляем к концу (ease-out)
        const easedProgress = 1 - Math.pow(1 - progress, 3)
        
        // Обновляем смещение (движение сверху вниз)
        const currentOffset = easedProgress * targetOffset
        setReelOffsets(prev => {
          const newOffsets = [...prev]
          newOffsets[reelIndex] = currentOffset
          return newOffsets
        })
        
        // Обновляем символы во время вращения (каждые 100мс)
        if (elapsed - lastSymbolUpdate > 100 && progress < 0.9) {
          lastSymbolUpdate = elapsed
          setReels(prev => prev.map((reel, idx) => {
            if (idx === reelIndex) {
              // Обновляем случайные символы, но сохраняем целевой в нужной позиции
              const newReel = [...reel]
              for (let i = 0; i < newReel.length; i++) {
                // Не трогаем символы близко к целевой позиции
                const distanceFromTarget = Math.abs(i - targetPosition)
                if (distanceFromTarget > 2 || progress > 0.85) {
                  newReel[i] = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
                }
              }
              // Убеждаемся, что целевой символ на месте
              newReel[targetPosition] = targetSymbol
              return newReel
            }
            return reel
          }))
        }
        
        if (progress < 1) {
          animationFrameRefs.current[reelIndex] = requestAnimationFrame(animate)
        } else {
          // Финальная установка: целевой символ в центре (позиция 3 из 7)
          setReels(prev => prev.map((reel, idx) => {
            if (idx === reelIndex) {
              // Создаем финальный массив из 7 символов с целевым в центре
              const finalReel = []
              for (let i = 0; i < 3; i++) {
                finalReel.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)])
              }
              finalReel.push(targetSymbol) // Центральный символ (индекс 3)
              for (let i = 0; i < 3; i++) {
                finalReel.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)])
              }
              return finalReel
            }
            return reel
          }))
          
          // Сбрасываем смещение
          setReelOffsets(prev => {
            const newOffsets = [...prev]
            newOffsets[reelIndex] = 0
            return newOffsets
          })
          
          // Останавливаем вращение
          setSpinningReels(prev => {
            const newSpinning = [...prev]
            newSpinning[reelIndex] = false
            return newSpinning
          })
          
          console.log(`✅ Барабан ${reelIndex} остановлен на символе ${targetSymbol}`)
          resolve()
        }
      }
      
      animationFrameRefs.current[reelIndex] = requestAnimationFrame(animate)
    })
  }

  const calculateWin = (reels) => {
    const combination = reels.join('')
    
    // Проверяем комбинации
    for (const [pattern, multiplier] of Object.entries(PAYOUTS)) {
      if (combination === pattern) {
        return betAmount * multiplier
      }
    }
    
    // Проверяем два одинаковых символа
    if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
      return Math.floor(betAmount * 0.5) // 50% от ставки
    }
    
    return 0
  }

  const handleSpin = async () => {
    console.log('🎰 handleSpin вызван', { isSpinning, betAmount, balance })
    
    if (isSpinning) {
      console.warn('⚠️ Уже идет вращение')
      return
    }
    
    if (betAmount > balance) {
      console.warn('⚠️ Недостаточно средств', { betAmount, balance })
      alert(`Недостаточно средств! У вас ${balance} баллов, а ставка ${betAmount}`)
      return
    }
    
    if (betAmount <= 0) {
      console.warn('⚠️ Ставка должна быть больше 0')
      alert('Ставка должна быть больше 0!')
      return
    }
    
    console.log('✅ Начинаем вращение')
    setIsSpinning(true)
    setLastResult(null)
    setWinAmount(0)
    
    // Устанавливаем все барабаны в состояние вращения
    setSpinningReels([true, true, true])
    
    // Сбрасываем баланс (ставка)
    const newBalance = balance - betAmount
    setBalance(newBalance)
    
    try {
      // Генерируем финальную комбинацию (центральные символы) заранее
      const finalSymbols = [
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
      ]
      
      console.log('🎰 Финальная комбинация:', finalSymbols)
      
      // Вращаем барабаны последовательно, каждый до нужного символа
      console.log('🎰 Вращаем барабан 0...')
      await spinReel(0, finalSymbols[0])
      await new Promise(resolve => setTimeout(resolve, 300))
      
      console.log('🎰 Вращаем барабан 1...')
      await spinReel(1, finalSymbols[1])
      await new Promise(resolve => setTimeout(resolve, 300))
      
      console.log('🎰 Вращаем барабан 2...')
      await spinReel(2, finalSymbols[2])
      
      setFinalReels(finalSymbols)
      setSpinningReels([false, false, false])
      setReelOffsets([0, 0, 0])
      
      // Рассчитываем выигрыш
      const win = calculateWin(finalSymbols)
      setWinAmount(win)
      console.log('💰 Выигрыш:', win)
      
      // Обновляем баланс на сервере
      if (player?.token && sessionCode) {
        try {
          // Чистый выигрыш (выигрыш - ставка, так как ставка уже списана)
          const netWin = win - betAmount
          
          if (netWin !== 0) {
            // Обновляем баланс через API (положительный или отрицательный)
            await submitProgress(player.token, 'bonus', netWin, 0, {
              game: 'slots',
              bet: betAmount,
              win: win,
              combination: finalSymbols.join('')
            }, true)
          }
          
          // Обновляем данные игрока
          const sessionState = await getSessionState(sessionCode)
          const updatedPlayer = sessionState.players.find(p => p.token === player.token)
          if (updatedPlayer) {
            setPlayer({ ...player, final_score: updatedPlayer.final_score })
            setBalance(updatedPlayer.final_score)
          }
        } catch (err) {
          console.error('❌ Ошибка обновления баланса:', err)
          // В случае ошибки возвращаем баланс обратно
          setBalance(balance)
        }
      }
      
      if (win > 0) {
        setLastResult('win')
      } else {
        setLastResult('lose')
      }
      
    } catch (err) {
      console.error('❌ Ошибка вращения:', err)
      setSpinningReels([false, false, false])
      setBalance(balance) // Возвращаем баланс при ошибке
    } finally {
      setIsSpinning(false)
      console.log('✅ Вращение завершено')
    }
  }

  const handleQuickBet = (amount) => {
    if (amount <= balance && !isSpinning) {
      setBetAmount(amount)
    }
  }

  return (
    <div className="slots-game">
      <div className="slots-header">
        <h1>🎰 Слоты</h1>
        {player && (
          <div className="player-info">
            <div className="player-name">{player.name}</div>
            <div className="player-balance">Баланс: <strong>{balance}</strong> баллов</div>
          </div>
        )}
        <button 
          className="back-button"
          onClick={() => navigate(`/kazino?session=${sessionCode}&name=${encodeURIComponent(playerName)}`)}
        >
          ← Вернуться
        </button>
      </div>

      <div className="slots-content">
        {/* SVG Слот-автомат */}
        <div className="slots-machine">
          <svg
            className="slots-machine-svg"
            viewBox="0 0 600 800"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Основа автомата */}
            <defs>
              <linearGradient id="machineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{stopColor: '#2c3e50', stopOpacity: 1}} />
                <stop offset="100%" style={{stopColor: '#1a252f', stopOpacity: 1}} />
              </linearGradient>
              <linearGradient id="screenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{stopColor: '#34495e', stopOpacity: 1}} />
                <stop offset="100%" style={{stopColor: '#2c3e50', stopOpacity: 1}} />
              </linearGradient>
            </defs>

            {/* Корпус автомата */}
            <rect x="50" y="50" width="500" height="700" rx="30" fill="url(#machineGradient)" stroke="#FFD700" strokeWidth="4" />
            
            {/* Верхняя часть с названием */}
            <rect x="70" y="70" width="460" height="80" rx="15" fill="#C41E3A" />
            <text x="300" y="125" textAnchor="middle" fill="#FFD700" fontSize="40" fontWeight="bold" fontFamily="Arial">
              🎄 СНЕЖНЫЕ СЛОТЫ 🎄
            </text>

            {/* Экран с барабанами */}
            <rect x="100" y="180" width="400" height="350" rx="20" fill="url(#screenGradient)" stroke="#FFD700" strokeWidth="3" />
            
            {/* Разделители между барабанами */}
            <line x1="233" y1="180" x2="233" y2="530" stroke="#FFD700" strokeWidth="2" />
            <line x1="366" y1="180" x2="366" y2="530" stroke="#FFD700" strokeWidth="2" />

            {/* Барабаны (3 колонки) */}
            {/* Барабан 1 */}
            <g>
              <rect x="110" y="190" width="110" height="330" fill="#1a252f" rx="10" />
              <clipPath id={`reel-clip-1`}>
                <rect x="110" y="190" width="110" height="330" />
              </clipPath>
              <g clipPath={`url(#reel-clip-1)`}>
                {reels[0].map((symbol, idx) => {
                  const baseY = 190 + (idx * 110) - reelOffsets[0]
                  return (
                    <g key={`reel1-${idx}`}>
                      <circle 
                        cx="165" 
                        cy={baseY + 55} 
                        r="50" 
                        fill="#FFD700" 
                        opacity={spinningReels[0] ? "0.5" : "0.3"}
                      />
                      <text 
                        x="165" 
                        y={baseY + 70} 
                        textAnchor="middle" 
                        fill="#FFD700" 
                        fontSize="60" 
                        fontWeight="bold"
                      >
                        {symbol}
                      </text>
                    </g>
                  )
                })}
              </g>
            </g>

            {/* Барабан 2 */}
            <g>
              <rect x="243" y="190" width="110" height="330" fill="#1a252f" rx="10" />
              <clipPath id={`reel-clip-2`}>
                <rect x="243" y="190" width="110" height="330" />
              </clipPath>
              <g clipPath={`url(#reel-clip-2)`}>
                {reels[1].map((symbol, idx) => {
                  const baseY = 190 + (idx * 110) - reelOffsets[1]
                  return (
                    <g key={`reel2-${idx}`}>
                      <circle 
                        cx="298" 
                        cy={baseY + 55} 
                        r="50" 
                        fill="#FFD700" 
                        opacity={spinningReels[1] ? "0.5" : "0.3"}
                      />
                      <text 
                        x="298" 
                        y={baseY + 70} 
                        textAnchor="middle" 
                        fill="#FFD700" 
                        fontSize="60" 
                        fontWeight="bold"
                      >
                        {symbol}
                      </text>
                    </g>
                  )
                })}
              </g>
            </g>

            {/* Барабан 3 */}
            <g>
              <rect x="376" y="190" width="110" height="330" fill="#1a252f" rx="10" />
              <clipPath id={`reel-clip-3`}>
                <rect x="376" y="190" width="110" height="330" />
              </clipPath>
              <g clipPath={`url(#reel-clip-3)`}>
                {reels[2].map((symbol, idx) => {
                  const baseY = 190 + (idx * 110) - reelOffsets[2]
                  return (
                    <g key={`reel3-${idx}`}>
                      <circle 
                        cx="431" 
                        cy={baseY + 55} 
                        r="50" 
                        fill="#FFD700" 
                        opacity={spinningReels[2] ? "0.5" : "0.3"}
                      />
                      <text 
                        x="431" 
                        y={baseY + 70} 
                        textAnchor="middle" 
                        fill="#FFD700" 
                        fontSize="60" 
                        fontWeight="bold"
                      >
                        {symbol}
                      </text>
                    </g>
                  )
                })}
              </g>
            </g>

            {/* Линия выплат */}
            <line x1="100" y1="365" x2="500" y2="365" stroke="#44ff44" strokeWidth="4" strokeDasharray="10,5" opacity="0.6" />

            {/* Нижняя панель с кнопками */}
            <rect x="100" y="560" width="400" height="150" rx="15" fill="#34495e" stroke="#FFD700" strokeWidth="2" />

            {/* Кнопка SPIN */}
            <circle 
              cx="300" 
              cy="635" 
              r="50" 
              fill={isSpinning ? "#8B0000" : "#C41E3A"} 
              stroke="#FFD700" 
              strokeWidth="3" 
              className="spin-button"
              style={{cursor: isSpinning ? 'not-allowed' : 'pointer'}}
            />
            <text x="300" y="645" textAnchor="middle" fill="#FFD700" fontSize="24" fontWeight="bold">SPIN</text>

            {/* Декоративные элементы */}
            <text x="80" y="100" fontSize="30" fill="#FFD700" opacity="0.7">❄️</text>
            <text x="520" y="100" fontSize="30" fill="#FFD700" opacity="0.7">❄️</text>
            <text x="80" y="720" fontSize="30" fill="#FFD700" opacity="0.7">❄️</text>
            <text x="520" y="720" fontSize="30" fill="#FFD700" opacity="0.7">❄️</text>

            <circle cx="150" cy="150" r="5" fill="#FFD700" className="sparkle" />
            <circle cx="450" cy="150" r="5" fill="#FFD700" className="sparkle" />
            <circle cx="150" cy="600" r="5" fill="#FFD700" className="sparkle" />
            <circle cx="450" cy="600" r="5" fill="#FFD700" className="sparkle" />
          </svg>
        </div>

        {/* Результат игры */}
        {lastResult && (
          <div className={`game-result ${lastResult === 'win' ? 'win' : 'lose'}`}>
            {lastResult === 'win' ? (
              <>
                <h2>🎉 Вы выиграли!</h2>
                <p className="win-amount">+{winAmount} баллов</p>
                <p className="combination">{finalReels.join(' ')}</p>
              </>
            ) : (
              <>
                <h2>😔 Не повезло</h2>
                <p>Попробуйте еще раз!</p>
                <p className="combination">{finalReels.join(' ')}</p>
              </>
            )}
          </div>
        )}

        {/* Панель управления */}
        <div className="slots-controls">
          <div className="bet-section">
            <h3>Ставка</h3>
            <div className="bet-input-group">
              <input
                type="number"
                min="1"
                max={balance || 0}
                value={betAmount}
                onChange={(e) => {
                  const inputValue = e.target.value
                  if (inputValue === '') {
                    setBetAmount('')
                    return
                  }
                  const numValue = parseInt(inputValue)
                  if (!isNaN(numValue) && numValue >= 1) {
                    const clampedValue = balance > 0 ? Math.min(balance, numValue) : numValue
                    setBetAmount(clampedValue)
                  }
                }}
                onBlur={(e) => {
                  const value = parseInt(e.target.value)
                  if (isNaN(value) || value < 1) {
                    setBetAmount(1)
                  } else if (balance > 0 && value > balance) {
                    setBetAmount(balance)
                  }
                }}
                className="bet-input"
                disabled={isSpinning || !player || balance === 0}
                placeholder="Введите ставку"
              />
              <div className="quick-bet-buttons">
                <button 
                  className="quick-bet-btn"
                  onClick={() => handleQuickBet(10)}
                  disabled={isSpinning || balance < 10}
                >
                  10
                </button>
                <button 
                  className="quick-bet-btn"
                  onClick={() => handleQuickBet(25)}
                  disabled={isSpinning || balance < 25}
                >
                  25
                </button>
                <button 
                  className="quick-bet-btn"
                  onClick={() => handleQuickBet(50)}
                  disabled={isSpinning || balance < 50}
                >
                  50
                </button>
                <button 
                  className="quick-bet-btn"
                  onClick={() => handleQuickBet(100)}
                  disabled={isSpinning || balance < 100}
                >
                  100
                </button>
                <button 
                  className="quick-bet-btn"
                  onClick={() => setBetAmount(balance)}
                  disabled={isSpinning || balance === 0}
                >
                  MAX
                </button>
              </div>
            </div>
          </div>

          <div className="spin-section">
            <button
              className={`spin-button-large ${isSpinning ? 'spinning' : ''}`}
              onClick={handleSpin}
              disabled={isSpinning || !player || balance === 0 || betAmount > balance || betAmount <= 0 || (typeof betAmount === 'string' && betAmount === '')}
              style={{
                opacity: (isSpinning || !player || balance === 0 || betAmount > balance || betAmount <= 0 || (typeof betAmount === 'string' && betAmount === '')) ? 0.5 : 1,
                cursor: (isSpinning || !player || balance === 0 || betAmount > balance || betAmount <= 0 || (typeof betAmount === 'string' && betAmount === '')) ? 'not-allowed' : 'pointer'
              }}
            >
              {!player ? '⏳ Загрузка...' : isSpinning ? '🎰 Вращается...' : balance === 0 ? '💰 Нет средств' : betAmount > balance ? '⚠️ Недостаточно средств' : '🎰 КРУТИТЬ'}
            </button>
          </div>

          <div className="info-section">
            <div className="info-item">
              <span>Ставка:</span>
              <strong>{betAmount} баллов</strong>
            </div>
            <div className="info-item">
              <span>Макс. выигрыш:</span>
              <strong style={{color: '#44ff44'}}>{betAmount * 10} баллов</strong>
            </div>
          </div>

          {/* Таблица выплат */}
          <div className="payouts-table">
            <h4>Таблица выплат:</h4>
            <div className="payouts-list">
              <div className="payout-item">
                <span className="payout-combo">🎁🎁🎁</span>
                <span className="payout-mult">x10</span>
              </div>
              <div className="payout-item">
                <span className="payout-combo">❄️❄️❄️</span>
                <span className="payout-mult">x8</span>
              </div>
              <div className="payout-item">
                <span className="payout-combo">⭐⭐⭐</span>
                <span className="payout-mult">x6</span>
              </div>
              <div className="payout-item">
                <span className="payout-combo">🎄🎄🎄</span>
                <span className="payout-mult">x5</span>
              </div>
              <div className="payout-item">
                <span className="payout-combo">🔔🔔🔔</span>
                <span className="payout-mult">x4</span>
              </div>
              <div className="payout-item">
                <span className="payout-combo">🍬🍬🍬</span>
                <span className="payout-mult">x3</span>
              </div>
              <div className="payout-item">
                <span className="payout-combo">2 одинаковых</span>
                <span className="payout-mult">x0.5</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SlotsGame
