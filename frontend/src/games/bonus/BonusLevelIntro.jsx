import { useState, useEffect } from 'react'
import './BonusLevelIntro.css'

function BonusLevelIntro({ onStart, gameType }) {
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation(prev => (prev + 5) % 360)
    }, 50)
    return () => clearInterval(interval)
  }, [])

  const gameDescriptions = {
    'gifts': {
      title: '🎁 Поймай подарки',
      description: 'Тапайте по подаркам, которые появляются на экране! Каждый подарок = +5 баллов. Время: 15 секунд.'
    },
    'snowballs': {
      title: '❄️ Снежки',
      description: 'Периодически вылетает снеговик. Нажмите на него как можно быстрее! Каждое попадание = +10 баллов. Время: 15 секунд.'
    },
    'roulette': {
      title: '🎰 Удача или нет?',
      description: 'Крутится рулетка удачи! Может выпасть бонус или штраф. Удачи!'
    },
    'selfie': {
      title: '📸 Селфи-миссия',
      description: 'Сделайте новогоднее селфи! Загрузите фото и получите +50 баллов.'
    }
  }

  const gameInfo = gameDescriptions[gameType] || gameDescriptions['gifts']

  return (
    <div className="bonus-level-intro">
      <div className="santa-container">
        <div 
          className="santa-emoji"
          style={{
            transform: `rotate(${rotation}deg)`,
            fontSize: '8rem',
            transition: 'transform 0.1s ease-out'
          }}
        >
          🎅
        </div>
      </div>
      <h1 className="bonus-title">🎉 БОНУСНЫЙ УРОВЕНЬ!</h1>
      <h2 className="game-title">{gameInfo.title}</h2>
      <p className="game-description">{gameInfo.description}</p>
      <button onClick={onStart} className="start-bonus-button">
        Начать
      </button>
    </div>
  )
}

export default BonusLevelIntro

