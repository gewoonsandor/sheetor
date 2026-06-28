import './App.css';
import { AppLayout } from './app/layout/AppLayout';
import { EditorPage } from './features/editor/pages/EditorPage';

function App() {
  return (
    <AppLayout>
      <EditorPage />
    </AppLayout>
  );
}

export default App;
