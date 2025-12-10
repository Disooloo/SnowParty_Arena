import { useState, useEffect, useRef } from 'react'
import { uploadSelfie } from '../../utils/api'
import './SelfieMission.css'

const SELFIE_TASKS = [
  'с ёлкой',
  'с Дедом Морозом',
  'в новогодней шапке',
  'с подарком',
  'с снеговиком',
  'с гирляндой',
  'в новогоднем настроении',
  'с конфетти',
]

function SelfieMission({ onComplete, playerName, playerToken }) {
  const [task, setTask] = useState('')
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [completed, setCompleted] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    // Выбираем случайную задачу
    const randomTask = SELFIE_TASKS[Math.floor(Math.random() * SELFIE_TASKS.length)]
    setTask(randomTask)
  }, [])

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImage(file)
        setImagePreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleContinue = async () => {
    console.log('🖼️ handleContinue вызван', { image: !!image, playerToken: !!playerToken, task })
    if (!image) {
      console.error('❌ Нет изображения')
      alert('Пожалуйста, выберите изображение')
      return
    }
    if (!playerToken) {
      console.error('❌ Нет токена игрока')
      alert('Ошибка: токен игрока не найден')
      return
    }
    
    setUploading(true)
    try {
      console.log('📤 Начинаем загрузку селфи...')
      // Загружаем селфи на сервер
      const result = await uploadSelfie(playerToken, image, task)
      console.log('✅ Селфи загружено успешно:', result)
      setCompleted(true)
      setUploading(false)
      
      // Сохраняем состояние после успешной загрузки
      try {
        const { saveGameState } = await import('../../utils/storage')
        const savedState = JSON.parse(localStorage.getItem('game_state') || '{}')
        saveGameState({
          ...savedState,
          lastSelfieUpload: new Date().toISOString(),
          selfieUploaded: true
        })
        console.log('✅ Состояние игры сохранено после загрузки селфи')
      } catch (err) {
        console.error('❌ Ошибка сохранения состояния после загрузки селфи:', err)
      }
      
      // Отправляем результат через 1 секунду
      setTimeout(() => {
        console.log('🎯 Вызываем onComplete с результатом')
        onComplete(50, 0, { 
          game_type: 'selfie', 
          task: task,
          image_url: result.image_url,
          player_name: playerName,
          final_score: 50,
          selfie_uploaded: true // Флаг что селфи загружено
        })
      }, 1000)
    } catch (error) {
      console.error('❌ Ошибка загрузки селфи:', error)
      setUploading(false)
      alert(`Ошибка загрузки селфи: ${error.message}. Попробуйте еще раз.`)
    }
  }

  if (completed) {
    return (
      <div className="selfie-mission" style={{padding: '2rem', textAlign: 'center', color: 'white'}}>
        <h2 style={{fontSize: '2rem', marginBottom: '1rem'}}>🎉 Отлично!</h2>
        <p style={{fontSize: '1.5rem', color: '#44ff44'}}>Вы получили +50 баллов!</p>
      </div>
    )
  }

  return (
    <div className="selfie-mission" style={{padding: '1rem', maxWidth: '100%', overflow: 'hidden'}}>
      <h2>📸 Селфи-миссия</h2>
      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        padding: '1.5rem',
        borderRadius: '1rem',
        margin: '1.5rem 0'
      }}>
        <p style={{fontSize: '1.3rem', marginBottom: '1rem'}}>Ваша задача:</p>
        <p style={{fontSize: '1.5rem', color: '#ffd700', fontWeight: 'bold'}}>
          Сделайте селфи {task}!
        </p>
      </div>

      {!imagePreview ? (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleFileSelect}
            style={{display: 'none'}}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="take-selfie-button"
            style={{
              padding: '1.5rem 3rem',
              fontSize: '1.3rem',
              background: '#44ff44',
              color: '#000',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 'bold',
              marginTop: '1rem',
              width: '100%',
              maxWidth: '300px'
            }}
          >
            📷 Сделать селфи
          </button>
        </div>
      ) : (
        <div>
          <div style={{
            margin: '1rem 0',
            borderRadius: '1rem',
            overflow: 'hidden',
            maxWidth: '400px',
            margin: '1rem auto'
          }}>
            <img 
              src={imagePreview} 
              alt="Selfie" 
              style={{
                width: '100%',
                height: 'auto',
                display: 'block'
              }}
            />
          </div>
          <button
            onClick={handleContinue}
            disabled={uploading}
            className="continue-button"
            style={{
              padding: '1rem 2rem',
              fontSize: '1.2rem',
              background: uploading ? '#888' : '#ffaa00',
              color: '#000',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: uploading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              marginTop: '1rem',
              width: '100%',
              maxWidth: '300px'
            }}
          >
            {uploading ? 'Загрузка...' : 'Продолжить (+50 баллов)'}
          </button>
        </div>
      )}
    </div>
  )
}

export default SelfieMission

