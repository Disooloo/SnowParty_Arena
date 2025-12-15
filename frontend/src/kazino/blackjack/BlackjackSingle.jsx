import { useState, useEffect } from 'react'
import { getSessionState, submitProgress } from '../../utils/api'
import { getPlayerToken } from '../../utils/storage'
import './BlackjackSingle.css'

// Масти карт (новогодние)
const SUITS = ['🎄', '❄️', '🎁', '⭐'] // Елка, Снежинка, Подарок, Звезда
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

// Создание колоды
const createDeck = () => {
  const deck = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${suit}-${rank}-${Math.random()}` })
    }
  }
  return shuffleDeck(deck)
}

// Перемешивание колоды
const shuffleDeck = (deck) => {
  const shuffled = [...deck]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Подсчет очков в руке
const calculateHandValue = (hand) => {
  let value = 0
  let aces = 0
  
  for (const card of hand) {
    if (card.rank === 'A') {
      aces++
      value += 11
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      value += 10
    } else {
      value += parseInt(card.rank)
    }
  }
  
  // Обработка тузов
  while (value > 21 && aces > 0) {
    value -= 10
    aces--
  }
  
  return value
}

function BlackjackSingle({ player, balance, sessionCode, playerName, onBack }) {
  const [deck, setDeck] = useState([])
  const [playerHand, setPlayerHand] = useState([])
  const [dealerHand, setDealerHand] = useState([])
  const [gameState, setGameState] = useState('betting') // betting, playing, dealerTurn, finished
  const [betAmount, setBetAmount] = useState(10)
  const [currentBalance, setCurrentBalance] = useState(balance)
  const [gameResult, setGameResult] = useState(null) // win, lose, push, blackjack
  const [dealerHidden, setDealerHidden] = useState(true)
  const [canDouble, setCanDouble] = useState(false)
  const [dealingCards, setDealingCards] = useState(false) // Флаг анимации раздачи
  const [visiblePlayerCards, setVisiblePlayerCards] = useState([]) // Видимые карты игрока
  const [visibleDealerCards, setVisibleDealerCards] = useState([]) // Видимые карты дилера

  useEffect(() => {
    setCurrentBalance(balance)
  }, [balance])

  // Начало новой игры
  const startNewGame = async () => {
    if (betAmount > currentBalance || betAmount <= 0) {
      alert('Недостаточно средств или неверная ставка!')
      return
    }

    const newDeck = createDeck()
    setDeck(newDeck)
    
    // Очищаем видимые карты
    setVisiblePlayerCards([])
    setVisibleDealerCards([])
    setPlayerHand([])
    setDealerHand([])
    setDealerHidden(true)
    setGameResult(null)
    setCanDouble(true)
    setDealingCards(true)
    
    // Списываем ставку
    setCurrentBalance(prev => prev - betAmount)
    
    // Раздача начальных карт с анимацией
    const playerCards = [newDeck[0], newDeck[2]]
    const dealerCards = [newDeck[1], newDeck[3]]
    
    // Раздаем первую карту дилеру
    await new Promise(resolve => setTimeout(resolve, 300))
    setVisibleDealerCards([dealerCards[0]])
    setDealerHand([dealerCards[0]])
    
    // Раздаем первую карту игроку
    await new Promise(resolve => setTimeout(resolve, 400))
    setVisiblePlayerCards([playerCards[0]])
    setPlayerHand([playerCards[0]])
    
    // Раздаем вторую карту дилеру (рубашкой вверх)
    await new Promise(resolve => setTimeout(resolve, 400))
    setVisibleDealerCards([dealerCards[0], dealerCards[1]])
    setDealerHand(dealerCards)
    
    // Раздаем вторую карту игроку
    await new Promise(resolve => setTimeout(resolve, 400))
    setVisiblePlayerCards(playerCards)
    setPlayerHand(playerCards)
    
    setDeck(newDeck.slice(4))
    setDealingCards(false)
    setGameState('playing')
    
    // Проверяем блэкджек у игрока
    const playerValue = calculateHandValue(playerCards)
    if (playerValue === 21) {
      // Автоматически проверяем дилера
      setTimeout(() => {
        setDealerHidden(false)
        const dealerValue = calculateHandValue(dealerCards)
        if (dealerValue === 21) {
          endGame('push', 1)
        } else {
          endGame('blackjack', 2.5)
        }
      }, 1000)
    }
  }

  // Взять карту (Hit)
  const hit = async () => {
    if (gameState !== 'playing') return
    
    setDealingCards(true)
    const newCard = deck[0]
    
    // Анимация раздачи карты
    await new Promise(resolve => setTimeout(resolve, 400))
    
    const newPlayerHand = [...playerHand, newCard]
    setPlayerHand(newPlayerHand)
    setVisiblePlayerCards(newPlayerHand)
    setDeck(deck.slice(1))
    setCanDouble(false)
    setDealingCards(false)
    
    const playerValue = calculateHandValue(newPlayerHand)
    
    if (playerValue > 21) {
      // Перебор
      endGame('lose')
    } else if (playerValue === 21) {
      // Автоматически стэнд при 21
      stand()
    }
  }

  // Остановиться (Stand)
  const stand = () => {
    if (gameState !== 'playing') return
    
    setGameState('dealerTurn')
    setDealerHidden(false)
    
    // Дилер берет карты до 17 с анимацией
    let newDealerHand = [...dealerHand]
    let newDeck = [...deck]
    let newVisibleDealerCards = [...visibleDealerCards]
    
    const dealDealerCards = async () => {
      while (calculateHandValue(newDealerHand) < 17) {
        await new Promise(resolve => setTimeout(resolve, 600))
        newDealerHand.push(newDeck[0])
        newVisibleDealerCards.push(newDeck[0])
        newDeck = newDeck.slice(1)
        setDealerHand([...newDealerHand])
        setVisibleDealerCards([...newVisibleDealerCards])
        setDeck([...newDeck])
      }
      
      // Определяем результат
      setTimeout(() => {
        determineWinner(newDealerHand)
      }, 500)
    }
    
    dealDealerCards()
  }

  // Удвоить ставку (Double)
  const doubleDown = async () => {
    if (!canDouble || betAmount * 2 > currentBalance + betAmount) {
      alert('Недостаточно средств для удвоения!')
      return
    }
    
    setDealingCards(true)
    const newCard = deck[0]
    
    // Анимация раздачи карты
    await new Promise(resolve => setTimeout(resolve, 400))
    
    const newPlayerHand = [...playerHand, newCard]
    setPlayerHand(newPlayerHand)
    setVisiblePlayerCards(newPlayerHand)
    setDeck(deck.slice(1))
    setCanDouble(false)
    setDealingCards(false)
    
    // Удваиваем ставку (списываем еще одну ставку)
    setCurrentBalance(prev => prev - betAmount)
    const newBetAmount = betAmount * 2
    
    const playerValue = calculateHandValue(newPlayerHand)
    
    if (playerValue > 21) {
      // Сохраняем новую ставку для расчета выигрыша
      setBetAmount(newBetAmount)
      endGame('lose', 0)
    } else {
      // Сохраняем новую ставку и автоматически стэнд
      setBetAmount(newBetAmount)
      stand()
    }
  }

  // Определение победителя
  const determineWinner = (finalDealerHand) => {
    const playerValue = calculateHandValue(playerHand)
    const dealerValue = calculateHandValue(finalDealerHand)
    
    const playerBlackjack = playerHand.length === 2 && playerValue === 21
    const dealerBlackjack = finalDealerHand.length === 2 && dealerValue === 21
    
    let result = 'lose'
    let winMultiplier = 0
    
    if (playerBlackjack && !dealerBlackjack) {
      result = 'blackjack'
      winMultiplier = 2.5 // Блэкджек платит 3:2
    } else if (dealerBlackjack && !playerBlackjack) {
      result = 'lose'
      winMultiplier = 0
    } else if (dealerValue > 21) {
      result = 'win'
      winMultiplier = 2
    } else if (playerValue > dealerValue) {
      result = 'win'
      winMultiplier = 2
    } else if (playerValue === dealerValue) {
      result = 'push'
      winMultiplier = 1
    }
    
    endGame(result, winMultiplier)
  }

  // Завершение игры
  const endGame = async (result, winMultiplier = 0) => {
    setGameState('finished')
    setGameResult(result)
    
    const winAmount = Math.floor(betAmount * winMultiplier)
    const finalBetAmount = betAmount // Сохраняем текущую ставку
    
    if (winAmount > 0) {
      setCurrentBalance(prev => prev + winAmount)
    }
    
    // Обновляем баланс на сервере
    if (player?.token && sessionCode) {
      try {
        const netWin = winAmount - finalBetAmount
        if (netWin !== 0) {
          await submitProgress(player.token, 'bonus', netWin, 0, {
            game: 'blackjack',
            bet: finalBetAmount,
            win: winAmount,
            result: result
          }, true)
        }
        
        // Обновляем данные игрока
        const sessionState = await getSessionState(sessionCode)
        const updatedPlayer = sessionState.players.find(p => p.token === player.token)
        if (updatedPlayer) {
          setCurrentBalance(updatedPlayer.final_score)
        }
      } catch (err) {
        console.error('❌ Ошибка обновления баланса:', err)
      }
    }
  }

  const playerValue = calculateHandValue(playerHand)
  const dealerValue = calculateHandValue(dealerHand)

  return (
    <div className="blackjack-single">
      <div className="blackjack-single-header">
        <h1>🃏 Блэкджек</h1>
        {player && (
          <div className="player-info">
            <div className="player-name">{player.name}</div>
            <div className="player-balance">Баланс: <strong>{currentBalance}</strong> баллов</div>
          </div>
        )}
        <button className="back-button" onClick={onBack}>
          ← Назад
        </button>
      </div>

      <div className="blackjack-table-container">
        {/* SVG Стол */}
        <svg
          className="blackjack-table"
          viewBox="0 0 1000 700"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="tableGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{stopColor: '#0f5132', stopOpacity: 1}} />
              <stop offset="100%" style={{stopColor: '#0a3d24', stopOpacity: 1}} />
            </linearGradient>
            <linearGradient id="feltGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{stopColor: '#1a5f3f', stopOpacity: 1}} />
              <stop offset="50%" style={{stopColor: '#0f5132', stopOpacity: 1}} />
              <stop offset="100%" style={{stopColor: '#0a3d24', stopOpacity: 1}} />
            </linearGradient>
            <pattern id="feltPattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="1" fill="#0f5132" opacity="0.1"/>
            </pattern>
            <filter id="tableShadow">
              <feGaussianBlur in="SourceAlpha" stdDeviation="5"/>
              <feOffset dx="0" dy="5" result="offsetblur"/>
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.3"/>
              </feComponentTransfer>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Основание стола */}
          <ellipse cx="500" cy="650" rx="450" ry="40" fill="#2c1810" opacity="0.8" />
          
          {/* Игровое поле */}
          <ellipse 
            cx="500" 
            cy="350" 
            rx="480" 
            ry="280" 
            fill="url(#feltGradient)" 
            fillOpacity="0.95"
            stroke="#FFD700" 
            strokeWidth="5"
            filter="url(#tableShadow)"
            className="table-felt"
          />
          <ellipse 
            cx="500" 
            cy="350" 
            rx="480" 
            ry="280" 
            fill="url(#feltPattern)" 
            opacity="0.3"
          />
          
          {/* Дилер */}
          <g className="dealer-area">
            <defs>
              <radialGradient id="dealerGradient" cx="50%" cy="50%">
                <stop offset="0%" style={{stopColor: '#A0522D', stopOpacity: 1}} />
                <stop offset="100%" style={{stopColor: '#8B4513', stopOpacity: 1}} />
              </radialGradient>
              <filter id="dealerShadow">
                <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
                <feOffset dx="0" dy="3" result="offsetblur"/>
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.5"/>
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <circle 
              cx="500" 
              cy="200" 
              r="65" 
              fill="url(#dealerGradient)" 
              stroke="#FFD700" 
              strokeWidth="4"
              filter="url(#dealerShadow)"
              className="dealer-avatar"
            />
            <text x="500" y="215" textAnchor="middle" fontSize="45" fill="#fff" className="dealer-emoji">🎅</text>
            <text x="500" y="285" textAnchor="middle" fontSize="22" fill="#FFD700" fontWeight="bold" className="dealer-label">Дилер</text>
            {gameState !== 'betting' && dealerHand.length > 0 && (
              <g className="dealer-score">
                <rect x="470" y="295" width="60" height="25" rx="12" fill="rgba(0, 0, 0, 0.7)" />
                <text x="500" y="312" textAnchor="middle" fontSize="18" fill="#fff" fontWeight="bold" className="score-value">
                  {dealerHidden && visibleDealerCards.length === 1 ? '?' : calculateHandValue(visibleDealerCards)}
                </text>
              </g>
            )}
          </g>

          {/* Игрок */}
          <g className="player-area">
            <defs>
              <radialGradient id="playerGradient" cx="50%" cy="50%">
                <stop offset="0%" style={{stopColor: '#2c5282', stopOpacity: 1}} />
                <stop offset="100%" style={{stopColor: '#1e3a5f', stopOpacity: 1}} />
              </radialGradient>
              <filter id="playerShadow">
                <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
                <feOffset dx="0" dy="3" result="offsetblur"/>
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.5"/>
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <circle 
              cx="500" 
              cy="500" 
              r="65" 
              fill="url(#playerGradient)" 
              stroke="#FFD700" 
              strokeWidth="4"
              filter="url(#playerShadow)"
              className="player-avatar"
            />
            <text x="500" y="515" textAnchor="middle" fontSize="45" fill="#fff" className="player-emoji">👤</text>
            <text x="500" y="585" textAnchor="middle" fontSize="22" fill="#FFD700" fontWeight="bold" className="player-label">
              {player?.name || 'Игрок'}
            </text>
            {gameState !== 'betting' && playerHand.length > 0 && (
              <g className="player-score">
                <rect x="470" y="595" width="60" height="25" rx="12" fill="rgba(0, 0, 0, 0.7)" />
                <text x="500" y="612" textAnchor="middle" fontSize="18" fill="#fff" fontWeight="bold" className="score-value">
                  {calculateHandValue(visiblePlayerCards)}
                </text>
              </g>
            )}
          </g>

          {/* Колода карт */}
          {gameState !== 'betting' && (
            <g className="deck-area">
              <defs>
                <linearGradient id="deckGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor: '#1a237e', stopOpacity: 1}} />
                  <stop offset="50%" style={{stopColor: '#283593', stopOpacity: 1}} />
                  <stop offset="100%" style={{stopColor: '#0d47a1', stopOpacity: 1}} />
                </linearGradient>
                <filter id="deckShadow">
                  <feGaussianBlur in="SourceAlpha" stdDeviation="4"/>
                  <feOffset dx="3" dy="5" result="offsetblur"/>
                  <feComponentTransfer>
                    <feFuncA type="linear" slope="0.6"/>
                  </feComponentTransfer>
                  <feMerge>
                    <feMergeNode/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              {/* Несколько карт для эффекта колоды */}
              {[0, 1, 2].map((i) => (
                <rect
                  key={`deck-${i}`}
                  x={150 + i * 2}
                  y={300 + i * 2}
                  width="90"
                  height="125"
                  rx="10"
                  fill="url(#deckGradient)"
                  stroke="#FFD700"
                  strokeWidth="3"
                  filter="url(#deckShadow)"
                  opacity={1 - i * 0.2}
                  className="deck-card"
                />
              ))}
              <text x="195" y="365" fontSize="40" textAnchor="middle" fill="#FFD700" opacity="0.4">🎴</text>
            </g>
          )}

          {/* Карты дилера */}
          <g className="dealer-cards">
            {dealerHand.map((card, index) => {
              // Показываем карту, если она видима или дилер открыт
              const isVisible = index < visibleDealerCards.length || !dealerHidden || gameState === 'finished' || gameState === 'dealerTurn'
              if (!isVisible) return null
              const cardId = `dealer-${card.id}`
              const backGradId = `cardBackGrad-${cardId}`
              const cardShadowId = `cardShadow-${cardId}`
              const cardGradId = `cardGrad-${cardId}`
              const cardFaceShadowId = `cardFaceShadow-${cardId}`
              
              const finalX = 350 + index * 100
              const finalY = 120
              const deckX = 195 // Центр колоды
              const deckY = 362.5 // Центр колоды
              
              return (
                <g 
                  key={card.id} 
                  className={`card dealer-card card-${index} ${index === visibleDealerCards.length - 1 ? 'new-card' : ''}`}
                  style={{
                    animationDelay: index === visibleDealerCards.length - 1 ? '0s' : `${index * 0.2}s`,
                    '--final-x': `${finalX}px`,
                    '--final-y': `${finalY}px`,
                    '--deck-x': `${deckX}px`,
                    '--deck-y': `${deckY}px`,
                    transform: `translate(${finalX}, ${finalY})`
                  }}
                >
                  {dealerHidden && index === 1 ? (
                    // Рубашка карты
                    <>
                      <defs>
                        <linearGradient id={backGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" style={{stopColor: '#1a237e', stopOpacity: 1}} />
                          <stop offset="50%" style={{stopColor: '#283593', stopOpacity: 1}} />
                          <stop offset="100%" style={{stopColor: '#0d47a1', stopOpacity: 1}} />
                        </linearGradient>
                        <filter id={cardShadowId}>
                          <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
                          <feOffset dx="2" dy="4" result="offsetblur"/>
                          <feComponentTransfer>
                            <feFuncA type="linear" slope="0.5"/>
                          </feComponentTransfer>
                          <feMerge>
                            <feMergeNode/>
                            <feMergeNode in="SourceGraphic"/>
                          </feMerge>
                        </filter>
                      </defs>
                      <rect 
                        x="0" 
                        y="0" 
                        width="90" 
                        height="125" 
                        rx="10" 
                        fill={`url(#${backGradId})`}
                        stroke="#FFD700" 
                        strokeWidth="3"
                        filter={`url(#${cardShadowId})`}
                        className="card-back"
                      />
                      <text x="45" y="70" fontSize="40" textAnchor="middle" fill="#FFD700" opacity="0.3">🎴</text>
                    </>
                  ) : (
                    // Лицевая сторона
                    <>
                      <defs>
                        <linearGradient id={cardGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" style={{stopColor: '#ffffff', stopOpacity: 1}} />
                          <stop offset="100%" style={{stopColor: '#f5f5f5', stopOpacity: 1}} />
                        </linearGradient>
                        <filter id={cardFaceShadowId}>
                          <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
                          <feOffset dx="2" dy="3" result="offsetblur"/>
                          <feComponentTransfer>
                            <feFuncA type="linear" slope="0.4"/>
                          </feComponentTransfer>
                          <feMerge>
                            <feMergeNode/>
                            <feMergeNode in="SourceGraphic"/>
                          </feMerge>
                        </filter>
                      </defs>
                      <rect 
                        x="0" 
                        y="0" 
                        width="90" 
                        height="125" 
                        rx="10" 
                        fill={`url(#${cardGradId})`}
                        stroke={card.suit === '🎄' || card.suit === '❄️' ? '#2c3e50' : '#c00'} 
                        strokeWidth="3"
                        filter={`url(#${cardFaceShadowId})`}
                        className="card-face"
                      />
                      <text 
                        x="15" 
                        y="28" 
                        fontSize="18" 
                        fill={card.suit === '🎄' || card.suit === '❄️' ? '#2c3e50' : '#c00'} 
                        fontWeight="bold"
                        className="card-rank-top"
                      >
                        {card.rank}
                      </text>
                      <text 
                        x="15" 
                        y="48" 
                        fontSize="24"
                        className="card-suit-top"
                      >
                        {card.suit}
                      </text>
                      <text 
                        x="75" 
                        y="115" 
                        fontSize="18" 
                        fill={card.suit === '🎄' || card.suit === '❄️' ? '#2c3e50' : '#c00'} 
                        fontWeight="bold" 
                        textAnchor="end"
                        className="card-rank-bottom"
                      >
                        {card.rank}
                      </text>
                      <text 
                        x="75" 
                        y="95" 
                        fontSize="24" 
                        textAnchor="end"
                        className="card-suit-bottom"
                      >
                        {card.suit}
                      </text>
                      <text 
                        x="45" 
                        y="72" 
                        fontSize="36" 
                        textAnchor="middle"
                        className="card-suit-center"
                      >
                        {card.suit}
                    </text>
                  </>
                )}
              </g>
              )
            })}
          </g>

          {/* Карты игрока */}
          <g className="player-cards">
            {playerHand.map((card, index) => {
              // Показываем карту, если она видима
              const isVisible = index < visiblePlayerCards.length || gameState === 'finished'
              if (!isVisible) return null
              const cardId = `player-${card.id}`
              const playerCardGradId = `playerCardGrad-${cardId}`
              const playerCardShadowId = `playerCardShadow-${cardId}`
              
              const finalX = 350 + index * 100
              const finalY = 420
              const deckX = 195 // Центр колоды
              const deckY = 362.5 // Центр колоды
              
              return (
                <g 
                  key={card.id} 
                  className={`card player-card card-${index} ${index === visiblePlayerCards.length - 1 ? 'new-card' : ''}`}
                  style={{
                    animationDelay: index === visiblePlayerCards.length - 1 ? '0s' : `${(index + 2) * 0.2}s`,
                    '--final-x': `${finalX}px`,
                    '--final-y': `${finalY}px`,
                    '--deck-x': `${deckX}px`,
                    '--deck-y': `${deckY}px`,
                    transform: `translate(${finalX}, ${finalY})`
                  }}
                >
                  <defs>
                    <linearGradient id={playerCardGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style={{stopColor: '#ffffff', stopOpacity: 1}} />
                      <stop offset="100%" style={{stopColor: '#f5f5f5', stopOpacity: 1}} />
                    </linearGradient>
                    <filter id={playerCardShadowId}>
                      <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
                      <feOffset dx="2" dy="3" result="offsetblur"/>
                      <feComponentTransfer>
                        <feFuncA type="linear" slope="0.4"/>
                      </feComponentTransfer>
                      <feMerge>
                        <feMergeNode/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  <rect 
                    x="0" 
                    y="0" 
                    width="90" 
                    height="125" 
                    rx="10" 
                    fill={`url(#${playerCardGradId})`}
                    stroke={card.suit === '🎄' || card.suit === '❄️' ? '#2c3e50' : '#c00'} 
                    strokeWidth="3"
                    filter={`url(#${playerCardShadowId})`}
                    className="card-face player-card-face"
                  />
                  <text 
                    x="15" 
                    y="28" 
                    fontSize="18" 
                    fill={card.suit === '🎄' || card.suit === '❄️' ? '#2c3e50' : '#c00'} 
                    fontWeight="bold"
                    className="card-rank-top"
                  >
                    {card.rank}
                  </text>
                  <text 
                    x="15" 
                    y="48" 
                    fontSize="24"
                    className="card-suit-top"
                  >
                    {card.suit}
                  </text>
                  <text 
                    x="75" 
                    y="115" 
                    fontSize="18" 
                    fill={card.suit === '🎄' || card.suit === '❄️' ? '#2c3e50' : '#c00'} 
                    fontWeight="bold" 
                    textAnchor="end"
                    className="card-rank-bottom"
                  >
                    {card.rank}
                  </text>
                  <text 
                    x="75" 
                    y="95" 
                    fontSize="24" 
                    textAnchor="end"
                    className="card-suit-bottom"
                  >
                    {card.suit}
                  </text>
                  <text 
                    x="45" 
                    y="72" 
                    fontSize="36" 
                    textAnchor="middle"
                    className="card-suit-center"
                  >
                    {card.suit}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      {/* Панель управления */}
      <div className="blackjack-controls">
        {gameState === 'betting' && (
          <div className="bet-section">
            <h3>Сделайте ставку</h3>
            <div className="bet-input-group">
              <input
                type="number"
                min="1"
                max={currentBalance}
                value={betAmount}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0
                  if (value >= 1 && value <= currentBalance) {
                    setBetAmount(value)
                  }
                }}
                className="bet-input"
                disabled={currentBalance === 0}
              />
              <div className="quick-bet-buttons">
                <button onClick={() => setBetAmount(10)} disabled={currentBalance < 10}>10</button>
                <button onClick={() => setBetAmount(25)} disabled={currentBalance < 25}>25</button>
                <button onClick={() => setBetAmount(50)} disabled={currentBalance < 50}>50</button>
                <button onClick={() => setBetAmount(100)} disabled={currentBalance < 100}>100</button>
                <button onClick={() => setBetAmount(currentBalance)} disabled={currentBalance === 0}>MAX</button>
              </div>
            <button 
              className="deal-button"
              onClick={startNewGame}
              disabled={betAmount > currentBalance || betAmount <= 0 || currentBalance === 0 || dealingCards}
            >
              {dealingCards ? 'Раздача...' : 'Раздать карты'}
            </button>
            </div>
          </div>
        )}

        {gameState === 'playing' && (
          <div className="action-buttons">
            <button className="action-btn hit-btn" onClick={hit}>
              Взять карту
            </button>
            <button className="action-btn stand-btn" onClick={stand}>
              Остановиться
            </button>
            <button 
              className="action-btn double-btn" 
              onClick={doubleDown}
              disabled={!canDouble || betAmount * 2 > currentBalance}
            >
              Удвоить
            </button>
          </div>
        )}

        {gameState === 'finished' && (
          <div className="game-result-section">
            <div className={`game-result ${gameResult}`}>
              {gameResult === 'win' && <h2>🎉 Вы выиграли!</h2>}
              {gameResult === 'lose' && <h2>😔 Вы проиграли</h2>}
              {gameResult === 'push' && <h2>🤝 Ничья</h2>}
              {gameResult === 'blackjack' && <h2>🃏 Блэкджек! Вы выиграли!</h2>}
            </div>
            <button className="new-game-button" onClick={() => {
              setGameState('betting')
              setPlayerHand([])
              setDealerHand([])
              setVisiblePlayerCards([])
              setVisibleDealerCards([])
              setGameResult(null)
              setDealerHidden(true)
            }}>
              Новая игра
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default BlackjackSingle
