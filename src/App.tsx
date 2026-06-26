import TabSheetEditor from './components/TabSheetEditor'
import './App.css'

function App() {
  return (
    <div className="app-wrapper">
      <header className="app-header">
        <div className="logo-area">
          <span className="logo-icon">🎼</span>
          <span className="logo-text">Sheetor</span>
        </div>
        <p className="header-tagline">
          Interactive Guitar Tab &amp; Sheet Music Engraver
        </p>
      </header>

      <main className="app-main">
        <TabSheetEditor />
      </main>

      <footer className="app-footer">
        <p>Built with React &amp; TypeScript • Web Audio Karplus-Strong Synthesis</p>
      </footer>
    </div>
  )
}

export default App

