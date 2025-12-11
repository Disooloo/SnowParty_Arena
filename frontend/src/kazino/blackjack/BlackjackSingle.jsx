import { useState } from 'react'
import './BlackjackSingle.css'

function BlackjackSingle({ player, balance, sessionCode, playerName, onBack }) {
  return (
    <div className="blackjack-single">
      <div className="blackjack-single-header">
        <h2>🎮 Одиночный блэкджек</h2>
        <button className="back-button" onClick={onBack}>
          ← Назад
        </button>
      </div>
      <div className="blackjack-single-content">
        <p>Одиночный блэкджек в разработке...</p>
        <p>Игрок: {player?.name}</p>
        <p>Баланс: {balance} баллов</p>
      </div>
    </div>
  )
}

export default BlackjackSingle

