import { useState, useEffect, useRef } from 'react'
import { getSessionState, submitProgress } from '../../utils/api'
import { getPlayerToken } from '../../utils/storage'
import { SessionWebSocket } from '../../utils/websocket'
import './BlackjackMultiplayer.css'

// Масти и ранги карт
const SUITS = ['🎄', '❄️', '🎁', '⭐']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

const createDeck = () => {
  const deck = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${suit}-${rank}-${Math.random()}` })
    }
  }
  return shuffleDeck(deck)
}

const shuffleDeck = (deck) => {
  const shuffled = [...deck]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

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
  
  while (value > 21 && aces > 0) {
    value -= 10
    aces--
  }
  
  return value
}

function BlackjackMultiplayer({ player, balance, sessionCode, playerName, onBack }) {
  const [gameState, setGameState] = useState('waiting') // waiting, playing, finished
  const [players, setPlayers] = useState([])
  const [currentPlayer, setCurrentPlayer] = useState(null)
  const [readyPlayers, setReadyPlayers] = useState(new Set())
  const [isReady, setIsReady] = useState(false)
  const [currentBalance, setCurrentBalance] = useState(balance)
  
  // Игровое состояние
  const [deck, setDeck] = useState([])
  const [dealerHand, setDealerHand] = useState([])
  const [playerHands, setPlayerHands] = useState({}) // { playerId: [cards] }
  const [playerBets, setPlayerBets] = useState({}) // { playerId: betAmount }
  const [currentTurn, setCurrentTurn] = useState(null) // playerId чей ход
  const [skippedPlayers, setSkippedPlayers] = useState(new Set())
  const [gameStarted, setGameStarted] = useState(false)
  const [gameResults, setGameResults] = useState({}) // { playerId: { result, win } }
  
  const wsRef = useRef(null)

  useEffect(() => {
    loadPlayers()
    connectWebSocket()
    
    // Периодически обновляем список игроков для синхронизации
    const interval = setInterval(() => {
      loadPlayers()
    }, 1500) // Каждые 1.5 секунды для более быстрой синхронизации
    
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect()
      }
      clearInterval(interval)
    }
  }, [sessionCode])

  const loadPlayers = async () => {
    try {
      const sessionState = await getSessionState(sessionCode)
      if (sessionState.players) {
        setPlayers(sessionState.players)
        const current = sessionState.players.find(p => 
          p.name === playerName || p.token === getPlayerToken()
        )
        if (current) {
          setCurrentPlayer(current)
          setCurrentBalance(current.final_score || 0)
          // Проверяем, готов ли текущий игрок
          const currentReady = current.blackjack_ready || 
                              localStorage.getItem(`blackjack_ready_${current.id}`) === 'true' ||
                              sessionStorage.getItem(`blackjack_ready_${current.id}`) === 'true'
          if (currentReady) {
            setIsReady(true)
          }
        }
        
        // Обновляем список готовых игроков - используем комбинацию источников
        setReadyPlayers(prev => {
          const newReady = new Set(prev)
          sessionState.players.forEach(p => {
            const isReady = p.blackjack_ready || 
                          localStorage.getItem(`blackjack_ready_${p.id}`) === 'true' ||
                          sessionStorage.getItem(`blackjack_ready_${p.id}`) === 'true'
            if (isReady) {
              newReady.add(p.id)
            }
          })
          return newReady
        })
      }
    } catch (err) {
      console.error('Ошибка загрузки игроков:', err)
    }
  }

  const connectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.disconnect()
    }

    wsRef.current = new SessionWebSocket(
      sessionCode,
      handleWebSocketMessage,
      handleWebSocketError,
      () => console.log('WebSocket disconnected')
    )
    
    wsRef.current.connect()
  }

  const handleWebSocketMessage = (data) => {
    console.log('WebSocket message:', data)
    
    switch (data.type) {
      case 'ws.connected':
        // Запрашиваем обновление списка игроков
        loadPlayers()
        break
      case 'players.list':
        if (data.payload && data.payload.players) {
          const playersList = data.payload.players
          setPlayers(playersList)
          
          // Обновляем список готовых игроков из всех источников
          setReadyPlayers(prev => {
            const newReady = new Set(prev)
            playersList.forEach(p => {
              // Проверяем все возможные источники готовности
              const isReady = p.blackjack_ready || 
                            localStorage.getItem(`blackjack_ready_${p.id}`) === 'true' ||
                            sessionStorage.getItem(`blackjack_ready_${p.id}`) === 'true'
              if (isReady) {
                newReady.add(p.id)
              }
            })
            return newReady
          })
          
          // Обновляем статус текущего игрока
          const current = playersList.find(p => 
            p.name === playerName || p.token === getPlayerToken()
          )
          if (current) {
            setCurrentPlayer(current)
            const isCurrentReady = current.blackjack_ready || 
                                  localStorage.getItem(`blackjack_ready_${current.id}`) === 'true' ||
                                  sessionStorage.getItem(`blackjack_ready_${current.id}`) === 'true'
            if (isCurrentReady) {
              setIsReady(true)
            }
          }
          
          const readyCount = Array.from(readyPlayers).filter(id => 
            playersList.some(p => p.id === id)
          ).length
          console.log('📋 Обновлен список игроков. Готовых:', readyCount)
        }
        break
      case 'player.update':
        if (data.payload && data.payload.player) {
          const updatedPlayer = data.payload.player
          setPlayers(prev => prev.map(p => 
            p.id === updatedPlayer.id ? { ...updatedPlayer, blackjack_ready: updatedPlayer.blackjack_ready || localStorage.getItem(`blackjack_ready_${updatedPlayer.id}`) === 'true' } : p
          ))
          
          // Обновляем готовых игроков
          if (updatedPlayer.blackjack_ready || localStorage.getItem(`blackjack_ready_${updatedPlayer.id}`) === 'true') {
            setReadyPlayers(prev => new Set([...prev, updatedPlayer.id]))
          } else {
            setReadyPlayers(prev => {
              const newSet = new Set(prev)
              newSet.delete(updatedPlayer.id)
              return newSet
            })
          }
        }
        break
      case 'blackjack.ready':
        // Кто-то нажал "Готово" - получаем от другого клиента через бэкенд
        if (data.payload && data.payload.player_id) {
          const playerId = data.payload.player_id
          const playerName = data.payload.player_name || 'Неизвестно'
          console.log(`✅ Получено WebSocket сообщение от бэкенда: игрок ${playerName} (${playerId}) готов`)
          
          // Сохраняем в localStorage и sessionStorage для надежности
          localStorage.setItem(`blackjack_ready_${playerId}`, 'true')
          sessionStorage.setItem(`blackjack_ready_${playerId}`, 'true')
          
          // Обновляем состояние немедленно
          setReadyPlayers(prev => {
            const newSet = new Set(prev)
            newSet.add(playerId)
            console.log('📋 Обновлен список готовых:', Array.from(newSet))
            return newSet
          })
          
          setPlayers(prev => prev.map(p => 
            p.id === playerId ? { ...p, blackjack_ready: true } : p
          ))
        }
        break
      case 'game.event':
        if (data.payload && data.payload.kind === 'blackjack.start') {
          startGame(data.payload.data)
        } else if (data.payload && data.payload.kind === 'blackjack.action') {
          handleGameAction(data.payload.data)
        }
        break
    }
  }

  const handleWebSocketError = (error) => {
    console.error('WebSocket error:', error)
  }

  const sendWebSocketMessage = (type, payload) => {
    if (wsRef.current) {
      wsRef.current.send({ type, payload })
    }
  }

  const handleReady = async () => {
    if (!currentPlayer) return
    
    console.log('🎮 Игрок нажал "Готово":', currentPlayer.name, currentPlayer.id)
    
    setIsReady(true)
    const playerId = currentPlayer.id
    
    // Сохраняем в localStorage и sessionStorage для надежности
    localStorage.setItem(`blackjack_ready_${playerId}`, 'true')
    sessionStorage.setItem(`blackjack_ready_${playerId}`, 'true')
    
    // Обновляем локально
    setReadyPlayers(prev => new Set([...prev, playerId]))
    setPlayers(prev => prev.map(p => 
      p.id === playerId ? { ...p, blackjack_ready: true } : p
    ))
    
    // Отправляем через WebSocket для синхронизации с другими игроками
    // Используем существующий канал для рассылки всем клиентам
    sendWebSocketMessage('blackjack.ready', {
      player_id: playerId,
      player_name: currentPlayer.name,
      session_code: sessionCode
    })
    
    // Также отправляем обновление через players.list событие
    // И сразу обновляем список
    setTimeout(() => {
      loadPlayers()
    }, 300)
    
    // Повторяем обновление для надежности
    setTimeout(() => {
      loadPlayers()
    }, 1000)
  }

  const handleStartGame = () => {
    const readyPlayerIds = players
      .filter(p => readyPlayers.has(p.id) || p.blackjack_ready || localStorage.getItem(`blackjack_ready_${p.id}`) === 'true')
      .map(p => p.id)
    
    if (readyPlayerIds.length < 2 || readyPlayerIds.length > 4) {
      alert('Нужно от 2 до 4 готовых игроков!')
      return
    }
    
    if (!readyPlayerIds.includes(currentPlayer.id)) {
      alert('Вы должны быть готовы!')
      return
    }
    
    // Отправляем событие начала игры через WebSocket
    sendWebSocketMessage('blackjack.start', {
      session_code: sessionCode,
      ready_players: readyPlayerIds
    })
    
    // Запускаем игру для всех готовых игроков
    startGame({ ready_players: readyPlayerIds })
  }

  const startGame = (data) => {
    const readyPlayerIds = data.ready_players || Array.from(readyPlayers)
    const playingPlayers = players.filter(p => 
      readyPlayerIds.includes(p.id) || 
      readyPlayers.has(p.id) || 
      p.blackjack_ready || 
      localStorage.getItem(`blackjack_ready_${p.id}`) === 'true'
    )
    
    if (playingPlayers.length < 2 || playingPlayers.length > 4) {
      alert('Неверное количество игроков!')
      return
    }
    
    setGameState('playing')
    setGameStarted(true)
    
    // Создаем колоду и раздаем карты
    const newDeck = createDeck()
    const hands = {}
    const bets = {}
    
    // Раздаем по 2 карты каждому игроку и дилеру
    let cardIndex = 0
    
    // Первая карта дилеру
    const dealerCard1 = newDeck[cardIndex++]
    // Первая карта каждому игроку
    playingPlayers.forEach(player => {
      if (!hands[player.id]) hands[player.id] = []
      hands[player.id].push(newDeck[cardIndex++])
    })
    // Вторая карта дилеру
    const dealerCard2 = newDeck[cardIndex++]
    // Вторая карта каждому игроку
    playingPlayers.forEach(player => {
      hands[player.id].push(newDeck[cardIndex++])
    })
    
    setDealerHand([dealerCard1, dealerCard2])
    setPlayerHands(hands)
    setDeck(newDeck.slice(cardIndex))
    
    // Устанавливаем первого игрока для ставки
    setCurrentTurn(playingPlayers[0].id)
  }

  const handleGameAction = (data) => {
    // Обработка действий других игроков
    if (data.action === 'bet') {
      setPlayerBets(prev => ({
        ...prev,
        [data.player_id]: data.bet_amount
      }))
      // Переходим к следующему игроку
      moveToNextPlayer(data.player_id)
    } else if (data.action === 'hit') {
      const newCard = deck[0]
      setPlayerHands(prev => ({
        ...prev,
        [data.player_id]: [...(prev[data.player_id] || []), newCard]
      }))
      setDeck(prev => prev.slice(1))
    } else if (data.action === 'stand') {
      moveToNextPlayer(data.player_id)
    } else if (data.action === 'skip') {
      setSkippedPlayers(prev => new Set([...prev, data.player_id]))
      moveToNextPlayer(data.player_id)
    }
  }

  const moveToNextPlayer = (currentPlayerId) => {
    const readyPlayerIds = Array.from(readyPlayers)
    const currentIndex = readyPlayerIds.indexOf(currentPlayerId)
    const nextIndex = (currentIndex + 1) % readyPlayerIds.length
    setCurrentTurn(readyPlayerIds[nextIndex])
  }

  const handleBet = (betAmount) => {
    if (betAmount > currentBalance || betAmount <= 0) {
      alert('Неверная ставка!')
      return
    }
    
    if (currentTurn !== currentPlayer.id) {
      alert('Не ваш ход!')
      return
    }
    
    setPlayerBets(prev => ({
      ...prev,
      [currentPlayer.id]: betAmount
    }))
    
    setCurrentBalance(prev => prev - betAmount)
    
    sendWebSocketMessage('blackjack.action', {
      action: 'bet',
      player_id: currentPlayer.id,
      bet_amount: betAmount,
      session_code: sessionCode
    })
    
    moveToNextPlayer(currentPlayer.id)
  }

  const handleHit = () => {
    if (currentTurn !== currentPlayer.id) {
      alert('Не ваш ход!')
      return
    }
    
    if (skippedPlayers.has(currentPlayer.id)) {
      alert('Вы пропустили ход!')
      return
    }
    
    const newCard = deck[0]
    const newHand = [...(playerHands[currentPlayer.id] || []), newCard]
    
    setPlayerHands(prev => ({
      ...prev,
      [currentPlayer.id]: newHand
    }))
    setDeck(prev => prev.slice(1))
    
    sendWebSocketMessage('blackjack.action', {
      action: 'hit',
      player_id: currentPlayer.id,
      session_code: sessionCode
    })
    
    const handValue = calculateHandValue(newHand)
    if (handValue >= 21) {
      moveToNextPlayer(currentPlayer.id)
      checkAllPlayersDone()
    }
  }

  const handleStand = () => {
    if (currentTurn !== currentPlayer.id) {
      alert('Не ваш ход!')
      return
    }
    
    sendWebSocketMessage('blackjack.action', {
      action: 'stand',
      player_id: currentPlayer.id,
      session_code: sessionCode
    })
    
    moveToNextPlayer(currentPlayer.id)
    
    // Проверяем, все ли игроки закончили
    checkAllPlayersDone()
  }

  const checkAllPlayersDone = () => {
    const readyPlayerIds = Array.from(readyPlayers)
    const allDone = readyPlayerIds.every(playerId => {
      const hand = playerHands[playerId] || []
      const value = calculateHandValue(hand)
      return value >= 21 || skippedPlayers.has(playerId)
    })
    
    if (allDone) {
      // Дилер берет карты
      playDealer()
    }
  }

  const playDealer = () => {
    let newDealerHand = [...dealerHand]
    let newDeck = [...deck]
    
    // Дилер берет до 17
    const dealDealerCards = async () => {
      while (calculateHandValue(newDealerHand) < 17) {
        await new Promise(resolve => setTimeout(resolve, 600))
        newDealerHand.push(newDeck[0])
        newDeck = newDeck.slice(1)
        setDealerHand([...newDealerHand])
        setDeck([...newDeck])
      }
      
      // Рассчитываем результаты
      calculateResults(newDealerHand)
    }
    
    dealDealerCards()
  }

  const calculateResults = async (finalDealerHand) => {
    const dealerValue = calculateHandValue(finalDealerHand)
    const readyPlayerIds = Array.from(readyPlayers)
    
    for (const playerId of readyPlayerIds) {
      if (skippedPlayers.has(playerId)) continue
      
      const hand = playerHands[playerId] || []
      const playerValue = calculateHandValue(hand)
      const bet = playerBets[playerId] || 0
      
      let winMultiplier = 0
      let result = 'lose'
      
      const playerBlackjack = hand.length === 2 && playerValue === 21
      const dealerBlackjack = finalDealerHand.length === 2 && dealerValue === 21
      
      if (playerValue > 21) {
        result = 'lose'
        winMultiplier = 0
      } else if (playerBlackjack && !dealerBlackjack) {
        result = 'blackjack'
        winMultiplier = 2.5
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
      
      const winAmount = Math.floor(bet * winMultiplier)
      
      // Сохраняем результат
      setGameResults(prev => ({
        ...prev,
        [playerId]: { result, win: winAmount, bet }
      }))
      
      // Обновляем баланс на сервере
      if (playerId === currentPlayer.id && currentPlayer.token) {
        try {
          const netWin = winAmount - bet
          if (netWin !== 0) {
            await submitProgress(currentPlayer.token, 'bonus', netWin, 0, {
              game: 'blackjack_multiplayer',
              bet: bet,
              win: winAmount,
              result: result
            }, true)
          }
          
          // Обновляем баланс
          const sessionState = await getSessionState(sessionCode)
          const updatedPlayer = sessionState.players.find(p => p.id === currentPlayer.id)
          if (updatedPlayer) {
            setCurrentBalance(updatedPlayer.final_score)
          }
        } catch (err) {
          console.error('Ошибка обновления баланса:', err)
        }
      }
    }
    
    setGameState('finished')
  }

  const handleSkip = () => {
    if (currentTurn !== currentPlayer.id) {
      alert('Не ваш ход!')
      return
    }
    
    setSkippedPlayers(prev => new Set([...prev, currentPlayer.id]))
    
    sendWebSocketMessage('blackjack.action', {
      action: 'skip',
      player_id: currentPlayer.id,
      session_code: sessionCode
    })
    
    moveToNextPlayer(currentPlayer.id)
  }

  // Подсчитываем готовых игроков - проверяем все источники
  const readyCount = players.filter(p => {
    return readyPlayers.has(p.id) || 
           p.blackjack_ready || 
           localStorage.getItem(`blackjack_ready_${p.id}`) === 'true' ||
           sessionStorage.getItem(`blackjack_ready_${p.id}`) === 'true'
  }).length
  
  // Кнопка "Начать" видна всем готовым игрокам, если готово 2-4 игрока
  const canStart = readyCount >= 2 && readyCount <= 4 && readyPlayers.has(currentPlayer?.id) && isReady

  if (gameState === 'waiting') {
    return (
      <div className="blackjack-multiplayer">
        <div className="blackjack-multiplayer-header">
          <h1>👥 Мультиплеерный блэкджек</h1>
          {currentPlayer && (
            <div className="player-info">
              <div className="player-name">{currentPlayer.name}</div>
              <div className="player-balance">Баланс: <strong>{currentBalance}</strong> баллов</div>
            </div>
          )}
          <button className="back-button" onClick={onBack}>
            ← Назад
          </button>
        </div>

        <div className="waiting-room">
          <h2>Ожидание игроков</h2>
          <p className="info-text">От 2 до 4 игроков могут играть одновременно</p>
          
          <div className="players-list">
            {players.map((p) => {
              const playerIsReady = readyPlayers.has(p.id) || 
                                   p.blackjack_ready || 
                                   localStorage.getItem(`blackjack_ready_${p.id}`) === 'true' ||
                                   sessionStorage.getItem(`blackjack_ready_${p.id}`) === 'true'
              const isCurrentPlayer = p.id === currentPlayer?.id
              
              return (
                <div 
                  key={p.id} 
                  className={`player-card ${isCurrentPlayer ? 'current-player' : ''} ${playerIsReady ? 'ready' : ''}`}
                >
                  <div className="player-card-header">
                    <div className="player-name">{p.name}</div>
                    {playerIsReady && <span className="ready-badge">✓ Готов</span>}
                  </div>
                  <div className="player-balance">Баланс: {p.final_score || 0} баллов</div>
                  {isCurrentPlayer && !playerIsReady && (
                    <button className="ready-button" onClick={handleReady}>
                      Играть
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="ready-info">
            <p>Готовых игроков: <strong>{readyCount}</strong> / {players.length}</p>
            {readyCount > 0 && (
              <div className="ready-players-list">
                <p>Готовы к игре:</p>
                <div className="ready-names">
                  {players
                    .filter(p => {
                      return readyPlayers.has(p.id) || 
                             p.blackjack_ready || 
                             localStorage.getItem(`blackjack_ready_${p.id}`) === 'true' ||
                             sessionStorage.getItem(`blackjack_ready_${p.id}`) === 'true'
                    })
                    .map(p => (
                      <span key={p.id} className="ready-name">{p.name}</span>
                    ))
                  }
                </div>
              </div>
            )}
            {canStart && (
              <button className="start-game-button" onClick={handleStartGame}>
                Начать игру
              </button>
            )}
            {readyCount < 2 && readyCount > 0 && (
              <p className="wait-message">Ожидаем еще {2 - readyCount} игрока(ов)...</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Игровой стол
  const playingPlayers = players.filter(p => readyPlayers.has(p.id) || p.blackjack_ready)
  const myHand = playerHands[currentPlayer?.id] || []
  const myBet = playerBets[currentPlayer?.id] || 0
  const isMyTurn = currentTurn === currentPlayer?.id
  const isSkipped = skippedPlayers.has(currentPlayer?.id)

  return (
    <div className="blackjack-multiplayer-game">
      <div className="game-header">
        <h1>🃏 Мультиплеерный блэкджек</h1>
        <div className="player-info">
          <div className="player-name">{currentPlayer?.name}</div>
          <div className="player-balance">Баланс: <strong>{currentBalance}</strong> баллов</div>
        </div>
        <button className="back-button" onClick={onBack}>
          ← Назад
        </button>
      </div>

      <div className="game-table-container">
        <svg
          className="blackjack-table"
          viewBox="0 0 1200 800"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="feltGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{stopColor: '#1a5f3f', stopOpacity: 1}} />
              <stop offset="50%" style={{stopColor: '#0f5132', stopOpacity: 1}} />
              <stop offset="100%" style={{stopColor: '#0a3d24', stopOpacity: 1}} />
            </linearGradient>
          </defs>

          {/* Стол */}
          <ellipse cx="600" cy="400" rx="550" ry="350" fill="url(#feltGradient)" stroke="#FFD700" strokeWidth="5" />

          {/* Дилер */}
          <g className="dealer-area">
            <circle cx="600" cy="200" r="60" fill="#8B4513" stroke="#FFD700" strokeWidth="4" />
            <text x="600" y="215" textAnchor="middle" fontSize="45" fill="#fff">🎅</text>
            <text x="600" y="280" textAnchor="middle" fontSize="20" fill="#FFD700" fontWeight="bold">Дилер</text>
            {dealerHand.length > 0 && (
              <text x="600" y="300" textAnchor="middle" fontSize="18" fill="#fff">
                {calculateHandValue(dealerHand)}
              </text>
            )}
          </g>

          {/* Карты дилера */}
          <g className="dealer-cards">
            {dealerHand.map((card, index) => (
              <g key={card.id} transform={`translate(${500 + index * 100}, 120)`}>
                <rect x="0" y="0" width="90" height="125" rx="10" fill="#fff" stroke="#000" strokeWidth="3" />
                <text x="15" y="28" fontSize="18" fill={card.suit === '🎄' || card.suit === '❄️' ? '#2c3e50' : '#c00'} fontWeight="bold">
                  {card.rank}
                </text>
                <text x="15" y="48" fontSize="24">{card.suit}</text>
                <text x="75" y="115" fontSize="18" fill={card.suit === '🎄' || card.suit === '❄️' ? '#2c3e50' : '#c00'} fontWeight="bold" textAnchor="end">
                  {card.rank}
                </text>
                <text x="75" y="95" fontSize="24" textAnchor="end">{card.suit}</text>
                <text x="45" y="72" fontSize="36" textAnchor="middle">{card.suit}</text>
              </g>
            ))}
          </g>

          {/* Текущий игрок (внизу по центру) */}
          {currentPlayer && (
            <g className="current-player-area">
              <circle cx="600" cy="600" r="60" fill="#1e3a5f" stroke={isMyTurn ? "#44ff44" : "#FFD700"} strokeWidth="4" />
              <text x="600" y="615" textAnchor="middle" fontSize="45" fill="#fff">👤</text>
              <text x="600" y="680" textAnchor="middle" fontSize="20" fill="#FFD700" fontWeight="bold">
                {currentPlayer.name} {isMyTurn && !isSkipped ? '(Ваш ход)' : isSkipped ? '(Пропущено)' : ''}
              </text>
              {myHand.length > 0 && (
                <text x="600" y="700" textAnchor="middle" fontSize="18" fill="#fff">
                  {calculateHandValue(myHand)} очков
                </text>
              )}
            </g>
          )}

          {/* Карты текущего игрока */}
          <g className="current-player-cards">
            {myHand.map((card, index) => (
              <g key={card.id} transform={`translate(${500 + index * 100}, 520)`}>
                <rect x="0" y="0" width="90" height="125" rx="10" fill="#fff" stroke="#000" strokeWidth="3" />
                <text x="15" y="28" fontSize="18" fill={card.suit === '🎄' || card.suit === '❄️' ? '#2c3e50' : '#c00'} fontWeight="bold">
                  {card.rank}
                </text>
                <text x="15" y="48" fontSize="24">{card.suit}</text>
                <text x="75" y="115" fontSize="18" fill={card.suit === '🎄' || card.suit === '❄️' ? '#2c3e50' : '#c00'} fontWeight="bold" textAnchor="end">
                  {card.rank}
                </text>
                <text x="75" y="95" fontSize="24" textAnchor="end">{card.suit}</text>
                <text x="45" y="72" fontSize="36" textAnchor="middle">{card.suit}</text>
              </g>
            ))}
          </g>

          {/* Остальные игроки (справа) */}
          <g className="other-players">
            {playingPlayers
              .filter(p => p.id !== currentPlayer?.id)
              .map((p, index) => {
                const hand = playerHands[p.id] || []
                const bet = playerBets[p.id] || 0
                const isTurn = currentTurn === p.id
                const isSkipped = skippedPlayers.has(p.id)
                
                return (
                  <g key={p.id} transform={`translate(950, ${150 + index * 150})`}>
                    <circle cx="0" cy="0" r="40" fill="#34495e" stroke={isTurn ? "#44ff44" : "#FFD700"} strokeWidth="3" />
                    <text x="0" y="10" textAnchor="middle" fontSize="30" fill="#fff">👤</text>
                    <text x="0" y="60" textAnchor="middle" fontSize="14" fill="#FFD700" fontWeight="bold">
                      {p.name}
                    </text>
                    {isTurn && !isSkipped && (
                      <text x="0" y="75" textAnchor="middle" fontSize="12" fill="#44ff44">Ход</text>
                    )}
                    {isSkipped && (
                      <text x="0" y="75" textAnchor="middle" fontSize="12" fill="#ff4444">Пропущено</text>
                    )}
                    {hand.length > 0 && (
                      <text x="0" y="90" textAnchor="middle" fontSize="12" fill="#fff">
                        {calculateHandValue(hand)} очков
                      </text>
                    )}
                    {bet > 0 && (
                      <text x="0" y="105" textAnchor="middle" fontSize="11" fill="#FFD700">
                        Ставка: {bet}
                      </text>
                    )}
                  </g>
                )
              })}
          </g>
        </svg>
      </div>

      {/* Панель управления */}
      <div className="game-controls">
        {!myBet && isMyTurn && !isSkipped && (
          <div className="bet-section">
            <h3>Сделайте ставку</h3>
            <div className="quick-bet-buttons">
              <button onClick={() => handleBet(10)} disabled={currentBalance < 10}>10</button>
              <button onClick={() => handleBet(25)} disabled={currentBalance < 25}>25</button>
              <button onClick={() => handleBet(50)} disabled={currentBalance < 50}>50</button>
              <button onClick={() => handleBet(100)} disabled={currentBalance < 100}>100</button>
            </div>
            <button className="skip-button" onClick={handleSkip}>
              Пропустить ход
            </button>
          </div>
        )}

        {myBet > 0 && isMyTurn && !isSkipped && (
          <div className="action-buttons">
            <button className="hit-btn" onClick={handleHit}>
              Взять карту
            </button>
            <button className="stand-btn" onClick={handleStand}>
              Остановиться
            </button>
          </div>
        )}

        {isSkipped && (
          <div className="skipped-message">
            <p>Вы пропустили ход. Ожидайте окончания игры.</p>
          </div>
        )}

        {!isMyTurn && !isSkipped && (
          <div className="wait-turn-message">
            <p>Ожидайте своего хода...</p>
            <p>Ход игрока: {playingPlayers.find(p => p.id === currentTurn)?.name || 'Неизвестно'}</p>
          </div>
        )}
      </div>

      {gameState === 'finished' && (
        <div className="game-results">
          <h2>Результаты игры</h2>
          <div className="results-list">
            {playingPlayers.map(p => {
              const result = gameResults[p.id]
              const hand = playerHands[p.id] || []
              const handValue = calculateHandValue(hand)
              
              return (
                <div key={p.id} className={`result-card ${result?.result || 'lose'}`}>
                  <div className="result-player-name">{p.name}</div>
                  <div className="result-hand-value">{handValue} очков</div>
                  {result && (
                    <>
                      <div className={`result-status ${result.result}`}>
                        {result.result === 'win' && '🎉 Выигрыш!'}
                        {result.result === 'lose' && '😔 Проигрыш'}
                        {result.result === 'push' && '🤝 Ничья'}
                        {result.result === 'blackjack' && '🃏 Блэкджек!'}
                      </div>
                      <div className="result-win">
                        {result.win > 0 ? `+${result.win}` : '0'} баллов
                      </div>
                    </>
                  )}
                </div>
              )
            })}
            <div className="result-card dealer-result">
              <div className="result-player-name">Дилер</div>
              <div className="result-hand-value">{calculateHandValue(dealerHand)} очков</div>
            </div>
          </div>
          <button className="new-game-button" onClick={() => {
            setGameState('waiting')
            setGameStarted(false)
            setPlayerHands({})
            setPlayerBets({})
            setDealerHand([])
            setCurrentTurn(null)
            setSkippedPlayers(new Set())
            setGameResults({})
            setIsReady(false)
            setReadyPlayers(new Set())
            // Очищаем localStorage готовности
            players.forEach(p => {
              localStorage.removeItem(`blackjack_ready_${p.id}`)
            })
          }}>
            Новая игра
          </button>
        </div>
      )}
    </div>
  )
}

export default BlackjackMultiplayer
