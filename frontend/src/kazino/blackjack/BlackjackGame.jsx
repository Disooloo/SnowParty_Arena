import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getSessionState } from '../../utils/api'
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
      if (!sessionCode || !playerName) return
      
      try {
        const sessionState = await getSessionState(sessionCode)
        const currentPlayer = sessionState.players.find(p => p.name === playerName)
        
        if (currentPlayer) {
          setPlayer({
            id: currentPlayer.id,
            name: currentPlayer.name,
            final_score: currentPlayer.final_score || 0
          })
          setBalance(currentPlayer.final_score || 0)
        }
      } catch (err) {
        console.error('Ошибка загрузки данных игрока:', err)
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

