import { Routes, Route } from 'react-router-dom'
import TVScreen from './screens/TVScreen'
import PlayerScreen from './screens/PlayerScreen'
import CrashScreen from './screens/CrashScreen'
import KazinoIndex from './kazino/index'
import SlotsGame from './kazino/slots/SlotsGame'
import BlackjackGame from './kazino/blackjack/BlackjackGame'

function App() {
  return (
    <Routes>
      <Route path="/tv" element={<TVScreen />} />
      <Route path="/play" element={<PlayerScreen />} />
      <Route path="/crash/:session/:name" element={<CrashScreen />} />
      <Route path="/crash" element={<CrashScreen />} />
      <Route path="/kazino" element={<KazinoIndex />} />
      <Route path="/kazino/slots" element={<SlotsGame />} />
      <Route path="/kazino/blackjack" element={<BlackjackGame />} />
      <Route path="/" element={<PlayerScreen />} />
    </Routes>
  )
}

export default App


