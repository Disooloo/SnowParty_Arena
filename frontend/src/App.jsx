import { Routes, Route } from 'react-router-dom'
import TVScreen from './screens/TVScreen'
import PlayerScreen from './screens/PlayerScreen'
import CrashScreen from './screens/CrashScreen'

function App() {
  return (
    <Routes>
      <Route path="/tv" element={<TVScreen />} />
      <Route path="/play" element={<PlayerScreen />} />
      <Route path="/crash/:session/:name" element={<CrashScreen />} />
      <Route path="/crash" element={<CrashScreen />} />
      <Route path="/" element={<PlayerScreen />} />
    </Routes>
  )
}

export default App


