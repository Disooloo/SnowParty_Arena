import { useEffect, useState } from 'react'
import {
  adminLogin,
  adminGetPlayers,
  adminGetPlayer,
  adminAdjustPoints,
  adminCreateRig,
  adminDeletePlayer,
} from '../utils/api'

const containerStyle = {
  padding: '1rem',
  color: '#fff',
  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
  minHeight: '100vh',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  backgroundImage: `
    radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 40% 80%, rgba(120, 255, 198, 0.1) 0%, transparent 50%)
  `,
}

const cardStyle = {
  background: 'rgba(30, 41, 59, 0.8)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(148, 163, 184, 0.1)',
  borderRadius: '1rem',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
}

const buttonPrimaryStyle = {
  padding: '0.75rem 1.5rem',
  borderRadius: '0.75rem',
  border: 'none',
  background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  color: '#fff',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  fontSize: '0.9rem',
  boxShadow: '0 4px 14px rgba(59, 130, 246, 0.3)',
}

const buttonSecondaryStyle = {
  padding: '0.5rem 1rem',
  borderRadius: '0.5rem',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(30, 41, 59, 0.5)',
  color: '#cbd5e1',
  fontWeight: '500',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  fontSize: '0.85rem',
}

const inputStyle = {
  padding: '0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(30, 41, 59, 0.8)',
  color: '#fff',
  fontSize: '0.9rem',
}

const hoverEffect = {
  transform: 'translateY(-1px)',
  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)',
}

// Медиа-запросы для мобильных устройств
const mobileStyles = `
  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes fadeOut {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }

  @media (max-width: 768px) {
    .admin-container {
      padding: 0.5rem !important;
    }
    .admin-header {
      flex-direction: column !important;
      text-align: center !important;
      gap: 1rem !important;
    }
    .admin-title {
      font-size: 1.8rem !important;
    }
    .players-grid {
      grid-template-columns: 1fr !important;
      gap: 0.75rem !important;
    }
    .player-card {
      padding: 1rem !important;
    }
    .player-info-grid {
      grid-template-columns: 1fr !important;
      gap: 0.75rem !important;
    }
    .balance-controls {
      grid-template-columns: repeat(3, 1fr) !important;
      gap: 0.25rem !important;
    }
    .quick-buttons {
      grid-template-columns: repeat(2, 1fr) !important;
      gap: 0.25rem !important;
    }
    .transaction-item {
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 0.5rem !important;
    }
  }
  @media (max-width: 480px) {
    .admin-title {
      font-size: 1.5rem !important;
    }
    .balance-display {
      font-size: 1.8rem !important;
      padding: 1rem !important;
    }
    .quick-buttons {
      grid-template-columns: 1fr !important;
    }
  }
`

function AdminScreen() {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('disooloo')
  const [token, setToken] = useState(localStorage.getItem('admin_token') || '')
  const [players, setPlayers] = useState([])
  const [sessionFilter, setSessionFilter] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [notification, setNotification] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [delta, setDelta] = useState(0)
  const [newScore, setNewScore] = useState('')
  const [reason, setReason] = useState('')
  const [hidden, setHidden] = useState(false)
  const [rigValue, setRigValue] = useState('')
  const [rigPlayerId, setRigPlayerId] = useState('')
  const [rigApplyOnce, setRigApplyOnce] = useState(true)
  const [rigSession, setRigSession] = useState('')
  const [rigType, setRigType] = useState('case') // 'case' или 'multiplier'
  const [rigPrizeNumber, setRigPrizeNumber] = useState('1')
  const [rigRoundNumber, setRigRoundNumber] = useState('1')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [playerToDelete, setPlayerToDelete] = useState(null)

  useEffect(() => {
    if (token) {
      loadPlayers()
    }
  }, [token, activeOnly, sessionFilter])

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(''), 3000)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const res = await adminLogin(username, password)
      setToken(res.token)
      localStorage.setItem('admin_token', res.token)
      showNotification('Успешный вход в админку!')
      loadPlayers(res.token)
    } catch (err) {
      setError(err.message)
    }
  }

  const loadPlayers = async (overrideToken) => {
    const useToken = overrideToken || token
    if (!useToken) return
    setLoading(true)
    setError('')
    try {
      const res = await adminGetPlayers(useToken, {
        session: sessionFilter || undefined,
        active: activeOnly,
      })
      setPlayers(res.players || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Фильтрация игроков по имени
  const filteredPlayers = players.filter(player =>
    player.name.toLowerCase().includes(nameFilter.toLowerCase())
  )

  const loadPlayerDetail = async (playerId) => {
    setSelectedPlayerId(playerId)
    setSelectedPlayer(null)
    setError('')
    try {
      const data = await adminGetPlayer(token, playerId)
      setSelectedPlayer(data)
      setRigPlayerId(playerId)
      setNewScore(data.final_score?.toString() || '0')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleAdjustPoints = async (e) => {
    e.preventDefault()
    if (!selectedPlayerId) {
      setError('Выберите игрока')
      return
    }
    setError('')
    try {
      const pointsDelta = newScore !== '' ? Number(newScore) - selectedPlayer.final_score : Number(delta)
      await adminAdjustPoints(token, selectedPlayerId, { delta: pointsDelta, reason, hidden })
      showNotification(`Баллы ${selectedPlayer.name} обновлены!`, 'success')
      setReason('')
      setDelta(0)
      setNewScore('')
      await loadPlayers()
      await loadPlayerDetail(selectedPlayerId)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleQuickAdjust = (amount) => {
    if (!selectedPlayer) return
    const currentScore = selectedPlayer.final_score || 0
    const newScoreValue = Math.max(0, currentScore + amount)
    setNewScore(newScoreValue.toString())
  }

  const handleDirectScoreChange = (value) => {
    setNewScore(value)
  }

  const handleCreateRig = async (e) => {
    e.preventDefault()
    setError('')
    if (!rigSession && selectedPlayer?.session_code) {
      setRigSession(selectedPlayer.session_code)
    }

    const value = rigType === 'case' ? parseInt(rigPrizeNumber) : parseFloat(rigValue)

    try {
      await adminCreateRig(token, {
        session: rigSession || selectedPlayer?.session_code,
        value: value,
        player_id: rigPlayerId || selectedPlayer?.id,
        apply_once: rigApplyOnce,
        rig_type: rigType,
        round_number: rigType === 'case' ? parseInt(rigRoundNumber) : null,
      })
      showNotification('Подкрутка сохранена!', 'success')
      // Сброс формы
      setRigValue('')
      setRigPrizeNumber('1')
      setRigRoundNumber('1')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeletePlayer = async (playerId) => {
    setError('')
    try {
      await adminDeletePlayer(token, playerId)
      showNotification('Игрок успешно удалён!', 'success')
      setShowDeleteConfirm(false)
      setPlayerToDelete(null)
      // Обновляем список игроков
      await loadPlayers()
      // Если удалённый игрок был выбран, сбрасываем выбор
      if (selectedPlayerId === playerId) {
        setSelectedPlayer(null)
        setSelectedPlayerId(null)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const confirmDeletePlayer = (player) => {
    setPlayerToDelete(player)
    setShowDeleteConfirm(true)
  }

  const logout = () => {
    localStorage.removeItem('admin_token')
    setToken('')
    setPlayers([])
    setSelectedPlayer(null)
  }

  return (
    <>
      <style>{mobileStyles}</style>
      <div style={containerStyle} className="admin-container">
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          padding: '1rem 0'
      }}>
        <div>
          <h1 style={{
            margin: 0,
            fontSize: '2rem',
            fontWeight: '700',
            background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 0 30px rgba(96, 165, 250, 0.5)'
          }} className="admin-title">
            🎮 Админ-панель
          </h1>
          <p style={{
            margin: '0.5rem 0 0 0',
            color: '#94a3b8',
            fontSize: '0.9rem'
          }}>
            Управление игроками и сессиями
          </p>
        </div>
        {token && (
          <button
            onClick={logout}
            style={{
              ...buttonSecondaryStyle,
              background: 'rgba(239, 68, 68, 0.1)',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              color: '#fca5a5'
            }}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverEffect)}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            🚪 Выйти
          </button>
        )}
      </div>

      {!token && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '70vh'
        }}>
          <div style={{
            ...cardStyle,
            padding: '2rem',
            maxWidth: '400px',
            width: '100%'
          }}>
            <h2 style={{
              margin: '0 0 1.5rem 0',
              textAlign: 'center',
              color: '#60a5fa',
              fontSize: '1.5rem'
            }}>
              🔐 Вход в админку
            </h2>
            <form onSubmit={handleLogin} style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.9rem',
                  color: '#cbd5e1',
                  fontWeight: '500'
                }}>
                  Логин
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Введите логин"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.9rem',
                  color: '#cbd5e1',
                  fontWeight: '500'
                }}>
                  Пароль
                </label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="Введите пароль"
                  style={inputStyle}
                />
              </div>
              <button
                type="submit"
                style={{
                  ...buttonPrimaryStyle,
                  width: '100%',
                  marginTop: '0.5rem'
                }}
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverEffect)}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                🔑 Войти
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Уведомления */}
      {error && (
        <div style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          background: 'rgba(239, 68, 68, 0.95)',
          color: '#fff',
          padding: '1rem 1.5rem',
          borderRadius: '0.75rem',
          boxShadow: '0 8px 32px rgba(239, 68, 68, 0.3)',
          border: '1px solid rgba(239, 68, 68, 0.5)',
          zIndex: 1000,
          maxWidth: '400px',
          backdropFilter: 'blur(10px)',
          animation: 'slideInRight 0.3s ease-out'
        }}>
          <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>❌ Ошибка</div>
          <div style={{ fontSize: '0.9rem' }}>{error}</div>
        </div>
      )}

      {notification && (
        <div style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          background: notification.type === 'success' ? 'rgba(34, 197, 94, 0.95)' : 'rgba(59, 130, 246, 0.95)',
          color: '#fff',
          padding: '1rem 1.5rem',
          borderRadius: '0.75rem',
          boxShadow: `0 8px 32px ${notification.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
          border: `1px solid ${notification.type === 'success' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(59, 130, 246, 0.5)'}`,
          zIndex: 1000,
          maxWidth: '400px',
          backdropFilter: 'blur(10px)',
          animation: 'slideInRight 0.3s ease-out, fadeOut 0.3s ease-out 2.7s',
          transform: 'translateX(0)',
          opacity: 1
        }}>
          <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
            {notification.type === 'success' ? '✅' : 'ℹ️'} {notification.message}
          </div>
        </div>
      )}

      {/* Модальное окно подтверждения удаления */}
      {showDeleteConfirm && playerToDelete && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            backdropFilter: 'blur(4px)'
          }}
        >
          <div
            style={{
              ...cardStyle,
              padding: '2rem',
              maxWidth: '400px',
              width: '100%',
              margin: '1rem',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.8 }}>
              ⚠️
            </div>
            <h3 style={{ margin: '0 0 1rem 0', color: '#ef4444', fontSize: '1.5rem' }}>
              Удалить игрока?
            </h3>
            <p style={{ margin: '0 0 2rem 0', color: '#64748b', lineHeight: '1.5' }}>
              Вы действительно хотите удалить игрока{' '}
              <strong style={{ color: '#f1f5f9' }}>{playerToDelete.name}</strong>?<br />
              Это действие нельзя отменить.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setPlayerToDelete(null)
                }}
                style={{
                  ...buttonSecondaryStyle,
                  flex: 1,
                  background: 'rgba(107, 114, 128, 0.1)',
                  borderColor: 'rgba(107, 114, 128, 0.3)',
                  color: '#9ca3af'
                }}
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverEffect)}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                Отмена
              </button>
              <button
                onClick={() => handleDeletePlayer(playerToDelete.id)}
                style={{
                  ...buttonPrimaryStyle,
                  flex: 1,
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)'
                }}
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverEffect)}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(239, 68, 68, 0.4)'
                }}
              >
                🗑️ Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {token && (
        <div style={{ display: 'grid', gap: '2rem' }}>
          {/* Фильтры и управление */}
          <div style={{
            ...cardStyle,
            padding: '1.5rem'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1.5rem',
              flexWrap: 'wrap'
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '1.5rem',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                👥 Игроки
                <span style={{
                  background: 'rgba(96, 165, 250, 0.2)',
                  color: '#60a5fa',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '1rem',
                  fontSize: '0.8rem',
                  fontWeight: '600'
                }}>
                  {filteredPlayers.length}
                  {nameFilter && ` из ${players.length}`}
                </span>
              </h2>
            </div>

            <div style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{
                  fontSize: '0.8rem',
                  color: '#94a3b8',
                  fontWeight: '500'
                }}>
                  Код сессии
                </label>
                <input
                  value={sessionFilter}
                  onChange={(e) => setSessionFilter(e.target.value.toUpperCase())}
                  placeholder="Например: RJDBGH"
                  style={{
                    ...inputStyle,
                    minWidth: '120px',
                    padding: '0.5rem 0.75rem'
                  }}
                />
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: 'rgba(30, 41, 59, 0.5)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(148, 163, 184, 0.2)'
              }}>
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(e) => setActiveOnly(e.target.checked)}
                  id="activeOnly"
                  style={{
                    accentColor: '#60a5fa',
                    transform: 'scale(1.1)'
                  }}
                />
                <label
                  htmlFor="activeOnly"
                  style={{
                    fontSize: '0.85rem',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                    margin: 0
                  }}
                >
                  Только онлайн (5 мин)
                </label>
              </div>

              <button
                onClick={() => loadPlayers()}
                disabled={loading}
                style={{
                  ...buttonPrimaryStyle,
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
                onMouseEnter={(e) => !loading && Object.assign(e.currentTarget.style, hoverEffect)}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = 'none'
                    e.currentTarget.style.boxShadow = 'none'
                  }
                }}
              >
                {loading ? '⏳ Загрузка...' : '🔄 Обновить'}
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{
                  fontSize: '0.8rem',
                  color: '#94a3b8',
                  fontWeight: '500'
                }}>
                  🔍 Поиск по имени
                </label>
                <input
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  placeholder="Введите имя игрока"
                  style={{
                    ...inputStyle,
                    minWidth: '150px',
                    padding: '0.4rem 0.6rem'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Список игроков */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1rem'
          }} className="players-grid">
            {filteredPlayers.map((p) => (
              <div
                key={p.id}
                style={{
                  ...cardStyle,
                  padding: '1.25rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  border: selectedPlayerId === p.id ? '2px solid #60a5fa' : '1px solid rgba(148, 163, 184, 0.1)',
                  background: selectedPlayerId === p.id
                    ? 'rgba(96, 165, 250, 0.1)'
                    : 'rgba(30, 41, 59, 0.8)'
                }}
                className="player-card"
                onClick={() => loadPlayerDetail(p.id)}
                onMouseEnter={(e) => {
                  if (selectedPlayerId !== p.id) {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.4)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedPlayerId !== p.id) {
                    e.currentTarget.style.transform = 'none'
                    e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)'
                  }
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '1rem'
                }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{
                      margin: '0 0 0.25rem 0',
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      color: '#f1f5f9'
                    }}>
                      {p.name}
                    </h3>
                    <div style={{
                      fontSize: '0.8rem',
                      color: '#94a3b8'
                    }}>
                      Сессия: {p.session_code}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '1.5rem',
                    opacity: p.is_connected ? 1 : 0.3
                  }}>
                    {p.is_connected ? '🟢' : '⚪️'}
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem'
                }}>
                  <div>
                    <div style={{
                      fontSize: '0.8rem',
                      color: '#94a3b8',
                      marginBottom: '0.25rem'
                    }}>
                      Баллы
                    </div>
                    <div style={{
                      fontSize: '1.4rem',
                      fontWeight: '700',
                      color: '#fbbf24',
                      fontFamily: 'monospace'
                    }}>
                      {p.final_score || 0}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '0.8rem',
                      color: '#94a3b8',
                      marginBottom: '0.25rem'
                    }}>
                      Статус
                    </div>
                    <div style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      background: p.status === 'playing' ? 'rgba(34, 197, 94, 0.2)' :
                                 p.status === 'done' ? 'rgba(251, 191, 36, 0.2)' :
                                 'rgba(148, 163, 184, 0.2)',
                      color: p.status === 'playing' ? '#22c55e' :
                             p.status === 'done' ? '#fbbf24' :
                             '#94a3b8',
                      border: `1px solid ${p.status === 'playing' ? 'rgba(34, 197, 94, 0.3)' :
                                          p.status === 'done' ? 'rgba(251, 191, 36, 0.3)' :
                                          'rgba(148, 163, 184, 0.3)'}`
                    }}>
                      {p.status === 'playing' ? 'Играет' :
                       p.status === 'done' ? 'Закончил' :
                       'Ожидает'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      loadPlayerDetail(p.id)
                    }}
                    style={{
                      ...buttonSecondaryStyle,
                      flex: 1,
                      padding: '0.5rem',
                      fontSize: '0.85rem',
                      background: 'rgba(96, 165, 250, 0.1)',
                      borderColor: 'rgba(96, 165, 250, 0.3)',
                      color: '#60a5fa'
                    }}
                    onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverEffect)}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'none'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    📋 Управление
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      confirmDeletePlayer(p)
                    }}
                    style={{
                      ...buttonSecondaryStyle,
                      flex: 1,
                      padding: '0.5rem',
                      fontSize: '0.85rem',
                      background: 'rgba(239, 68, 68, 0.1)',
                      borderColor: 'rgba(239, 68, 68, 0.3)',
                      color: '#ef4444'
                    }}
                    onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverEffect)}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'none'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    🗑️ Удалить
                  </button>
                </div>
              </div>
            ))}

            {filteredPlayers.length === 0 && (
              <div style={{
                ...cardStyle,
                padding: '3rem',
                textAlign: 'center',
                gridColumn: '1 / -1'
              }}>
                <div style={{
                  fontSize: '3rem',
                  marginBottom: '1rem',
                  opacity: 0.5
                }}>
                  👥
                </div>
                <h3 style={{
                  margin: '0 0 0.5rem 0',
                  color: '#94a3b8'
                }}>
                  Игроки не найдены
                </h3>
                <p style={{
                  margin: 0,
                  color: '#64748b',
                  fontSize: '0.9rem'
                }}>
                  Проверьте фильтры или обновите список
                </p>
              </div>
            )}
          </div>

          {selectedPlayer && (
            <div style={{
              ...cardStyle,
              padding: '2rem',
              display: 'grid',
              gap: '2rem'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap'
              }}>
                <h2 style={{
                  margin: 0,
                  fontSize: '1.8rem',
                  color: '#60a5fa',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  👤 {selectedPlayer.name}
                </h2>
                <div style={{
                  background: 'rgba(96, 165, 250, 0.2)',
                  color: '#60a5fa',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '1rem',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  border: '1px solid rgba(96, 165, 250, 0.3)'
                }}>
                  {selectedPlayer.session_code}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '1rem',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  background: selectedPlayer.is_connected ? 'rgba(34, 197, 94, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                  color: selectedPlayer.is_connected ? '#22c55e' : '#94a3b8',
                  border: `1px solid ${selectedPlayer.is_connected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`
                }}>
                  <span style={{ fontSize: '0.9rem' }}>
                    {selectedPlayer.is_connected ? '🟢' : '⚪️'}
                  </span>
                  {selectedPlayer.is_connected ? 'Онлайн' : 'Оффлайн'}
                </div>
              </div>

              {/* Информация об игроке */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem'
              }} className="player-info-grid">
                <div style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(148, 163, 184, 0.2)'
                }}>
                  <div style={{
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                    marginBottom: '0.5rem',
                    fontWeight: '500'
                  }}>
                    Баллы
                  </div>
                  <div style={{
                    fontSize: '1.8rem',
                    fontWeight: '700',
                    color: '#fbbf24',
                    fontFamily: 'monospace'
                  }}>
                    {selectedPlayer.final_score || 0}
                  </div>
                </div>

                <div style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(148, 163, 184, 0.2)'
                }}>
                  <div style={{
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                    marginBottom: '0.5rem',
                    fontWeight: '500'
                  }}>
                    IP адрес
                  </div>
                  <div style={{
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#f1f5f9',
                    fontFamily: 'monospace'
                  }}>
                    {selectedPlayer.ip_address || 'Неизвестен'}
                  </div>
                </div>

                <div style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(148, 163, 184, 0.2)'
                }}>
                  <div style={{
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                    marginBottom: '0.5rem',
                    fontWeight: '500'
                  }}>
                    Устройство
                  </div>
                  <div style={{
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#f1f5f9'
                  }}>
                    {selectedPlayer.device_type || 'Неизвестно'}
                  </div>
                </div>

                <div style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(148, 163, 184, 0.2)'
                }}>
                  <div style={{
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                    marginBottom: '0.5rem',
                    fontWeight: '500'
                  }}>
                    Последняя активность
                  </div>
                  <div style={{
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    color: '#f1f5f9'
                  }}>
                    {selectedPlayer.last_seen ? new Date(selectedPlayer.last_seen).toLocaleString('ru-RU') : 'Неизвестно'}
                  </div>
                </div>
              </div>

              {/* Информация о ключах */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem'
              }}>
                <div style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  textAlign: 'center'
                }}>
                  <div style={{
                    fontSize: '0.8rem',
                    color: '#22c55e',
                    marginBottom: '0.5rem',
                    fontWeight: '600'
                  }}>
                    🗝️ Ключи
                  </div>
                  <div style={{
                    fontSize: '1.8rem',
                    fontWeight: '700',
                    color: '#22c55e',
                    fontFamily: 'monospace'
                  }}>
                    {selectedPlayer.keys_bought || 0}
                  </div>
                </div>

                <div style={{
                  background: 'rgba(251, 191, 36, 0.1)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(251, 191, 36, 0.3)',
                  textAlign: 'center'
                }}>
                  <div style={{
                    fontSize: '0.8rem',
                    color: '#fbbf24',
                    marginBottom: '0.5rem',
                    fontWeight: '600'
                  }}>
                    🎁 Призы
                  </div>
                  <div style={{
                    fontSize: '1.8rem',
                    fontWeight: '700',
                    color: '#fbbf24',
                    fontFamily: 'monospace'
                  }}>
                    {Array.isArray(selectedPlayer.prizes) ? selectedPlayer.prizes.length : 0}
                  </div>
                </div>
              </div>

              {/* Детальная информация о призах */}
              {Array.isArray(selectedPlayer.prizes) && selectedPlayer.prizes.length > 0 && (
                <div style={{
                  background: 'rgba(251, 191, 36, 0.1)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(251, 191, 36, 0.3)'
                }}>
                  <div style={{
                    fontSize: '0.9rem',
                    color: '#fbbf24',
                    marginBottom: '0.5rem',
                    fontWeight: '600'
                  }}>
                    🏆 Выигранные призы
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                    gap: '0.5rem'
                  }}>
                    {selectedPlayer.prizes.map((prize, idx) => (
                      <div key={idx} style={{
                        background: 'rgba(251, 191, 36, 0.2)',
                        color: '#fbbf24',
                        padding: '0.5rem',
                        borderRadius: '0.5rem',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        border: '1px solid rgba(251, 191, 36, 0.4)',
                        textAlign: 'center',
                        fontFamily: 'monospace'
                      }}>
                        #{prize}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(!selectedPlayer.prizes || selectedPlayer.prizes.length === 0) && (
                <div style={{
                  background: 'rgba(148, 163, 184, 0.1)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  textAlign: 'center'
                }}>
                  <div style={{
                    fontSize: '0.9rem',
                    color: '#94a3b8',
                    fontWeight: '600'
                  }}>
                    🎁 Кейсы еще не открывались
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gap: '1rem' }}>
                <h3 style={{ margin: 0, color: '#44ff44', fontSize: '1.2rem' }}>💰 Управление баллами</h3>

                {/* Текущее количество баллов */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(68, 255, 68, 0.1), rgba(0, 136, 0, 0.1))',
                  border: '2px solid rgba(68, 255, 68, 0.3)',
                  borderRadius: '1rem',
                  padding: '1.5rem',
                  textAlign: 'center',
                  boxShadow: '0 4px 15px rgba(68, 255, 68, 0.2)'
                }} className="balance-display">
                  <div style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '0.5rem' }}>Текущие баллы</div>
                  <div style={{
                    fontSize: '2.5rem',
                    fontWeight: 'bold',
                    color: '#44ff44',
                    textShadow: '0 0 20px rgba(68, 255, 68, 0.5)',
                    fontFamily: 'monospace'
                  }}>
                    {selectedPlayer?.final_score || 0}
                  </div>
                </div>

                <form onSubmit={handleAdjustPoints} style={{ display: 'grid', gap: '1rem' }}>
                  {/* Прямое изменение баллов */}
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    <label style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.9rem' }}>
                      🎯 Новое количество баллов
                    </label>
                    <input
                      type="number"
                      value={newScore}
                      onChange={(e) => handleDirectScoreChange(e.target.value)}
                      placeholder="Введите новое значение"
                      min="0"
                      style={{
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        border: '2px solid #374151',
                        background: '#1f2937',
                        color: '#fff',
                        fontSize: '1rem',
                        textAlign: 'center',
                        fontWeight: 'bold'
                      }}
                    />
                  </div>

                  {/* Кнопки быстрого изменения */}
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <label style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.9rem' }}>
                      ⚡ Быстрое изменение
                    </label>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(60px, 1fr))',
                      gap: '0.5rem'
                    }} className="balance-controls">
                      {[5, 10, 30, 50, 70, 100].map(amount => (
                        <div key={amount} style={{ display: 'grid', gap: '0.25rem' }}>
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(amount)}
                            style={{
                              padding: '0.5rem',
                              borderRadius: '0.5rem',
                              border: 'none',
                              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.8))',
                              color: '#fff',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              fontSize: '0.9rem'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.05)'
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(34, 197, 94, 0.4)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)'
                              e.currentTarget.style.boxShadow = 'none'
                            }}
                          >
                            +{amount}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(-amount)}
                            style={{
                              padding: '0.5rem',
                              borderRadius: '0.5rem',
                              border: 'none',
                              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.8), rgba(185, 28, 28, 0.8))',
                              color: '#fff',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              fontSize: '0.9rem'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.05)'
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.4)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)'
                              e.currentTarget.style.boxShadow = 'none'
                            }}
                          >
                            -{amount}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Причина и скрытность */}
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Причина изменения (опционально)"
                      style={{
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        border: '2px solid #374151',
                        background: '#1f2937',
                        color: '#fff',
                        fontSize: '0.9rem'
                      }}
                    />

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '0.5rem',
                      border: '1px solid #374151',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                      e.currentTarget.style.borderColor = '#6b7280'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                      e.currentTarget.style.borderColor = '#374151'
                    }}
                    >
                      <input
                        type="checkbox"
                        checked={hidden}
                        onChange={(e) => setHidden(e.target.checked)}
                        style={{
                          width: '1.2rem',
                          height: '1.2rem',
                          accentColor: '#44ff44'
                        }}
                      />
                      <span style={{ color: '#fff', fontSize: '0.9rem' }}>
                        👁️‍🗨️ <strong>Скрытно</strong> (игрок не увидит уведомление)
                      </span>
                    </label>
                  </div>

                  {/* Кнопка применения */}
                  <button
                    type="submit"
                    style={{
                      ...buttonPrimaryStyle,
                      background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                      boxShadow: '0 4px 15px rgba(34, 197, 94, 0.4)',
                      width: '100%',
                      padding: '1rem',
                      fontSize: '1rem',
                      fontWeight: '600'
                    }}
                    onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverEffect)}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'none'
                      e.currentTarget.style.boxShadow = '0 4px 15px rgba(34, 197, 94, 0.4)'
                    }}
                  >
                    ✅ Применить изменения
                  </button>
                </form>
              </div>

              <div style={{
                ...cardStyle,
                padding: '1.5rem'
              }}>
                <h3 style={{
                  margin: '0 0 1rem 0',
                  color: '#a78bfa',
                  fontSize: '1.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  🎲 Подкрутка (Rig)
                  <span style={{
                    background: 'rgba(167, 139, 250, 0.2)',
                    color: '#a78bfa',
                    padding: '0.1rem 0.5rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.7rem',
                    fontWeight: '600'
                  }}>
                    Управление результатами
                  </span>
                </h3>

                <form onSubmit={handleCreateRig} style={{ display: 'grid', gap: '1rem' }}>
                  {/* Тип подкрутки */}
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    <label style={{
                      fontSize: '0.9rem',
                      color: '#cbd5e1',
                      fontWeight: '600'
                    }}>
                      🎯 Тип подкрутки
                    </label>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '0.5rem'
                    }}>
                      <button
                        type="button"
                        onClick={() => setRigType('case')}
                        style={{
                          padding: '0.75rem',
                          borderRadius: '0.5rem',
                          border: rigType === 'case' ? '2px solid #a78bfa' : '1px solid rgba(148, 163, 184, 0.3)',
                          background: rigType === 'case' ? 'rgba(167, 139, 250, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                          color: rigType === 'case' ? '#a78bfa' : '#cbd5e1',
                          fontWeight: rigType === 'case' ? '600' : '500',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          fontSize: '0.85rem'
                        }}
                      >
                        🎁 Кейс (1-20)
                      </button>
                      <button
                        type="button"
                        onClick={() => setRigType('multiplier')}
                        style={{
                          padding: '0.75rem',
                          borderRadius: '0.5rem',
                          border: rigType === 'multiplier' ? '2px solid #a78bfa' : '1px solid rgba(148, 163, 184, 0.3)',
                          background: rigType === 'multiplier' ? 'rgba(167, 139, 250, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                          color: rigType === 'multiplier' ? '#a78bfa' : '#cbd5e1',
                          fontWeight: rigType === 'multiplier' ? '600' : '500',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          fontSize: '0.85rem'
                        }}
                      >
                        💰 Множитель
                      </button>
                    </div>
                  </div>

                  {/* Параметры подкрутки */}
                  {rigType === 'case' ? (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      <div style={{ display: 'grid', gap: '0.5rem' }}>
                        <label style={{
                          fontSize: '0.85rem',
                          color: '#cbd5e1',
                          fontWeight: '500'
                        }}>
                          🎲 Номер приза (1-20)
                        </label>
                        <select
                          value={rigPrizeNumber}
                          onChange={(e) => setRigPrizeNumber(e.target.value)}
                          style={{
                            ...inputStyle,
                            padding: '0.5rem 0.75rem'
                          }}
                        >
                          {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                            <option key={num} value={num.toString()}>
                              Приз #{num}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: 'grid', gap: '0.5rem' }}>
                        <label style={{
                          fontSize: '0.85rem',
                          color: '#cbd5e1',
                          fontWeight: '500'
                        }}>
                          🔢 Номер раунда
                        </label>
                        <select
                          value={rigRoundNumber}
                          onChange={(e) => setRigRoundNumber(e.target.value)}
                          style={{
                            ...inputStyle,
                            padding: '0.5rem 0.75rem'
                          }}
                        >
                          {[1, 2, 3, 4, 5].map(num => (
                            <option key={num} value={num.toString()}>
                              Раунд #{num}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <label style={{
                        fontSize: '0.85rem',
                        color: '#cbd5e1',
                        fontWeight: '500'
                      }}>
                        💰 Множитель
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="1"
                        value={rigValue}
                        onChange={(e) => setRigValue(e.target.value)}
                        placeholder="Например: 2.5 или 10.0"
                        style={inputStyle}
                      />
                    </div>
                  )}

                  {/* Настройки применения */}
                  <div style={{
                    background: 'rgba(30, 41, 59, 0.5)',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(148, 163, 184, 0.2)'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      marginBottom: '0.75rem'
                    }}>
                      <input
                        type="checkbox"
                        checked={rigApplyOnce}
                        onChange={(e) => setRigApplyOnce(e.target.checked)}
                        id="rigApplyOnce"
                        style={{
                          accentColor: '#a78bfa',
                          transform: 'scale(1.2)'
                        }}
                      />
                      <label
                        htmlFor="rigApplyOnce"
                        style={{
                          fontSize: '0.9rem',
                          color: '#cbd5e1',
                          cursor: 'pointer',
                          margin: 0
                        }}
                      >
                        🔥 Одноразово (применится один раз)
                      </label>
                    </div>

                    <div style={{
                      fontSize: '0.8rem',
                      color: '#94a3b8',
                      lineHeight: '1.4'
                    }}>
                      {rigApplyOnce
                        ? 'Подкрутка применится только к следующему результату'
                        : 'Подкрутка будет действовать постоянно до отключения'
                      }
                    </div>
                  </div>

                  {/* Информация о цели */}
                  <div style={{
                    background: 'rgba(167, 139, 250, 0.1)',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(167, 139, 250, 0.3)'
                  }}>
                    <div style={{
                      fontSize: '0.85rem',
                      color: '#a78bfa',
                      fontWeight: '600',
                      marginBottom: '0.5rem'
                    }}>
                      🎯 Цель подкрутки
                    </div>
                    <div style={{
                      fontSize: '0.9rem',
                      color: '#cbd5e1',
                      lineHeight: '1.4'
                    }}>
                      Игрок: <strong style={{ color: '#a78bfa' }}>{selectedPlayer.name}</strong><br />
                      {rigType === 'case'
                        ? `Приз #${rigPrizeNumber} на раунде #${rigRoundNumber}`
                        : `Множитель: ${rigValue || 'не указан'}`
                      }
                    </div>
                  </div>

                  {/* Кнопка применения */}
                  <button
                    type="submit"
                    style={{
                      ...buttonPrimaryStyle,
                      background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
                      boxShadow: '0 4px 15px rgba(167, 139, 250, 0.4)',
                      width: '100%',
                      padding: '1rem',
                      fontSize: '1rem',
                      fontWeight: '600'
                    }}
                    onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverEffect)}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'none'
                      e.currentTarget.style.boxShadow = '0 4px 15px rgba(167, 139, 250, 0.4)'
                    }}
                  >
                    🎲 Сохранить подкрутку
                  </button>
                </form>
              </div>

              <div style={{
                ...cardStyle,
                padding: '1.5rem'
              }}>
                <h3 style={{
                  margin: '0 0 1rem 0',
                  color: '#60a5fa',
                  fontSize: '1.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  📊 История транзакций
                  <span style={{
                    background: 'rgba(96, 165, 250, 0.2)',
                    color: '#60a5fa',
                    padding: '0.1rem 0.5rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.7rem',
                    fontWeight: '600'
                  }}>
                    {(selectedPlayer.transactions || []).length}
                  </span>
                </h3>

                <div style={{
                  maxHeight: '300px',
                  overflowY: 'auto',
                  display: 'grid',
                  gap: '0.75rem',
                  paddingRight: '0.5rem'
                }}>
                  {(selectedPlayer.transactions || []).map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: '1rem',
                        background: 'rgba(30, 41, 59, 0.6)',
                        borderRadius: '0.75rem',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.2s ease'
                      }}
                      className="transaction-item"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.8)'
                        e.currentTarget.style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.6)'
                        e.currentTarget.style.transform = 'none'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          marginBottom: '0.25rem'
                        }}>
                          <span style={{
                            fontSize: '1.2rem',
                            opacity: t.amount >= 0 ? 1 : 0.7
                          }}>
                            {t.amount > 0 ? '🟢' : '🔴'}
                          </span>
                          <span style={{
                            fontSize: '1.1rem',
                            fontWeight: '700',
                            color: t.amount > 0 ? '#22c55e' : '#ef4444',
                            fontFamily: 'monospace'
                          }}>
                            {t.amount > 0 ? '+' : ''}{t.amount}
                          </span>
                          {t.is_hidden && (
                            <span style={{
                              background: 'rgba(148, 163, 184, 0.2)',
                              color: '#94a3b8',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '0.25rem',
                              fontSize: '0.7rem',
                              fontWeight: '600'
                            }}>
                              скрытно
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: '0.85rem',
                          color: '#cbd5e1',
                          fontWeight: '500'
                        }}>
                          {t.reason || 'Причина не указана'}
                        </div>
                      </div>
                      <div style={{
                        fontSize: '0.8rem',
                        color: '#94a3b8',
                        textAlign: 'right'
                      }}>
                        {t.created_at ? new Date(t.created_at).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : '—'}
                      </div>
                    </div>
                  ))}
                  {(selectedPlayer.transactions || []).length === 0 && (
                    <div style={{
                      textAlign: 'center',
                      padding: '2rem',
                      color: '#64748b',
                      fontSize: '0.9rem'
                    }}>
                      <div style={{
                        fontSize: '2rem',
                        marginBottom: '1rem',
                        opacity: 0.5
                      }}>
                        📝
                      </div>
                      Нет операций с баллами
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </>
  )
}

export default AdminScreen

