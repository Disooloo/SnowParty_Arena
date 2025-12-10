import { useState, useEffect, useRef } from 'react'
import './CatchGame.css'
import { RED_LEVEL_CONFIG } from '../config/scores'

// Предметы: правильные (ловим) и неправильные (избегаем)
const GOOD_ITEMS = [
  { id: 1, emoji: '🎁', name: 'Подарок' },
  { id: 2, emoji: '⭐', name: 'Звезда' },
  { id: 3, emoji: '❄️', name: 'Снежинка' },
  { id: 4, emoji: '🍬', name: 'Конфета' },
  { id: 5, emoji: '🔔', name: 'Колокольчик' },
]

const BAD_ITEMS = [
  { id: 6, emoji: '💣', name: 'Бомба' },
  { id: 7, emoji: '🔥', name: 'Огонь' },
  { id: 8, emoji: '⚡', name: 'Молния' },
  { id: 9, emoji: '💀', name: 'Череп' },
  { id: 10, emoji: '☠️', name: 'Опасность' },
]

function CatchGame({ onComplete }) {
  const [gameStarted, setGameStarted] = useState(false)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(RED_LEVEL_CONFIG.game1.lives)
  const [timeLeft, setTimeLeft] = useState(RED_LEVEL_CONFIG.game1.timeLimit) // Время из настроек
  const [fallingItems, setFallingItems] = useState([])
  const [gameOver, setGameOver] = useState(false)
  const gameAreaRef = useRef(null)
  const animationFrameRef = useRef(null)
  const lastSpawnTimeRef = useRef(0)

  useEffect(() => {
    if (gameStarted && !gameOver && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else if (gameStarted && (timeLeft === 0 || lives === 0)) {
      finishGame()
    }
  }, [gameStarted, timeLeft, lives, gameOver])

  useEffect(() => {
    if (gameStarted && !gameOver && lives > 0 && timeLeft > 0) {
      const animate = () => {
        const now = Date.now()
        
        // Спавним новые предметы каждые 800-1500ms
        if (now - lastSpawnTimeRef.current > 800 + Math.random() * 700) {
          spawnItem()
          lastSpawnTimeRef.current = now
        }
        
        // Обновляем позиции падающих предметов
        setFallingItems(prev => {
          return prev
            .map(item => ({
              ...item,
              top: item.top + item.speed
            }))
            .filter(item => item.top < (gameAreaRef.current?.clientHeight || 600))
        })
        
        animationFrameRef.current = requestAnimationFrame(animate)
      }
      
      animationFrameRef.current = requestAnimationFrame(animate)
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
      }
    }
  }, [gameStarted, gameOver, lives, timeLeft])

  const spawnItem = () => {
    const isGood = Math.random() > 0.4 // 60% хороших, 40% плохих
    const items = isGood ? GOOD_ITEMS : BAD_ITEMS
    const item = items[Math.floor(Math.random() * items.length)]
    
    const newItem = {
      id: Date.now() + Math.random(),
      ...item,
      isGood,
      left: Math.random() * (gameAreaRef.current?.clientWidth || 300 - 60),
      top: -60,
      speed: 2 + Math.random() * 2
    }
    
    setFallingItems(prev => [...prev, newItem])
  }

  const handleItemClick = (item) => {
    if (gameOver) return
    
    if (item.isGood) {
      // Ловим правильный предмет - баллы из настроек
      setScore(score + 1) // Счетчик предметов, потом умножаем на pointsPerItem
    } else {
      // Попались на плохой предмет - теряем жизнь
      setLives(lives - 1)
    }
    
    // Удаляем предмет
    setFallingItems(prev => prev.filter(i => i.id !== item.id))
  }

  const startGame = () => {
    setGameStarted(true)
    setScore(0)
    setLives(3)
    setTimeLeft(60)
    setFallingItems([])
    setGameOver(false)
    lastSpawnTimeRef.current = Date.now()
  }

  const finishGame = () => {
    setGameOver(true)
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    // Баллы из настроек за каждое пойманное правильное
    const finalScore = score * RED_LEVEL_CONFIG.game1.pointsPerItem
    onComplete(finalScore, 0, {
      items_caught: score,
      lives_remaining: lives,
      final_score: finalScore
    })
  }

  if (!gameStarted) {
    return (
      <div className="catch-game">
        <h2>🔴 Реакция и ловля</h2>
        <h3>Ловите правильные предметы!</h3>
        <p>Ловите новогодние предметы (🎁⭐❄️🍬🔔)</p>
        <p style={{color: '#ff4444', marginTop: '1rem'}}>⚠️ Избегайте опасных (💣🔥⚡💀☠️)</p>
        <p style={{color: '#44ff44', marginTop: '1rem'}}>💰 За каждый правильный предмет: <strong>{RED_LEVEL_CONFIG.game1.pointsPerItem} балла</strong></p>
        <p>⏳ Время: <strong>{RED_LEVEL_CONFIG.game1.timeLimit} секунд</strong></p>
        <p>❤️ Жизни: <strong>{RED_LEVEL_CONFIG.game1.lives}</strong></p>
        <button onClick={startGame} className="start-button">
          Начать
        </button>
      </div>
    )
  }

  if (gameOver) {
    return (
      <div className="catch-game">
        <h2>🎉 Игра завершена!</h2>
        <div style={{marginTop: '2rem'}}>
          <p style={{fontSize: '1.5rem', color: '#44ff44'}}>
            Ваш счет: <strong>{score * RED_LEVEL_CONFIG.game1.pointsPerItem} баллов</strong>
          </p>
          <p style={{fontSize: '1.2rem', marginTop: '1rem'}}>
            Поймано предметов: {score}
          </p>
          <p style={{fontSize: '1.2rem', marginTop: '0.5rem'}}>
            Осталось жизней: {lives}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="catch-game" style={{padding: '1rem', maxWidth: '100%', overflow: 'hidden'}}>
      <div className="level-header" style={{marginBottom: '1rem'}}>
        <h2 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>🔴 Реакция и ловля</h2>
        <div className="game-stats" style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center'}}>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>
            Очки: {score * RED_LEVEL_CONFIG.game1.pointsPerItem}
          </div>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem', color: lives <= 1 ? '#ff4444' : '#fff'}}>
            ❤️ Жизни: {lives}
          </div>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem', color: timeLeft <= 10 ? '#ff4444' : '#fff'}}>
            Время: {timeLeft}с
          </div>
        </div>
      </div>

      <div 
        ref={gameAreaRef}
        className="game-area"
        style={{
          width: '100%',
          maxWidth: '400px',
          height: '500px',
          margin: '1rem auto',
          background: 'rgba(0, 0, 0, 0.3)',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '1rem',
          position: 'relative',
          overflow: 'hidden',
          touchAction: 'none'
        }}
      >
        {fallingItems.map(item => (
          <button
            key={item.id}
            onClick={() => handleItemClick(item)}
            className={`falling-item ${item.isGood ? 'good' : 'bad'}`}
            style={{
              position: 'absolute',
              left: `${item.left}px`,
              top: `${item.top}px`,
              fontSize: '3rem',
              background: item.isGood ? 'rgba(68, 255, 68, 0.3)' : 'rgba(255, 68, 68, 0.3)',
              border: `2px solid ${item.isGood ? '#44ff44' : '#ff4444'}`,
              borderRadius: '50%',
              width: '60px',
              height: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'transform 0.1s',
              padding: 0,
              zIndex: 10
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.9)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onTouchStart={(e) => {
              e.currentTarget.style.transform = 'scale(0.9)'
              handleItemClick(item)
            }}
            onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {item.emoji}
          </button>
        ))}
      </div>

      <div style={{
        marginTop: '1rem',
        padding: '1rem',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '0.5rem',
        fontSize: '0.9rem'
      }}>
        <p>👆 Нажимайте на правильные предметы!</p>
        <p style={{marginTop: '0.5rem', color: '#ff4444'}}>⚠️ Избегайте опасных!</p>
      </div>
    </div>
  )
}

export default CatchGame

