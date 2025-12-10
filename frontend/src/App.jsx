import { Routes, Route } from 'react-router-dom'
import TVScreen from './screens/TVScreen'
import PlayerScreen from './screens/PlayerScreen'

function App() {
  return (
    <Routes>
      <Route path="/tv" element={<TVScreen />} />
      <Route path="/play" element={<PlayerScreen />} />
      <Route path="/" element={<PlayerScreen />} />
    </Routes>
  )
}

export default App


