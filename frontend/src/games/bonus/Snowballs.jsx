import { useState, useEffect, useRef } from 'react'
import './Snowballs.css'

function Snowballs({ onComplete }) {
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(15)
  const [snowmanVisible, setSnowmanVisible] = useState(false)
  const [snowmanPosition, setSnowmanPosition] = useState({ left: 0, top: 0 })
  const [gameStarted, setGameStarted] = useState(false)
  const gameAreaRef = useRef(null)
  const snowmanTimeoutRef = useRef(null)

  useEffect(() => {
    if (gameStarted && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else if (gameStarted && timeLeft === 0) {
      finishGame()
    }
  }, [gameStarted, timeLeft])

  useEffect(() => {
    if (gameStarted && timeLeft > 0) {
      spawnSnowman()
    }
  }, [gameStarted, timeLeft])

  const startGame = () => {
    setGameStarted(true)
    setScore(0)
    setTimeLeft(15)
    setSnowmanVisible(false)
  }

  const spawnSnowman = () => {
    if (!gameAreaRef.current || snowmanVisible) return
    
    const areaWidth = gameAreaRef.current.clientWidth - 100
    const areaHeight = gameAreaRef.current.clientHeight - 100
    
    setSnowmanPosition({
      left: Math.random() * areaWidth,
      top: Math.random() * areaHeight
    })
    setSnowmanVisible(true)
    
    // Снеговик исчезает через 2 секунды, если не пойман
    snowmanTimeoutRef.current = setTimeout(() => {
      setSnowmanVisible(false)
      // Спавним следующего через случайное время
      setTimeout(() => {
        if (timeLeft > 0) spawnSnowman()
      }, 500 + Math.random() * 1000)
    }, 2000)
  }

  const handleSnowmanClick = () => {
    setSnowmanVisible(false)
    setScore(prev => prev + 10)
    if (snowmanTimeoutRef.current) {
      clearTimeout(snowmanTimeoutRef.current)
    }
    // Спавним следующего
    setTimeout(() => {
      if (timeLeft > 0) spawnSnowman()
    }, 500 + Math.random() * 1000)
  }

  const finishGame = () => {
    setSnowmanVisible(false)
    if (snowmanTimeoutRef.current) {
      clearTimeout(snowmanTimeoutRef.current)
    }
    onComplete(score, 0, { game_type: 'snowballs', final_score: score })
  }

  if (!gameStarted) {
    return (
      <div className="snowballs">
        <h2>❄️ Снежки</h2>
        <p>Нажмите на снеговика, когда он появится!</p>
        <button onClick={startGame} className="start-button">
          Начать
        </button>
      </div>
    )
  }

  return (
    <div className="snowballs" style={{padding: '1rem', maxWidth: '100%', overflow: 'hidden'}}>
      <div className="game-header">
        <div className="stat">Очки: {score}</div>
        <div className="stat" style={{color: timeLeft <= 5 ? '#ff4444' : '#fff'}}>
          Время: {timeLeft}с
        </div>
      </div>
      
      <div 
        ref={gameAreaRef}
        className="game-area"
        style={{
          width: '100%',
          maxWidth: '500px',
          height: '400px',
          margin: '1rem auto',
          position: 'relative',
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '1rem',
          overflow: 'hidden',
          touchAction: 'none'
        }}
      >
        {snowmanVisible && (
          <button
            onClick={handleSnowmanClick}
            onTouchStart={handleSnowmanClick}
            className="snowman-button"
            style={{
              position: 'absolute',
              left: `${snowmanPosition.left}px`,
              top: `${snowmanPosition.top}px`,
              fontSize: '5rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0.5rem',
              animation: 'snowmanAppear 0.3s ease-out',
              transition: 'transform 0.1s'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.8)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            ⛄
          </button>
        )}
      </div>
      
      {timeLeft === 0 && (
        <div style={{textAlign: 'center', marginTop: '1rem', fontSize: '1.2rem', color: '#44ff44'}}>
          Игра завершена! Вы набрали {score} баллов!
        </div>
      )}
    </div>
  )
}

export default Snowballs

