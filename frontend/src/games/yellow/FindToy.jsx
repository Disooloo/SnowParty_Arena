import { useState, useEffect } from 'react'
import './FindToy.css'
import { YELLOW_LEVEL_CONFIG } from '../config/scores'

// Предметы: новогодние и неправильные
const ITEMS = [
  { id: 1, name: 'Ёлочная игрушка', emoji: '🎄', isNewYear: true },
  { id: 2, name: 'Снежинка', emoji: '❄️', isNewYear: true },
  { id: 3, name: 'Подарок', emoji: '🎁', isNewYear: true },
  { id: 4, name: 'Звезда', emoji: '⭐', isNewYear: true },
  { id: 5, name: 'Колокольчик', emoji: '🔔', isNewYear: true },
  { id: 6, name: 'Конфета', emoji: '🍬', isNewYear: true },
  { id: 7, name: 'Бант', emoji: '🎀', isNewYear: true },
  { id: 8, name: 'Свеча', emoji: '🕯️', isNewYear: true },
  { id: 9, name: 'Ракушка', emoji: '🐚', isNewYear: false },
  { id: 10, name: 'Мяч', emoji: '⚽', isNewYear: false },
  { id: 11, name: 'Кактус', emoji: '🌵', isNewYear: false },
  { id: 12, name: 'Лампочка', emoji: '💡', isNewYear: false },
  { id: 13, name: 'Солнце', emoji: '☀️', isNewYear: false },
  { id: 14, name: 'Пляж', emoji: '🏖️', isNewYear: false },
  { id: 15, name: 'Арбуз', emoji: '🍉', isNewYear: false },
]

function shuffleArray(array) {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function FindToy({ onComplete }) {
  const [currentRound, setCurrentRound] = useState(0)
  const [rounds, setRounds] = useState([])
  const [currentItems, setCurrentItems] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const [gameStarted, setGameStarted] = useState(false)
  const [timeLeft, setTimeLeft] = useState(5)
  const [roundScores, setRoundScores] = useState([])
  const [totalScore, setTotalScore] = useState(0)

  useEffect(() => {
    if (gameStarted) {
      // Количество раундов из настроек
      const numRounds = YELLOW_LEVEL_CONFIG.game3.rounds
      const newRounds = []
      for (let i = 0; i < numRounds; i++) {
        // В каждом раунде 12-20 предметов, из которых 3-5 правильных
        const shuffled = shuffleArray(ITEMS)
        const correctCount = 3 + Math.floor(Math.random() * 3) // 3-5 правильных
        const wrongCount = 8 + Math.floor(Math.random() * 5) // 8-12 неправильных
        const roundItems = [
          ...shuffled.filter(item => item.isNewYear).slice(0, correctCount),
          ...shuffled.filter(item => !item.isNewYear).slice(0, wrongCount)
        ]
        newRounds.push(shuffleArray(roundItems))
      }
      setRounds(newRounds)
      loadRound(0, newRounds)
    }
  }, [gameStarted])

  const loadRound = (index, roundsList) => {
    if (index >= roundsList.length) return
    setCurrentItems(roundsList[index])
    setSelectedItems([])
    setTimeLeft(YELLOW_LEVEL_CONFIG.game3.timePerRound)
  }

  const startGame = () => {
    setGameStarted(true)
    setCurrentRound(0)
    setRoundScores([])
    setTotalScore(0)
  }

  useEffect(() => {
    if (gameStarted && currentRound < rounds.length && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else if (gameStarted && timeLeft === 0) {
      // Время вышло - завершаем раунд
      finishRound()
    }
  }, [gameStarted, timeLeft, currentRound, rounds.length])

  const handleItemClick = (itemId) => {
    if (timeLeft === 0) return
    
    const item = currentItems.find(i => i.id === itemId)
    if (!item) return

    if (selectedItems.includes(itemId)) {
      setSelectedItems(selectedItems.filter(id => id !== itemId))
    } else {
      setSelectedItems([...selectedItems, itemId])
    }
  }

  const finishRound = () => {
    // Подсчитываем правильные и неправильные выборы
    const correctSelected = selectedItems.filter(id => {
      const item = currentItems.find(i => i.id === id)
      return item && item.isNewYear
    })
    const wrongSelected = selectedItems.filter(id => {
      const item = currentItems.find(i => i.id === id)
      return item && !item.isNewYear
    })
    const correctItems = currentItems.filter(item => item.isNewYear)
    const unselectedCorrect = correctItems.filter(item => !selectedItems.includes(item.id))

    // Баллы из настроек
    let roundScore = correctSelected.length * YELLOW_LEVEL_CONFIG.game3.pointsPerCorrect - wrongSelected.length * YELLOW_LEVEL_CONFIG.game3.penaltyPerWrong
    if (wrongSelected.length === 0 && unselectedCorrect.length === 0) {
      roundScore += YELLOW_LEVEL_CONFIG.game3.bonusPerfectRound // Бонус за идеальный раунд
    }
    roundScore = Math.max(0, roundScore) // Не меньше 0

    const newRoundScores = [...roundScores, roundScore]
    setRoundScores(newRoundScores)
    setTotalScore(newRoundScores.reduce((a, b) => a + b, 0))

    // Переходим к следующему раунду
    if (currentRound < rounds.length - 1) {
      setTimeout(() => {
        const nextRound = currentRound + 1
        setCurrentRound(nextRound)
        loadRound(nextRound, rounds)
      }, 2000)
    } else {
      // Все раунды завершены
      setTimeout(() => {
        finishGame()
      }, 2000)
    }
  }

  const finishGame = () => {
    onComplete(totalScore, 0, {
      rounds: roundScores,
      total_score: totalScore,
      rounds_completed: rounds.length
    })
  }

  if (!gameStarted) {
    return (
      <div className="find-toy">
        <h2>🟡 Найди правильную ёлочную игрушку</h2>
        <h3>Визуальное задание на внимание</h3>
        <p>{YELLOW_LEVEL_CONFIG.game3.rounds} раундов по {YELLOW_LEVEL_CONFIG.game3.timePerRound} секунд каждый</p>
        <p>Найдите все новогодние предметы!</p>
        <p style={{color: '#ffaa00', marginTop: '1rem'}}>💰 За правильный выбор: <strong>+{YELLOW_LEVEL_CONFIG.game3.pointsPerCorrect} балла</strong></p>
        <p style={{color: '#ff4444', marginTop: '0.5rem'}}>❌ За ошибку: <strong>-{YELLOW_LEVEL_CONFIG.game3.penaltyPerWrong} балл</strong></p>
        <p style={{color: '#44ff44', marginTop: '0.5rem'}}>⭐ Бонус за идеальный раунд: <strong>+{YELLOW_LEVEL_CONFIG.game3.bonusPerfectRound} балла</strong></p>
        <button onClick={startGame} className="start-button">
          Начать
        </button>
      </div>
    )
  }

  if (currentRound >= rounds.length) {
    return (
      <div className="find-toy">
        <h2>🎉 Игра завершена!</h2>
        <div style={{marginTop: '2rem'}}>
          <h3>Результаты раундов:</h3>
          {roundScores.map((score, idx) => (
            <p key={idx} style={{fontSize: '1.2rem', margin: '0.5rem 0'}}>
              Раунд {idx + 1}: {score} баллов
            </p>
          ))}
          <p style={{fontSize: '1.5rem', marginTop: '1rem', color: '#44ff44'}}>
            Общий счет: <strong>{totalScore} баллов</strong>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="find-toy" style={{padding: '1rem', maxWidth: '100%', overflow: 'hidden'}}>
      <div className="level-header" style={{marginBottom: '1rem'}}>
        <h2 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>🟡 Найди игрушку</h2>
        <div className="game-stats" style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center'}}>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>
            Раунд: {currentRound + 1}/{rounds.length}
          </div>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem', color: timeLeft <= 2 ? '#ff4444' : '#fff'}}>
            Время: {timeLeft}с
          </div>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>
            Очки: {totalScore}
          </div>
        </div>
      </div>

      <div className="items-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '0.5rem',
        margin: '1rem 0',
        padding: '0 0.5rem'
      }}>
        {currentItems.map(item => {
          const isSelected = selectedItems.includes(item.id)
          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.id)}
              disabled={timeLeft === 0}
              className={`item-button ${isSelected ? 'selected' : ''} ${isSelected && item.isNewYear ? 'correct' : ''} ${isSelected && !item.isNewYear ? 'wrong' : ''}`}
              style={{
                fontSize: '2rem',
                background: isSelected
                  ? (item.isNewYear ? 'rgba(68, 255, 68, 0.3)' : 'rgba(255, 68, 68, 0.3)')
                  : 'rgba(255, 255, 255, 0.1)',
                border: isSelected
                  ? (item.isNewYear ? '2px solid #44ff44' : '2px solid #ff4444')
                  : '2px solid transparent',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                cursor: timeLeft === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s',
                minHeight: '80px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column'
              }}
            >
              <div>{item.emoji}</div>
            </button>
          )
        })}
      </div>

      {timeLeft === 0 && (
        <div style={{
          marginTop: '1rem',
          fontSize: '1.1rem',
          color: '#ffaa00',
          fontWeight: 'bold'
        }}>
          Время вышло! Подсчитываем результаты...
        </div>
      )}
    </div>
  )
}

export default FindToy

