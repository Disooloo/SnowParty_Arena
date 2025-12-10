import { useState, useEffect } from 'react'
import './TrueOrFalse.css'

// Вопросы о Новом годе (правда/ложь)
const QUESTIONS = [
  { id: 1, question: 'В России Новый год отмечают 1 января', answer: true },
  { id: 2, question: 'Дед Мороз живет на Северном полюсе', answer: false },
  { id: 3, question: 'Ёлка традиционно украшается игрушками', answer: true },
  { id: 4, question: 'Снеговик обычно делается из двух шаров', answer: false },
  { id: 5, question: 'В новогоднюю ночь принято загадывать желания', answer: true },
  { id: 6, question: 'Оливье - это новогодний салат', answer: true },
  { id: 7, question: 'В России Дед Мороз приезжает на оленях', answer: false },
  { id: 8, question: 'Снежинки всегда имеют 6 лучей', answer: true },
  { id: 9, question: 'Новогодние подарки кладут под ёлку', answer: true },
  { id: 10, question: 'В новогоднюю ночь бьют куранты 12 раз', answer: true },
  { id: 11, question: 'Дед Мороз носит красную шапку', answer: true },
  { id: 12, question: 'Снег состоит из воды', answer: true },
  { id: 13, question: 'Новый год в России отмечают дважды', answer: true },
  { id: 14, question: 'Ёлка всегда зелёная', answer: true },
  { id: 15, question: 'Снеговик тает на солнце', answer: true },
  { id: 16, question: 'Дед Мороз приходит через дымоход', answer: false },
  { id: 17, question: 'В новогоднюю ночь запускают фейерверки', answer: true },
  { id: 18, question: 'Мандарины - традиционный новогодний фрукт', answer: true },
  { id: 19, question: 'Снег бывает только белым', answer: false },
  { id: 20, question: 'Новый год - самый главный праздник в России', answer: true },
]

function shuffleArray(array) {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function TrueOrFalse({ onComplete }) {
  const [questions, setQuestions] = useState([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [gameStarted, setGameStarted] = useState(false)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showResult, setShowResult] = useState(false)

  useEffect(() => {
    if (gameStarted) {
      // Выбираем 10 случайных вопросов
      const shuffled = shuffleArray(QUESTIONS)
      setQuestions(shuffled.slice(0, 10))
    }
  }, [gameStarted])

  const startGame = () => {
    setGameStarted(true)
    setCurrentQuestionIndex(0)
    setScore(0)
    setSelectedAnswer(null)
    setShowResult(false)
  }

  const handleAnswer = (answer) => {
    if (showResult) return
    
    setSelectedAnswer(answer)
    const currentQuestion = questions[currentQuestionIndex]
    const isCorrect = answer === currentQuestion.answer
    
    if (isCorrect) {
      setScore(score + 5) // +5 баллов за правильный ответ
    }
    
    setShowResult(true)
    
    // Через 1.5 секунды переходим к следующему вопросу
    setTimeout(() => {
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1)
        setSelectedAnswer(null)
        setShowResult(false)
      } else {
        // Все вопросы пройдены
        finishGame()
      }
    }, 1500)
  }

  const finishGame = () => {
    onComplete(score, 0, {
      questions_total: questions.length,
      correct_answers: score / 5,
      total_score: score
    })
  }

  if (!gameStarted) {
    return (
      <div className="true-or-false">
        <h2>🟡 Правда или Ложь</h2>
        <h3>Новогодние факты</h3>
        <p>Ответьте на 10 вопросов о Новом годе!</p>
        <p style={{color: '#ffaa00', marginTop: '1rem'}}>💰 За каждый правильный ответ: <strong>5 баллов</strong></p>
        <button onClick={startGame} className="start-button">
          Начать
        </button>
      </div>
    )
  }

  if (currentQuestionIndex >= questions.length) {
    return (
      <div className="true-or-false">
        <h2>🎉 Игра завершена!</h2>
        <div style={{marginTop: '2rem'}}>
          <p style={{fontSize: '1.5rem', color: '#44ff44'}}>
            Ваш счет: <strong>{score} баллов</strong>
          </p>
          <p style={{fontSize: '1.2rem', marginTop: '1rem'}}>
            Правильных ответов: {score / 5} из {questions.length}
          </p>
        </div>
      </div>
    )
  }

  const currentQuestion = questions[currentQuestionIndex]

  return (
    <div className="true-or-false" style={{padding: '1rem', maxWidth: '100%', overflow: 'hidden'}}>
      <div className="level-header" style={{marginBottom: '1rem'}}>
        <h2 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>🟡 Правда или Ложь</h2>
        <div className="game-stats" style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center'}}>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>
            Вопрос: {currentQuestionIndex + 1}/10
          </div>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>
            Очки: {score}
          </div>
        </div>
      </div>

      <div className="question-container" style={{
        background: 'rgba(255, 255, 255, 0.1)',
        padding: '2rem',
        borderRadius: '1rem',
        margin: '2rem 0',
        minHeight: '200px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <h3 style={{fontSize: '1.3rem', textAlign: 'center', lineHeight: '1.6'}}>
          {currentQuestion.question}
        </h3>
      </div>

      <div className="answer-buttons" style={{
        display: 'flex',
        gap: '1rem',
        justifyContent: 'center',
        marginTop: '2rem'
      }}>
        <button
          onClick={() => handleAnswer(true)}
          disabled={showResult}
          className={`answer-button ${selectedAnswer === true ? (currentQuestion.answer ? 'correct' : 'wrong') : ''}`}
          style={{
            padding: '1.5rem 3rem',
            fontSize: '1.5rem',
            background: selectedAnswer === true 
              ? (currentQuestion.answer ? '#44ff44' : '#ff4444')
              : 'rgba(255, 255, 255, 0.2)',
            color: selectedAnswer === true ? '#000' : '#fff',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: showResult ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            transition: 'all 0.3s',
            flex: 1,
            maxWidth: '200px'
          }}
        >
          ✓ Правда
        </button>
        <button
          onClick={() => handleAnswer(false)}
          disabled={showResult}
          className={`answer-button ${selectedAnswer === false ? (!currentQuestion.answer ? 'correct' : 'wrong') : ''}`}
          style={{
            padding: '1.5rem 3rem',
            fontSize: '1.5rem',
            background: selectedAnswer === false
              ? (!currentQuestion.answer ? '#44ff44' : '#ff4444')
              : 'rgba(255, 255, 255, 0.2)',
            color: selectedAnswer === false ? '#000' : '#fff',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: showResult ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            transition: 'all 0.3s',
            flex: 1,
            maxWidth: '200px'
          }}
        >
          ✗ Ложь
        </button>
      </div>

      {showResult && (
        <div style={{
          marginTop: '1.5rem',
          fontSize: '1.2rem',
          color: selectedAnswer === currentQuestion.answer ? '#44ff44' : '#ff4444',
          fontWeight: 'bold'
        }}>
          {selectedAnswer === currentQuestion.answer ? '✅ Правильно! +5 баллов' : '❌ Неправильно'}
        </div>
      )}
    </div>
  )
}

export default TrueOrFalse

