import { useState, useEffect } from 'react'
import './Charades.css'
import { YELLOW_LEVEL_CONFIG } from '../config/scores'

// Простые пазлы для сборки (3 картинки)
const PUZZLES = [
  {
    id: 1,
    name: 'Снеговик',
    emoji: '⛄',
    pieces: ['⛄', '❄️', '🎩', '🥕', '🧣', '🌲']
  },
  {
    id: 2,
    name: 'Ёлка',
    emoji: '🎄',
    pieces: ['🎄', '⭐', '🎁', '❄️', '🔔', '💡']
  },
  {
    id: 3,
    name: 'Подарок',
    emoji: '🎁',
    pieces: ['🎁', '🎀', '🎊', '🎉', '⭐', '💝']
  }
]

function shuffleArray(array) {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function Charades({ onComplete }) {
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0)
  const [puzzles, setPuzzles] = useState([])
  const [pieces, setPieces] = useState([])
  const [selectedPieces, setSelectedPieces] = useState([])
  const [gameStarted, setGameStarted] = useState(false)
  const [score, setScore] = useState(0)
  const [completedPuzzles, setCompletedPuzzles] = useState(0)

  useEffect(() => {
    if (gameStarted) {
      // Выбираем 3 случайных пазла
      const shuffled = shuffleArray(PUZZLES)
      setPuzzles(shuffled.slice(0, 3))
      loadPuzzle(0, shuffled.slice(0, 3))
    }
  }, [gameStarted])

  const loadPuzzle = (index, puzzleList) => {
    if (index >= puzzleList.length) return
    const puzzle = puzzleList[index]
    // Создаем перемешанные кусочки (6 штук, включая правильные и лишние)
    const shuffled = shuffleArray(puzzle.pieces)
    setPieces(shuffled)
    setSelectedPieces([])
  }

  const startGame = () => {
    setGameStarted(true)
    setCurrentPuzzleIndex(0)
    setScore(0)
    setCompletedPuzzles(0)
  }

  const handlePieceClick = (piece, index) => {
    if (selectedPieces.length >= 3) return // Максимум 3 кусочка
    
    // Проверяем, не выбран ли уже этот кусочек
    if (selectedPieces.some(p => p.index === index)) return
    
    const newSelected = [...selectedPieces, { piece, index }]
    setSelectedPieces(newSelected)
    
    // Если выбрано 3 кусочка, проверяем правильность
    if (newSelected.length === 3) {
      const currentPuzzle = puzzles[currentPuzzleIndex]
      const selectedEmojis = newSelected.map(s => s.piece).join('')
      const correctEmojis = currentPuzzle.emoji + '❄️' + '🎁' // Упрощенная проверка
      
      // Проверяем, есть ли главный эмодзи пазла в выбранных
      if (newSelected.some(s => s.piece === currentPuzzle.emoji)) {
        // Правильно собрано
        setScore(score + 1)
        setCompletedPuzzles(completedPuzzles + 1)
        
        // Переходим к следующему пазлу
        setTimeout(() => {
          if (currentPuzzleIndex < puzzles.length - 1) {
            const nextIndex = currentPuzzleIndex + 1
            setCurrentPuzzleIndex(nextIndex)
            loadPuzzle(nextIndex, puzzles)
          } else {
            // Все пазлы собраны
            finishGame()
          }
        }, 1000)
      } else {
        // Неправильно - сбрасываем выбор
        setTimeout(() => {
          setSelectedPieces([])
        }, 1000)
      }
    }
  }

  const handleRemovePiece = (index) => {
    setSelectedPieces(selectedPieces.filter((_, i) => i !== index))
  }

  const finishGame = () => {
      // Баллы из настроек за каждый собранный пазл
      const finalScore = completedPuzzles * YELLOW_LEVEL_CONFIG.game2.pointsPerPuzzle
    onComplete(finalScore, 0, {
      puzzles_completed: completedPuzzles,
      total_puzzles: puzzles.length,
      final_score: finalScore
    })
  }

  if (!gameStarted) {
    return (
      <div className="charades">
        <h2>🟡 Шарады</h2>
        <h3>Соберите картинки</h3>
        <p>Соберите 3 пазла, выбирая правильные кусочки!</p>
        <p style={{color: '#ffaa00', marginTop: '1rem'}}>💰 За каждый пазл: <strong>{YELLOW_LEVEL_CONFIG.game2.pointsPerPuzzle} баллов</strong></p>
        <p style={{color: '#ffaa00', marginTop: '0.5rem'}}>📊 Пазлов: <strong>{YELLOW_LEVEL_CONFIG.game2.puzzlesCount}</strong></p>
        <button onClick={startGame} className="start-button">
          Начать
        </button>
      </div>
    )
  }

  if (currentPuzzleIndex >= puzzles.length) {
    return (
      <div className="charades">
        <h2>🎉 Все пазлы собраны!</h2>
        <div style={{marginTop: '2rem'}}>
          <p style={{fontSize: '1.5rem', color: '#44ff44'}}>
            Ваш счет: <strong>{score * YELLOW_LEVEL_CONFIG.game2.pointsPerPuzzle} баллов</strong>
          </p>
          <p style={{fontSize: '1.2rem', marginTop: '1rem'}}>
            Собрано пазлов: {completedPuzzles} из {puzzles.length}
          </p>
        </div>
      </div>
    )
  }

  const currentPuzzle = puzzles[currentPuzzleIndex]

  return (
    <div className="charades" style={{padding: '1rem', maxWidth: '100%', overflow: 'hidden'}}>
      <div className="level-header" style={{marginBottom: '1rem'}}>
        <h2 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>🟡 Шарады</h2>
        <div className="game-stats" style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center'}}>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>
            Пазл: {currentPuzzleIndex + 1}/3
          </div>
          <div className="stat" style={{fontSize: '0.9rem', padding: '0.4rem 0.8rem'}}>
            Собрано: {completedPuzzles}
          </div>
        </div>
      </div>

      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        padding: '2rem',
        borderRadius: '1rem',
        margin: '1rem 0',
        minHeight: '150px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <h3 style={{fontSize: '1.2rem', marginBottom: '1rem'}}>Соберите: {currentPuzzle.name}</h3>
        <div style={{fontSize: '4rem'}}>{currentPuzzle.emoji}</div>
      </div>

      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        padding: '1rem',
        borderRadius: '1rem',
        margin: '1rem 0',
        minHeight: '100px'
      }}>
        <p style={{fontSize: '0.9rem', marginBottom: '0.5rem'}}>Выбранные кусочки:</p>
        <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap'}}>
          {selectedPieces.length === 0 ? (
            <span style={{color: '#aaa'}}>Выберите 3 кусочка...</span>
          ) : (
            selectedPieces.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleRemovePiece(idx)}
                style={{
                  fontSize: '2rem',
                  background: 'rgba(68, 255, 68, 0.3)',
                  border: '2px solid #44ff44',
                  borderRadius: '0.5rem',
                  padding: '0.5rem',
                  cursor: 'pointer'
                }}
              >
                {item.piece}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="pieces-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.75rem',
        margin: '1rem 0',
        padding: '0 0.5rem'
      }}>
        {pieces.map((piece, index) => {
          const isSelected = selectedPieces.some(p => p.index === index)
          return (
            <button
              key={index}
              onClick={() => !isSelected && handlePieceClick(piece, index)}
              disabled={isSelected || selectedPieces.length >= 3}
              style={{
                fontSize: '3rem',
                background: isSelected ? 'rgba(68, 255, 68, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                border: isSelected ? '2px solid #44ff44' : '2px solid transparent',
                borderRadius: '0.75rem',
                padding: '1rem',
                cursor: isSelected || selectedPieces.length >= 3 ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s',
                minHeight: '100px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {piece}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default Charades

