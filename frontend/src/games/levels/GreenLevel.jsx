import { useState, useEffect, useRef } from 'react'
import './GreenLevel.css'

const NEW_YEAR_WORDS = [
  'СНЕГОВИК', 'ЕЛКА', 'ПОДАРОК', 'САЛЮТ', 'ХЛОПУШКА',
  'МАНДАРИН', 'СНЕЖИНКА', 'СВЕЧА', 'ГИРЛЯНДА', 'КОНФЕТА'
]

function shuffleArray(array) {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function GreenLevel({ onComplete }) {
  const [currentWord, setCurrentWord] = useState(null)
  const [shuffledLetters, setShuffledLetters] = useState([])
  const [selectedLetters, setSelectedLetters] = useState([])
  const [score, setScore] = useState(0)
  const [wordsCompleted, setWordsCompleted] = useState(0)
  const [timeLeft, setTimeLeft] = useState(180) // 3 минуты
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
    loadNewWord()
  }

  const loadNewWord = () => {
    const word = NEW_YEAR_WORDS[Math.floor(Math.random() * NEW_YEAR_WORDS.length)]
    setCurrentWord(word)
    setShuffledLetters(shuffleArray(word.split('')))
    setSelectedLetters([])
  }

  const handleLetterClick = (letter, index) => {
    if (!gameStarted) return
    
    const newSelected = [...selectedLetters, { letter, index }]
    setSelectedLetters(newSelected)
    
    const selectedWord = newSelected.map(s => s.letter).join('')
    
    if (selectedWord === currentWord) {
      // Правильно! +1 балл за зелёный уровень
      setScore(score + 1)
      setWordsCompleted(wordsCompleted + 1)
      loadNewWord()
    } else if (selectedWord.length === currentWord.length) {
      // Неправильно - даем новое слово
      setSelectedLetters([])
      loadNewWord()
    }
  }

  const handleRemoveLetter = (index) => {
    setSelectedLetters(selectedLetters.filter((_, i) => i !== index))
  }

  const finishGame = () => {
    const timeSpent = Date.now() - startTimeRef.current
    onComplete(score, timeSpent, {
      words_completed: wordsCompleted,
      final_score: score
    })
  }

  if (!gameStarted) {
    return (
      <div className="green-level">
        <h2>🟢 Зелёный уровень</h2>
        <h3>Перемешанные слова</h3>
        <p>Соберите новогодние слова из перемешанных букв!</p>
        <p style={{color: '#44ff44', marginTop: '1rem'}}>💰 За каждое слово: <strong>1 балл</strong></p>
        <button onClick={startGame} className="start-button">
          Начать
        </button>
      </div>
    )
  }

  return (
    <div className="green-level">
      <div className="level-header">
        <h2>🟢 Зелёный уровень</h2>
        <div className="game-stats">
          <div className="stat">Очки: {score}</div>
          <div className="stat">Время: {timeLeft}с</div>
        </div>
      </div>

      <div className="word-display">
        <div className="selected-word">
          {selectedLetters.length === 0 ? (
            <span className="placeholder">Выберите буквы...</span>
          ) : (
            selectedLetters.map((item, idx) => (
              <span
                key={idx}
                className="selected-letter"
                onClick={() => handleRemoveLetter(idx)}
              >
                {item.letter}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="letters-grid">
        {shuffledLetters.map((letter, index) => {
          const isUsed = selectedLetters.some(s => s.index === index)
          return (
            <button
              key={index}
              className={`letter-button ${isUsed ? 'used' : ''}`}
              onClick={() => !isUsed && handleLetterClick(letter, index)}
              disabled={isUsed}
            >
              {letter}
            </button>
          )
        })}
      </div>

      <button onClick={finishGame} className="finish-button">
        Завершить уровень
      </button>
    </div>
  )
}

export default GreenLevel

