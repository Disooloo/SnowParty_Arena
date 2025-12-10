import { useState, useEffect, useRef } from 'react'
import './TapBattle.css'
import { GREEN_LEVEL_CONFIG } from '../config/scores'

function TapBattle({ onComplete }) {
  const [taps, setTaps] = useState(0)
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GREEN_LEVEL_CONFIG.game3.timeLimit) // Время из настроек
  const [gameStarted, setGameStarted] = useState(false)
  const startTimeRef = useRef(null)

  useEffect(() => {
    if (gameStarted && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else if (gameStarted && timeLeft === 0) {
      finishGame()
    }
  }, [gameStarted, timeLeft])

  const startGame = () => {
    setGameStarted(true)
    startTimeRef.current = Date.now()
    setTaps(0)
    setScore(0)
  }

  const handleTap = () => {
    if (!gameStarted || timeLeft === 0) return
    
    const newTaps = taps + 1
    setTaps(newTaps)
    
    // Баллы из настроек за каждые 10 тапов
    if (newTaps % 10 === 0) {
      setScore(score + GREEN_LEVEL_CONFIG.game3.pointsPerTenTaps)
    }
  }

  const finishGame = () => {
    const timeSpent = Date.now() - startTimeRef.current
    onComplete(score, timeSpent, {
      total_taps: taps,
      score: score
    })
  }

  if (!gameStarted) {
    return (
      <div className="tap-battle">
        <h2>⚡ Тап-батл</h2>
        <h3>Тапайте на снеговика как можно быстрее!</h3>
        <p>Каждые 10 тапов = {GREEN_LEVEL_CONFIG.game3.pointsPerTenTaps} очка</p>
        <p style={{color: '#44ff44', marginTop: '1rem'}}>💰 Время: <strong>{GREEN_LEVEL_CONFIG.game3.timeLimit} секунд</strong></p>
        <button onClick={startGame} className="start-button">
          Начать
        </button>
      </div>
    )
  }

  return (
    <div className="tap-battle">
      <div className="level-header">
        <h2>⚡ Тап-батл</h2>
        <div className="game-stats">
          <div className="stat">Очки: {score}</div>
          <div className="stat">Тапов: {taps}</div>
          <div className="stat">Время: {timeLeft}с</div>
        </div>
      </div>

      <div className="snowman-container">
        <button 
          className="snowman-button"
          onClick={handleTap}
          onTouchStart={handleTap}
          style={{
            fontSize: '6rem',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '1.5rem',
            transition: 'transform 0.1s',
            touchAction: 'manipulation',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            minWidth: '150px',
            minHeight: '150px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.9)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          onTouchStart={(e) => {
            e.currentTarget.style.transform = 'scale(0.9)'
            handleTap()
          }}
          onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          ⛄
        </button>
        <p style={{fontSize: '1.1rem', marginTop: '1rem', padding: '0 1rem'}}>Тапайте быстрее!</p>
        <p style={{fontSize: '0.85rem', color: '#aaa', marginTop: '0.5rem', padding: '0 1rem'}}>
          Прогресс: {taps % 10}/10 до следующего очка
        </p>
      </div>

      <div className="progress-bar" style={{
        width: '100%',
        height: '20px',
        background: 'rgba(255, 255, 255, 0.2)',
        borderRadius: '10px',
        marginTop: '2rem',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${(taps % 10) * 10}%`,
          height: '100%',
          background: '#44ff44',
          transition: 'width 0.1s'
        }}></div>
      </div>

      <button onClick={finishGame} className="finish-button">
        Завершить игру
      </button>
    </div>
  )
}

export default TapBattle

