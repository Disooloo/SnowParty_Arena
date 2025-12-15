import { useState, useEffect } from 'react'
import './Cipher.css'
import { CIPHER_RIDDLES } from '../data/words'
import { RED_LEVEL_CONFIG } from '../config/scores'

// Преобразуем загадки в формат с id
const CIPHERS = CIPHER_RIDDLES.map((c, idx) => ({
  id: idx + 1,
  hints: c.hints,
  answer: c.answer,
  category: c.category
}))

function shuffleArray(array) {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function Cipher({ onComplete }) {
  const [cipher, setCipher] = useState(null)
  const [currentHintIndex, setCurrentHintIndex] = useState(0)
  const [userAnswer, setUserAnswer] = useState('')
  const [gameStarted, setGameStarted] = useState(false)
  const [score, setScore] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [showResult, setShowResult] = useState(false)
  const [cipherIndex, setCipherIndex] = useState(0)
  const [ciphers, setCiphers] = useState([])

  useEffect(() => {
    if (gameStarted) {
      // Количество загадок из настроек
      const shuffled = shuffleArray(CIPHERS)
      setCiphers(shuffled.slice(0, RED_LEVEL_CONFIG.game2.ciphersCount))
      loadCipher(0, shuffled.slice(0, 3))
    }
  }, [gameStarted])

  const loadCipher = (index, cipherList) => {
    if (index >= cipherList.length) return
    setCipher(cipherList[index])
    setCurrentHintIndex(0)
    setUserAnswer('')
    setAttempts(0)
    setShowResult(false)
  }

  const startGame = () => {
    setGameStarted(true)
    setCipherIndex(0)
    setScore(0)
  }

  const showNextHint = () => {
    if (currentHintIndex < cipher.hints.length - 1) {
      setCurrentHintIndex(currentHintIndex + 1)
    }
  }

  const handleSubmit = () => {
    if (!userAnswer.trim()) return
    
    const normalizedAnswer = userAnswer.trim().toUpperCase()
    const normalizedCorrect = cipher.answer.toUpperCase()
    
    setAttempts(attempts + 1)
    
    if (normalizedAnswer === normalizedCorrect) {
      // Правильно! Баллы из настроек
      const hintsUsed = currentHintIndex + 1
      const points = RED_LEVEL_CONFIG.game2.basePoints + (cipher.hints.length - hintsUsed) * RED_LEVEL_CONFIG.game2.bonusPerHint
      setScore(score + points)
      setShowResult(true)
      
      // Переходим к следующей загадке
      setTimeout(() => {
        if (cipherIndex < ciphers.length - 1) {
          const nextIndex = cipherIndex + 1
          setCipherIndex(nextIndex)
          loadCipher(nextIndex, ciphers)
        } else {
          // Все загадки решены
          finishGame()
        }
      }, 2000)
    } else {
      // Неправильно
      if (attempts >= 2) { // После 3 попыток (0, 1, 2) переходим к следующему слову
        setShowResult(true)
        // Переходим к следующей загадке
        setTimeout(() => {
          if (cipherIndex < ciphers.length - 1) {
            const nextIndex = cipherIndex + 1
            setCipherIndex(nextIndex)
            loadCipher(nextIndex, ciphers)
          } else {
            // Все загадки решены
            finishGame()
          }
        }, 1500)
      } else {
        // Еще есть попытки
        setShowResult(true)
        setTimeout(() => {
          setShowResult(false)
          setUserAnswer('')
        }, 1500)
      }
    }
  }

  const finishGame = () => {
    onComplete(score, 0, {
      ciphers_solved: cipherIndex + 1,
      total_ciphers: ciphers.length,
      final_score: score
    })
  }

  if (!gameStarted) {
    return (
      <div className="cipher">
        <h2>🔴 Шифровка</h2>
        <h3>Угадайте слово по подсказкам!</h3>
        <p>Вам дадут несколько подсказок. Чем быстрее угадаете - тем больше очков!</p>
        <p style={{color: '#ff4444', marginTop: '1rem'}}>💰 Базовые очки: <strong>{RED_LEVEL_CONFIG.game2.basePoints}</strong></p>
        <p style={{color: '#44ff44', marginTop: '0.5rem'}}>⭐ Бонус за скорость: <strong>+{RED_LEVEL_CONFIG.game2.bonusPerHint} за каждую неиспользованную подсказку</strong></p>
        <p style={{color: '#ff4444', marginTop: '0.5rem'}}>📊 Загадок: <strong>{RED_LEVEL_CONFIG.game2.ciphersCount}</strong></p>
        <button onClick={startGame} className="start-button">
          Начать
        </button>
      </div>
    )
  }

  if (cipherIndex >= ciphers.length) {
    return (
      <div className="cipher">
        <h2>🎉 Все загадки разгаданы!</h2>
        <div style={{marginTop: '2rem'}}>
          <p style={{fontSize: '1.5rem', color: '#44ff44'}}>
            Ваш счет: <strong>{score} баллов</strong>
          </p>
          <p style={{fontSize: '1.2rem', marginTop: '1rem'}}>
            Разгадано: {ciphers.length} из {ciphers.length}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="cipher" style={{padding: '1rem', maxWidth: '100%', overflow: 'hidden'}}>
      <div className="level-header" style={{marginBottom: '1rem'}}>
        <h2 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>🔴 Шифровка</h2>
        <div className="game-stats" style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center'}}>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>
            Загадка: {cipherIndex + 1}/{RED_LEVEL_CONFIG.game2.ciphersCount}
          </div>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>
            Очки: {score}
          </div>
        </div>
      </div>

      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        padding: '1.5rem',
        borderRadius: '1rem',
        margin: '1rem 0'
      }}>
        <h3 style={{fontSize: '1.1rem', marginBottom: '1rem', color: '#ffaa00'}}>
          Категория: {cipher.category}
        </h3>
        
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          padding: '1rem',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          minHeight: '100px'
        }}>
          <p style={{fontSize: '0.9rem', color: '#aaa', marginBottom: '0.5rem'}}>
            Подсказка {currentHintIndex + 1} из {cipher.hints.length}:
          </p>
          <p style={{fontSize: '1.3rem', lineHeight: '1.6'}}>
            {cipher.hints[currentHintIndex]}
          </p>
        </div>

        {currentHintIndex < cipher.hints.length - 1 && (
          <button
            onClick={showNextHint}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              background: '#ffaa00',
              color: '#000',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 'bold',
              marginBottom: '1rem'
            }}
          >
            Показать следующую подсказку
          </button>
        )}
      </div>

      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        padding: '1.5rem',
        borderRadius: '1rem',
        margin: '1rem 0'
      }}>
        <input
          type="text"
          value={userAnswer}
          onChange={(e) => setUserAnswer(e.target.value.toUpperCase())}
          placeholder="Введите ответ..."
          style={{
            width: '100%',
            padding: '1rem',
            fontSize: '1.2rem',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '0.5rem',
            color: 'white',
            textAlign: 'center',
            textTransform: 'uppercase'
          }}
          onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
        />
        
        <button
          onClick={handleSubmit}
          disabled={!userAnswer.trim()}
          style={{
            width: '100%',
            padding: '1rem',
            fontSize: '1.2rem',
            background: userAnswer.trim() ? '#ff4444' : 'rgba(255, 68, 68, 0.5)',
            color: '#fff',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: userAnswer.trim() ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
            marginTop: '1rem'
          }}
        >
          Проверить ответ
        </button>

        {showResult && (
          <div style={{
            marginTop: '1rem',
            fontSize: '1.2rem',
            color: userAnswer.trim().toUpperCase() === cipher.answer.toUpperCase() ? '#44ff44' : '#ff4444',
            fontWeight: 'bold'
          }}>
            {userAnswer.trim().toUpperCase() === cipher.answer.toUpperCase() 
              ? `✅ Правильно! Ответ: ${cipher.answer}` 
              : '❌ Неправильно, попробуйте еще раз'}
          </div>
        )}
      </div>
    </div>
  )
}

export default Cipher

