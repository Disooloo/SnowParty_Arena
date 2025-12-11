import { useState } from 'react'
import './BlackjackMultiplayer.css'

function BlackjackMultiplayer({ player, balance, sessionCode, playerName, onBack }) {
  const [players, setPlayers] = useState([player]) // Пока только текущий игрок

  return (
    <div className="blackjack-multiplayer">
      <div className="blackjack-multiplayer-header">
        <h2>👥 Мультиплеерный блэкджек</h2>
        <button className="back-button" onClick={onBack}>
          ← Назад
        </button>
      </div>
      <div className="blackjack-multiplayer-content">
        <div className="waiting-room">
          <h3>Ожидание игроков...</h3>
          <div className="players-list">
            {players.map((p, idx) => (
              <div key={idx} className="player-card">
                <div className="player-name">{p?.name}</div>
                <div className="player-balance">{balance} баллов</div>
              </div>
            ))}
          </div>
          <p>Мультиплеерный блэкджек в разработке...</p>
        </div>
      </div>
    </div>
  )
}

export default BlackjackMultiplayer

