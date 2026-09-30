import { useState } from 'react'
import TopBar from './ui/TopBar'
import Toolbar from './ui/Toolbar'
import Stage from './ui/Stage'
import Layers from './ui/Layers'
import Timeline from './ui/Timeline'
import ImportPanel from './ui/ImportPanel'

export default function App() {
  const [importOpen, setImportOpen] = useState(false)
  return (
    <div className="app">
      <TopBar onImport={() => setImportOpen(true)} />
      <div className="main">
        <Toolbar />
        <Stage />
        <Layers />
      </div>
      <Timeline />
      {importOpen && <ImportPanel onClose={() => setImportOpen(false)} />}
    </div>
  )
}
