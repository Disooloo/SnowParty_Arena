import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getSessionState } from '../../utils/api'
import { getPlayerToken, getDeviceUuid } from '../../utils/storage'
import BlackjackSingle from './BlackjackSingle'
import BlackjackMultiplayer from './BlackjackMultiplayer'
import './BlackjackGame.css'

function BlackjackGame() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionCode = searchParams.get('session')
  const playerName = searchParams.get('name')
  
  const [player, setPlayer] = useState(null)
  const [balance, setBalance] = useState(0)
  const [gameMode, setGameMode] = useState(null) // null, 'single', 'multiplayer'

  useEffect(() => {
    const loadPlayerData = async () => {
      if (!sessionCode) {
        console.warn('⚠️ Нет кода сессии')
        return
      }
      
      try {
        const sessionState = await getSessionState(sessionCode)
        
        // Проверяем наличие players
        let players = null
        if (sessionState.players && Array.isArray(sessionState.players)) {
          players = sessionState.players
        } else if (sessionState.players_list && Array.isArray(sessionState.players_list)) {
          players = sessionState.players_list
        }
        
        if (!players || players.length === 0) {
          console.warn('⚠️ Нет данных об игроках в сессии')
          return
        }
        
        // Ищем игрока по имени или токену
        let currentPlayer = null
        if (playerName) {
          currentPlayer = players.find(p => p.name === playerName)
        }
        
        // Если не найден по имени, ищем по токену
        if (!currentPlayer) {
          const playerToken = getPlayerToken()
          if (playerToken) {
            currentPlayer = players.find(p => p.token === playerToken)
          }
        }
        
        // Если все еще не найден, берем первого
        if (!currentPlayer && players.length > 0) {
          currentPlayer = players[0]
        }
         
        if (currentPlayer) {
          setPlayer({
            id: currentPlayer.id,
            name: currentPlayer.name,
            final_score: currentPlayer.final_score || 0,
            token: currentPlayer.token
          })
          setBalance(currentPlayer.final_score || 0)
        }
      } catch (err) {
        console.error('❌ Ошибка загрузки данных игрока:', err)
      }
    }
    
    loadPlayerData()
  }, [sessionCode, playerName])

  if (gameMode === 'single') {
    return (
      <BlackjackSingle 
        player={player}
        balance={balance}
        sessionCode={sessionCode}
        playerName={playerName}
        onBack={() => setGameMode(null)}
      />
    )
  }

  if (gameMode === 'multiplayer') {
    return (
      <BlackjackMultiplayer 
        player={player}
        balance={balance}
        sessionCode={sessionCode}
        playerName={playerName}
        onBack={() => setGameMode(null)}
      />
    )
  }

  return (
    <div className="blackjack-game">
      <div className="blackjack-header">
        <h1>🃏 Блэкджек</h1>
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

      <div className="game-mode-selection">
        <h2>Выберите режим игры:</h2>
        <div className="mode-buttons">
          <button 
            className="mode-button"
            onClick={() => setGameMode('single')}
          >
            <div className="mode-icon">🎮</div>
            <h3>Одиночная игра</h3>
            <p>Играйте против дилера</p>
          </button>
          <button 
            className="mode-button"
            onClick={() => setGameMode('multiplayer')}
          >
            <div className="mode-icon">👥</div>
            <h3>Мультиплеер</h3>
            <p>Играйте с другими игроками</p>
          </button>
        </div>
      </div>
    </div>
  )
}

export default BlackjackGame


