import './App.css';
import { AppLayout } from './app/layout/AppLayout';
import { ErrorBoundary } from './app/ErrorBoundary';
import { EditorPage } from './features/editor/pages/EditorPage';

function App() {
  return (
    <AppLayout>
      <ErrorBoundary>
        <EditorPage />
      </ErrorBoundary>
    </AppLayout>
  );
}

export default App;
