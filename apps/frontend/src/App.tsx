import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import { AppLayout } from './app/layout/AppLayout';
import { ErrorBoundary } from './app/ErrorBoundary';
import { EditorPage } from './features/editor/pages/EditorPage';
import { LibraryPage } from './features/library/pages/LibraryPage';
import { SettingsPage } from './features/settings/pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <AppLayout>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<EditorPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<EditorPage />} />
          </Routes>
        </ErrorBoundary>
      </AppLayout>
    </BrowserRouter>
  );
}

export default App;
