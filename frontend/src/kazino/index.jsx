import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getSessionState } from '../utils/api'
import { getPlayerToken } from '../utils/storage'
import './index.css'

function KazinoIndex() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionCode = searchParams.get('session')
  const playerName = searchParams.get('name')
  
  const [player, setPlayer] = useState(null)
  const [balance, setBalance] = useState(0)

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
            final_score: currentPlayer.final_score || 0,
            role: currentPlayer.role,
            role_buff: currentPlayer.role_buff || 0
          })
          setBalance(currentPlayer.final_score || 0)
        }
      } catch (err) {
        console.error('Ошибка загрузки данных игрока:', err)
      }
    }
    
    loadPlayerData()
  }, [sessionCode, playerName])

  const handleGameSelect = (game) => {
    console.log('🎮 Выбрана игра:', game, 'sessionCode:', sessionCode, 'playerName:', playerName)
    
    if (!sessionCode) {
      console.error('❌ Нет кода сессии')
      alert('Ошибка: не указан код сессии')
      return
    }
    
    // Если нет имени игрока, используем общую ссылку
    const nameParam = playerName ? `&name=${encodeURIComponent(playerName)}` : ''
    
    switch(game) {
      case 'crash':
        if (playerName) {
          navigate(`/crash/${sessionCode}/${encodeURIComponent(playerName)}`)
        } else {
          navigate(`/crash?session=${sessionCode}`)
        }
        break
      case 'slots':
        navigate(`/kazino/slots?session=${sessionCode}${nameParam}`)
        break
      case 'blackjack':
        navigate(`/kazino/blackjack?session=${sessionCode}${nameParam}`)
        break
      default:
        console.error('❌ Неизвестная игра:', game)
        break
    }
  }
  
  // Обработчик клика для карточек игр
  const handleCardClick = (e, game) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('🖱️ Клик по карточке:', game)
    handleGameSelect(game)
  }

  return (
    <div className="kazino-index">
      <div className="kazino-header">
        <h1>🎰 Казино</h1>
        {player && (
          <div className="player-info">
            <div className="player-name">{player.name}</div>
            <div className="player-balance">Баланс: <strong>{balance}</strong> баллов</div>
            {player.role && (
              <div className="player-role">{player.role} (+{player.role_buff} баллов)</div>
            )}
          </div>
        )}
      </div>

      <div className="games-grid">
        <div 
          className="game-card" 
          onClick={(e) => handleCardClick(e, 'crash')}
          onTouchStart={(e) => handleCardClick(e, 'crash')}
        >
          <div className="game-icon">📈</div>
          <h2>Краш</h2>
          <p>Ставьте на множитель и выигрывайте!</p>
        </div>

        <div 
          className="game-card" 
          onClick={(e) => handleCardClick(e, 'slots')}
          onTouchStart={(e) => handleCardClick(e, 'slots')}
        >
          <div className="game-icon">🎰</div>
          <h2>Слоты</h2>
          <p>Крутите барабаны и выигрывайте призы!</p>
        </div>

        <div 
          className="game-card" 
          onClick={(e) => handleCardClick(e, 'blackjack')}
          onTouchStart={(e) => handleCardClick(e, 'blackjack')}
        >
          <div className="game-icon">🃏</div>
          <h2>Блэкджек</h2>
          <p>Одиночная или мультиплеерная игра!</p>
        </div>
      </div>

      <button 
        className="back-button"
        onClick={() => navigate(`/play?session=${sessionCode}&name=${encodeURIComponent(playerName)}`)}
      >
        ← Вернуться
      </button>
    </div>
  )
}

export default KazinoIndex

