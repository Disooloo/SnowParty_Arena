import { useState, useEffect, useRef } from 'react'
import './CatchGifts.css'
import { BONUS_GAMES_CONFIG } from '../config/scores'

function CatchGifts({ onComplete }) {
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(BONUS_GAMES_CONFIG.catchGifts.timeLimit)
  const [gifts, setGifts] = useState([])
  const [gameStarted, setGameStarted] = useState(false)
  const gameAreaRef = useRef(null)
  const spawnIntervalRef = useRef(null)

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
      spawnIntervalRef.current = setInterval(() => {
        spawnGift()
      }, 800 + Math.random() * 700)
      
      return () => {
        if (spawnIntervalRef.current) {
          clearInterval(spawnIntervalRef.current)
        }
      }
    }
  }, [gameStarted, timeLeft])

  const startGame = () => {
    setGameStarted(true)
    setScore(0)
    setTimeLeft(BONUS_GAMES_CONFIG.catchGifts.timeLimit)
    setGifts([])
  }

  const spawnGift = () => {
    if (!gameAreaRef.current) return
    
    const areaWidth = gameAreaRef.current.clientWidth - 80
    const areaHeight = gameAreaRef.current.clientHeight - 80
    
    const newGift = {
      id: Date.now() + Math.random(),
      left: Math.random() * areaWidth,
      top: Math.random() * areaHeight,
      emoji: ['🎁', '🎄', '⭐', '🎊', '🎉'][Math.floor(Math.random() * 5)]
    }
    
    setGifts(prev => [...prev, newGift])
    
    // Удаляем подарок через 3 секунды, если не пойман
    setTimeout(() => {
      setGifts(prev => prev.filter(g => g.id !== newGift.id))
    }, 3000)
  }

  const handleGiftClick = (giftId) => {
    setGifts(prev => prev.filter(g => g.id !== giftId))
    setScore(prev => prev + BONUS_GAMES_CONFIG.catchGifts.pointsPerGift)
  }

  const finishGame = () => {
    if (spawnIntervalRef.current) {
      clearInterval(spawnIntervalRef.current)
    }
    onComplete(score, 0, { game_type: 'gifts', final_score: score })
  }

  if (!gameStarted) {
    return (
      <div className="catch-gifts">
        <h2>🎁 Поймай подарки</h2>
        <p>Тапайте по подаркам на экране!</p>
        <button onClick={startGame} className="start-button">
          Начать
        </button>
      </div>
    )
  }

  return (
    <div className="catch-gifts" style={{padding: '1rem', maxWidth: '100%', overflow: 'hidden'}}>
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
        {gifts.map(gift => (
          <button
            key={gift.id}
            onClick={() => handleGiftClick(gift.id)}
            onTouchStart={(e) => {
              e.currentTarget.style.transform = 'scale(0.8)'
              handleGiftClick(gift.id)
            }}
            onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
            className="gift-button"
            style={{
              position: 'absolute',
              left: `${gift.left}px`,
              top: `${gift.top}px`,
              fontSize: '4rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0.5rem',
              transition: 'transform 0.1s',
              animation: 'giftAppear 0.3s ease-out'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.8)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {gift.emoji}
          </button>
        ))}
      </div>
      
      {timeLeft === 0 && (
        <div style={{textAlign: 'center', marginTop: '1rem', fontSize: '1.2rem', color: '#44ff44'}}>
          Игра завершена! Вы набрали {score} баллов!
        </div>
      )}
    </div>
  )
}

export default CatchGifts

