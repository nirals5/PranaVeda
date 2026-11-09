import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AlexaLinkRoute from './components/AlexaLinkRoute.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/link/alexa' ? <AlexaLinkRoute /> : <App />}
  </StrictMode>,
);
