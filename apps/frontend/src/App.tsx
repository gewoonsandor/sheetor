import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import { AppLayout } from './app/layout/AppLayout';
import { ErrorBoundary } from './app/ErrorBoundary';
import { EditorHome } from './features/editor/pages/EditorHome';
import { EditorPage } from './features/editor/pages/EditorPage';
import { LibraryPage } from './features/library/pages/LibraryPage';
import { SettingsPage } from './features/settings/pages/SettingsPage';
import { AuthGate } from './app/AuthGate';

function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <AppLayout>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<EditorHome />} />
              <Route path="/songs/:songId" element={<EditorPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<EditorHome />} />
            </Routes>
          </ErrorBoundary>
        </AppLayout>
      </AuthGate>
    </BrowserRouter>
  );
}

export default App;
