import { useState, useEffect } from 'react'
import './FindCorrect.css'
import { GREEN_LEVEL_CONFIG } from '../config/scores'

// Картинки: новогодние и не новогодние
const IMAGES = [
  { id: 1, name: 'Елка', isNewYear: true, emoji: '🎄' },
  { id: 2, name: 'Снеговик', isNewYear: true, emoji: '⛄' },
  { id: 3, name: 'Подарок', isNewYear: true, emoji: '🎁' },
  { id: 4, name: 'Салют', isNewYear: true, emoji: '🎆' },
  { id: 5, name: 'Снежинка', isNewYear: true, emoji: '❄️' },
  { id: 6, name: 'Свеча', isNewYear: true, emoji: '🕯️' },
  { id: 7, name: 'Гирлянда', isNewYear: true, emoji: '💡' },
  { id: 8, name: 'Мандарин', isNewYear: true, emoji: '🍊' },
  { id: 9, name: 'Хлопушка', isNewYear: true, emoji: '🎊' },
  { id: 10, name: 'Конфета', isNewYear: true, emoji: '🍬' },
  { id: 11, name: 'Яблоко', isNewYear: false, emoji: '🍎' },
  { id: 12, name: 'Банан', isNewYear: false, emoji: '🍌' },
  { id: 13, name: 'Солнце', isNewYear: false, emoji: '☀️' },
  { id: 14, name: 'Мороженое', isNewYear: false, emoji: '🍦' },
  { id: 15, name: 'Пляж', isNewYear: false, emoji: '🏖️' },
  { id: 16, name: 'Лето', isNewYear: false, emoji: '🌞' },
  { id: 17, name: 'Цветок', isNewYear: false, emoji: '🌺' },
  { id: 18, name: 'Кокос', isNewYear: false, emoji: '🥥' },
  { id: 19, name: 'Арбуз', isNewYear: false, emoji: '🍉' },
  { id: 20, name: 'Пальма', isNewYear: false, emoji: '🌴' },
]

function shuffleArray(array) {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Дополнительные картинки для других событий
const OTHER_EVENTS_IMAGES = [
  { id: 21, name: 'День рождения', isNewYear: false, emoji: '🎂' },
  { id: 22, name: 'Свадьба', isNewYear: false, emoji: '💒' },
  { id: 23, name: 'Хэллоуин', isNewYear: false, emoji: '🎃' },
  { id: 24, name: 'Пасха', isNewYear: false, emoji: '🐰' },
  { id: 25, name: 'Рождество', isNewYear: true, emoji: '🎄' },
  { id: 26, name: 'День святого Валентина', isNewYear: false, emoji: '💝' },
  { id: 27, name: 'День Победы', isNewYear: false, emoji: '🎖️' },
  { id: 28, name: 'Масленица', isNewYear: false, emoji: '🥞' },
  { id: 29, name: 'День знаний', isNewYear: false, emoji: '📚' },
  { id: 30, name: 'День матери', isNewYear: false, emoji: '🌷' },
]

function FindCorrect({ onComplete }) {
  const [currentRound, setCurrentRound] = useState(0) // 0, 1, 2 - три подуровня
  const [images, setImages] = useState([])
  const [selectedImages, setSelectedImages] = useState([])
  const [gameStarted, setGameStarted] = useState(false)
  const [roundScores, setRoundScores] = useState([]) // Очки за каждый раунд
  const [totalScore, setTotalScore] = useState(0)
  const [maxScore, setMaxScore] = useState(0)
  const [showOtherEvents, setShowOtherEvents] = useState(false) // Показывать ли другие события

  useEffect(() => {
    if (gameStarted && currentRound < 3) {
      // Для каждого раунда выбираем 6 картинок (3 новогодние, 3 не новогодние)
      let selected = []
      if (currentRound === 0 || !showOtherEvents) {
        // Первый раунд - только новогодние
        const newYearImages = shuffleArray(IMAGES.filter(img => img.isNewYear))
        const otherImages = shuffleArray(IMAGES.filter(img => !img.isNewYear))
        selected = [...newYearImages.slice(0, 3), ...otherImages.slice(0, 3)]
      } else {
        // После первого раунда - показываем другие события
        const allImages = [...IMAGES, ...OTHER_EVENTS_IMAGES]
        const newYearImages = shuffleArray(allImages.filter(img => img.isNewYear))
        const otherImages = shuffleArray(allImages.filter(img => !img.isNewYear))
        selected = [...newYearImages.slice(0, 3), ...otherImages.slice(0, 3)]
      }
      setImages(shuffleArray(selected))
      setMaxScore(3) // В каждом раунде 3 правильных ответа
      setSelectedImages([])
    }
  }, [gameStarted, currentRound, showOtherEvents])

  const startGame = () => {
    setGameStarted(true)
    setCurrentRound(0)
    setSelectedImages([])
    setRoundScores([])
    setTotalScore(0)
    setShowOtherEvents(false)
  }

  const handleImageClick = (imageId) => {
    if (!gameStarted || currentRound >= 3) return
    
    const image = images.find(img => img.id === imageId)
    if (!image) return

    // Переключаем выбор
    if (selectedImages.includes(imageId)) {
      setSelectedImages(selectedImages.filter(id => id !== imageId))
    } else {
      const newSelected = [...selectedImages, imageId]
      setSelectedImages(newSelected)
      
      // Проверяем, выбрано ли ровно 3 правильных и нет неправильных
      const correctSelected = newSelected.filter(id => {
        const img = images.find(i => i.id === id)
        return img && img.isNewYear
      })
      const wrongSelected = newSelected.filter(id => {
        const img = images.find(i => i.id === id)
        return img && !img.isNewYear
      })
      
      // Если выбрано ровно 3 правильных и нет неправильных - автоматически завершаем раунд
      if (correctSelected.length === 3 && wrongSelected.length === 0 && newSelected.length === 3) {
        // Небольшая задержка для визуального эффекта
        setTimeout(() => {
          finishRound()
        }, 500)
      }
    }
  }

  const finishRound = () => {
    // Проверяем правильность выбора
    const correctSelected = selectedImages.filter(id => {
      const img = images.find(i => i.id === id)
      return img && img.isNewYear
    })
    const wrongSelected = selectedImages.filter(id => {
      const img = images.find(i => i.id === id)
      return img && !img.isNewYear
    })
    
    // Если выбраны все 3 правильные и нет неправильных - баллы из настроек, иначе 0
    const roundScore = (correctSelected.length === 3 && wrongSelected.length === 0 && selectedImages.length === 3)
      ? GREEN_LEVEL_CONFIG.game2.pointsPerRound
      : 0
    const newRoundScores = [...roundScores, roundScore]
    setRoundScores(newRoundScores)
    setTotalScore(newRoundScores.reduce((a, b) => a + b, 0))
    
    // Переходим к следующему раунду
    if (currentRound < 2) {
      setCurrentRound(currentRound + 1)
      if (currentRound === 0) {
        setShowOtherEvents(true) // После первого раунда показываем другие события
      }
    } else {
      // Все раунды завершены
      finishGame()
    }
  }

  const finishGame = () => {
    onComplete(totalScore, 0, {
      rounds: roundScores,
      total_score: totalScore
    })
  }

  if (!gameStarted) {
    return (
      <div className="find-correct">
        <h2>🎯 Найди правильно</h2>
        <h3>Выберите все новогодние картинки</h3>
        <p>3 раунда по 6 картинок. Выберите все новогодние!</p>
        <p style={{color: '#44ff44', marginTop: '1rem'}}>💰 За раунд без ошибок: <strong>{GREEN_LEVEL_CONFIG.game2.pointsPerRound} баллов</strong></p>
        <p style={{color: '#ff4444', marginTop: '0.5rem'}}>❌ Если хотя бы 1 ошибка: <strong>0 баллов</strong></p>
        <p style={{color: '#44ff44', marginTop: '0.5rem'}}>📊 Раундов: <strong>{GREEN_LEVEL_CONFIG.game2.rounds}</strong></p>
        <button onClick={startGame} className="start-button">
          Начать
        </button>
      </div>
    )
  }

  if (currentRound >= 3) {
    return (
      <div className="find-correct">
        <h2>🎯 Игра завершена!</h2>
        <div style={{marginTop: '2rem'}}>
          <h3>Результаты раундов:</h3>
          {roundScores.map((score, idx) => (
            <p key={idx} style={{fontSize: '1.2rem', margin: '0.5rem 0'}}>
              Раунд {idx + 1}: {score === GREEN_LEVEL_CONFIG.game2.pointsPerRound ? `✅ ${GREEN_LEVEL_CONFIG.game2.pointsPerRound} баллов` : '❌ 0 баллов'}
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
    <div className="find-correct" style={{padding: '1rem', maxWidth: '100%', overflow: 'hidden'}}>
      <div className="level-header" style={{marginBottom: '1rem'}}>
        <h2 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>🎯 Найди правильно</h2>
        <div className="game-stats" style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center'}}>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>Раунд: {currentRound + 1}/3</div>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>Выбрано: {selectedImages.length}/3</div>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>Очки: {totalScore}</div>
        </div>
      </div>

      <div className="images-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.75rem',
        margin: '1rem 0',
        maxWidth: '100%',
        padding: '0 0.5rem'
      }}>
        {images.map(image => {
          const isSelected = selectedImages.includes(image.id)
          const isCorrect = image.isNewYear
          return (
            <button
              key={image.id}
              className={`image-button ${isSelected ? 'selected' : ''} ${isSelected && isCorrect ? 'correct' : ''} ${isSelected && !isCorrect ? 'wrong' : ''}`}
              onClick={() => handleImageClick(image.id)}
              style={{
                minHeight: '100px',
                padding: '0.75rem',
                fontSize: '2.5rem'
              }}
            >
              <div style={{fontSize: '2.5rem', marginBottom: '0.25rem'}}>{image.emoji}</div>
              <div style={{fontSize: '0.75rem', marginTop: '0.25rem', wordBreak: 'break-word'}}>{image.name}</div>
            </button>
          )
        })}
      </div>

      {selectedImages.length < 3 && (
        <button onClick={finishRound} className="finish-button" style={{
          width: '100%',
          maxWidth: '300px',
          margin: '1rem auto',
          display: 'block'
        }}>
          Завершить раунд
        </button>
      )}
      {selectedImages.length === 3 && (
        <div style={{
          width: '100%',
          maxWidth: '300px',
          margin: '1rem auto',
          padding: '1rem',
          background: 'rgba(68, 255, 68, 0.2)',
          borderRadius: '0.5rem',
          textAlign: 'center',
          color: '#44ff44',
          fontWeight: 'bold'
        }}>
          Выбрано 3 правильных! Переход к следующему раунду...
        </div>
      )}
    </div>
  )
}

export default FindCorrect

