import { useEffect, useState } from 'react'
import TopBar from './ui/TopBar'
import Toolbar from './ui/Toolbar'
import Stage from './ui/Stage'
import Layers from './ui/Layers'
import Timeline from './ui/Timeline'
import ImportPanel from './ui/ImportPanel'
import Tutorial, { TOUR_SEEN_KEY } from './ui/Tutorial'
import Help from './ui/Help'

export default function App() {
  const [importOpen, setImportOpen] = useState(false)
  const [tour, setTour] = useState(false)
  const [help, setHelp] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(TOUR_SEEN_KEY)) setTour(true)
  }, [])

  const closeTour = () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1')
    setTour(false)
  }

  return (
    <div className="app">
      <TopBar onImport={() => setImportOpen(true)} onHelp={() => setHelp(true)} />
      <div className="main">
        <Toolbar />
        <Stage />
        <Layers />
      </div>
      <Timeline />
      {importOpen && <ImportPanel onClose={() => setImportOpen(false)} />}
      {help && (
        <Help
          onClose={() => setHelp(false)}
          onTour={() => {
            setHelp(false)
            setTour(true)
          }}
        />
      )}
      {tour && <Tutorial onClose={closeTour} />}
    </div>
  )
}
