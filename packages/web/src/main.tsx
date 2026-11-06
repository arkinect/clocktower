import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './ui/tokens.css';

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
