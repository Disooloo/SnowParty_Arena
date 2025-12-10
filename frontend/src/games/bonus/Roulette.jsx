import { useState, useEffect } from 'react'
import './Roulette.css'

const REWARDS = [
  { type: 'bonus', value: 10, text: '+10% прогресса', emoji: '📈', color: '#44ff44' },
  { type: 'bonus', value: 2, text: '×2 очка за следующий уровень', emoji: '✨', color: '#44ff44' },
  { type: 'penalty', value: -10, text: '-10 баллов', emoji: '😢', color: '#ff4444' },
  { type: 'penalty', value: -50, text: '-50 баллов', emoji: '💔', color: '#ff4444' },
  { type: 'bonus', value: 50, text: '+50 баллов', emoji: '🎉', color: '#44ff44' },
]

function Roulette({ onComplete }) {
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState(null)
  const [rotation, setRotation] = useState(0)

  const spin = () => {
    if (spinning) return
    
    setSpinning(true)
    setResult(null)
    
    // Случайный результат
    const randomReward = REWARDS[Math.floor(Math.random() * REWARDS.length)]
    
    // Вращение (2-4 полных оборота + случайный угол)
    const spins = 2 + Math.random() * 2
    const finalRotation = rotation + (spins * 360) + (Math.random() * 360)
    
    setRotation(finalRotation)
    
    // Показываем результат через 2 секунды
    setTimeout(() => {
      setResult(randomReward)
      setSpinning(false)
      
      // Завершаем игру через 2 секунды после показа результата
      setTimeout(() => {
        onComplete(randomReward.value, 0, { 
          game_type: 'roulette', 
          reward: randomReward,
          final_score: randomReward.value
        })
      }, 2000)
    }, 2000)
  }

  return (
    <div className="roulette" style={{padding: '1rem', maxWidth: '100%', overflow: 'hidden'}}>
      <h2>🎰 Удача или нет?</h2>
      
      <div className="roulette-container" style={{
        position: 'relative',
        width: '300px',
        height: '300px',
        margin: '2rem auto',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        {/* Внешний круг рулетки */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          border: '8px solid rgba(255, 255, 255, 0.3)',
          boxShadow: '0 0 30px rgba(68, 255, 68, 0.5), inset 0 0 20px rgba(0, 0, 0, 0.3)',
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, rgba(0, 0, 0, 0.2) 100%)',
          zIndex: 1
        }} />
        
        {/* Колесо рулетки */}
        <div 
          className="roulette-wheel"
          style={{
            position: 'relative',
            width: '280px',
            height: '280px',
            borderRadius: '50%',
            overflow: 'hidden',
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? 'transform 2s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
            boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.5)',
            border: '4px solid rgba(255, 255, 255, 0.5)',
            zIndex: 2
          }}
        >
          {REWARDS.map((reward, index) => {
            const angle = (360 / REWARDS.length) * index
            const segmentAngle = 360 / REWARDS.length
            return (
              <div
                key={index}
                className="roulette-segment"
                style={{
                  position: 'absolute',
                  width: '50%',
                  height: '50%',
                  transformOrigin: '100% 100%',
                  transform: `rotate(${angle}deg)`,
                  clipPath: `polygon(0 0, 100% 0, 100% 100%)`,
                  background: `linear-gradient(${angle + segmentAngle / 2}deg, ${reward.color} 0%, ${reward.color}dd 100%)`,
                  borderRight: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <div className="segment-content" style={{
                  position: 'absolute',
                  top: '20%',
                  left: '30%',
                  transform: `rotate(${angle + segmentAngle / 2}deg)`,
                  textAlign: 'center',
                  color: '#fff',
                  textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)'
                }}>
                  <div style={{fontSize: '2rem', marginBottom: '0.25rem'}}>{reward.emoji}</div>
                  <div style={{fontSize: '0.7rem', fontWeight: 'bold', lineHeight: '1.2'}}>{reward.text}</div>
                </div>
              </div>
            )
          })}
          
          {/* Центральный круг */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255, 255, 255, 0.9) 0%, rgba(200, 200, 200, 0.9) 100%)',
            border: '4px solid rgba(68, 255, 68, 0.8)',
            boxShadow: '0 0 20px rgba(68, 255, 68, 0.6), inset 0 0 10px rgba(0, 0, 0, 0.2)',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            fontWeight: 'bold',
            color: '#000'
          }}>
            🎰
          </div>
        </div>
        
        {/* Указатель */}
        <div className="roulette-pointer" style={{
          position: 'absolute',
          top: '-10px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '3rem',
          color: '#44ff44',
          textShadow: '0 0 10px rgba(68, 255, 68, 0.8), 0 0 20px rgba(68, 255, 68, 0.5)',
          zIndex: 20,
          filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5))'
        }}>▼</div>
      </div>
      
      {result && (
        <div 
          className="result-display"
          style={{
            marginTop: '2rem',
            padding: '2rem',
            background: result.color,
            borderRadius: '1rem',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#000'
          }}
        >
          <div style={{fontSize: '3rem', marginBottom: '0.5rem'}}>{result.emoji}</div>
          <div>{result.text}</div>
        </div>
      )}
      
      {!spinning && !result && (
        <button onClick={spin} className="spin-button">
          Крутить рулетку!
        </button>
      )}
    </div>
  )
}

export default Roulette

