import { useState, useEffect, useRef } from 'react'
import './Simon.css'
import { RED_LEVEL_CONFIG } from '../config/scores'

const COLORS = [
  { id: 1, emoji: '🔴', name: 'Красный', color: '#ff4444' },
  { id: 2, emoji: '🟢', name: 'Зеленый', color: '#44ff44' },
  { id: 3, emoji: '🟡', name: 'Желтый', color: '#ffaa00' },
  { id: 4, emoji: '🔵', name: 'Синий', color: '#4444ff' },
]

function Simon({ onComplete }) {
  const [gameStarted, setGameStarted] = useState(false)
  const [sequence, setSequence] = useState([])
  const [userSequence, setUserSequence] = useState([])
  const [currentLevel, setCurrentLevel] = useState(1)
  const [isShowingSequence, setIsShowingSequence] = useState(false)
  const [isUserTurn, setIsUserTurn] = useState(false)
  const [score, setScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [highlightedColor, setHighlightedColor] = useState(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    if (gameStarted && !gameOver) {
      if (!isShowingSequence && !isUserTurn) {
        // Генерируем новую последовательность
        generateSequence()
      }
    }
  }, [gameStarted, currentLevel, isShowingSequence, isUserTurn, gameOver])

  const generateSequence = () => {
    const newSequence = [...sequence]
    // Добавляем случайный цвет к последовательности
    const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)]
    newSequence.push(randomColor)
    setSequence(newSequence)
    setIsShowingSequence(true)
    setIsUserTurn(false)
    setUserSequence([])
    
    // Показываем последовательность
    showSequence(newSequence)
  }

  const showSequence = (seq) => {
    let index = 0
    
    const showNext = () => {
      if (index < seq.length) {
        setHighlightedColor(seq[index].id)
        setTimeout(() => {
          setHighlightedColor(null)
          index++
          if (index < seq.length) {
            timeoutRef.current = setTimeout(showNext, 500)
          } else {
            // Последовательность показана, теперь очередь игрока
            setIsShowingSequence(false)
            setIsUserTurn(true)
          }
        }, 600)
      }
    }
    
    setTimeout(showNext, 500)
  }

  const startGame = () => {
    setGameStarted(true)
    setSequence([])
    setUserSequence([])
    setCurrentLevel(1)
    setScore(0)
    setGameOver(false)
    setIsShowingSequence(false)
    setIsUserTurn(false)
  }

  const handleColorClick = (color) => {
    if (!isUserTurn || gameOver || isShowingSequence) return
    
    const newUserSequence = [...userSequence, color]
    setUserSequence(newUserSequence)
    
    // Подсвечиваем нажатую кнопку
    setHighlightedColor(color.id)
    setTimeout(() => setHighlightedColor(null), 200)
    
    // Проверяем правильность
    const sequenceIndex = newUserSequence.length - 1
    if (newUserSequence[sequenceIndex].id !== sequence[sequenceIndex].id) {
      // Неправильно - игра окончена
      finishGame()
      return
    }
    
    // Если последовательность завершена правильно
    if (newUserSequence.length === sequence.length) {
      // Уровень пройден - баллы из настроек
      const levelScore = Math.min(RED_LEVEL_CONFIG.game3.maxLevelPoints, currentLevel * (RED_LEVEL_CONFIG.game3.pointsPerLevel / 3))
      setScore(score + levelScore)
      
      // Переходим на следующий уровень
      setTimeout(() => {
        setCurrentLevel(currentLevel + 1)
        setIsUserTurn(false)
        setIsShowingSequence(false)
      }, 1000) 
    }
  }

  const finishGame = () => {
    setGameOver(true)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    // Очки: за каждый уровень по 10 баллов
    onComplete(score, 0, {
      levels_completed: currentLevel - 1,
      final_score: score
    })
  }

  if (!gameStarted) {
    return (
      <div className="simon">
        <h2>🔴 Саймон</h2>
        <h3>Повторите последовательность!</h3>
        <p>Запомните и повторите последовательность цветов</p>
        <p style={{color: '#ff4444', marginTop: '1rem'}}>💰 За каждый уровень: <strong>до {RED_LEVEL_CONFIG.game3.maxLevelPoints} баллов</strong></p>
        <p>📈 Последовательность становится длиннее с каждым уровнем!</p>
        <button onClick={startGame} className="start-button">
          Начать
        </button>
      </div>
    )
  }

  if (gameOver) {
    return (
      <div className="simon">
        <h2>🎉 Игра завершена!</h2>
        <div style={{marginTop: '2rem'}}>
          <p style={{fontSize: '1.5rem', color: '#44ff44'}}>
            Ваш счет: <strong>{score} баллов</strong>
          </p>
          <p style={{fontSize: '1.2rem', marginTop: '1rem'}}>
            Пройдено уровней: {currentLevel - 1}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="simon" style={{padding: '1rem', maxWidth: '100%', overflow: 'hidden'}}>
      <div className="level-header" style={{marginBottom: '1rem'}}>
        <h2 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>🔴 Саймон</h2>
        <div className="game-stats" style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center'}}>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>
            Уровень: {currentLevel}
          </div>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>
            Очки: {score}
          </div>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>
            Длина: {sequence.length}
          </div>
        </div>
      </div>

      {isShowingSequence && (
        <div style={{
          margin: '1rem 0',
          padding: '1rem',
          background: 'rgba(255, 170, 0, 0.2)',
          borderRadius: '0.5rem',
          fontSize: '1.1rem'
        }}>
          👀 Смотрите внимательно!
        </div>
      )}

      {isUserTurn && !isShowingSequence && (
        <div style={{
          margin: '1rem 0',
          padding: '1rem',
          background: 'rgba(68, 255, 68, 0.2)',
          borderRadius: '0.5rem',
          fontSize: '1.1rem'
        }}>
          ✋ Ваша очередь! Повторите последовательность
        </div>
      )}

      <div className="simon-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
        maxWidth: '300px',
        margin: '2rem auto',
        padding: '0 1rem'
      }}>
        {COLORS.map(color => (
          <button
            key={color.id}
            onClick={() => handleColorClick(color)}
            disabled={!isUserTurn || isShowingSequence || gameOver}
            className={`simon-button ${highlightedColor === color.id ? 'highlighted' : ''}`}
            style={{
              aspectRatio: '1',
              fontSize: '4rem',
              background: highlightedColor === color.id 
                ? color.color 
                : `rgba(${color.id === 1 ? '255, 68, 68' : color.id === 2 ? '68, 255, 68' : color.id === 3 ? '255, 170, 0' : '68, 68, 255'}, 0.3)`,
              border: `3px solid ${color.color}`,
              borderRadius: '1rem',
              cursor: (!isUserTurn || isShowingSequence || gameOver) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: (!isUserTurn || isShowingSequence || gameOver) ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '120px'
            }}
          >
            {color.emoji}
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
        <p>Прогресс: {userSequence.length} / {sequence.length}</p>
      </div>
    </div>
  )
}

export default Simon

