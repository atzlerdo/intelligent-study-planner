import React from 'react'
import ReactDOM from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'
import './styles/globals.css'

// Intercept window.open to center Google OAuth popup on current screen (multi-monitor fix)
const originalWindowOpen = window.open;
window.open = function (url?: string | URL, target?: string, features?: string): WindowProxy | null {
  // Only modify Google OAuth popups
  if (url && typeof url === 'string' && url.includes('accounts.google.com')) {
    const popupWidth = 500;
    const popupHeight = 600;
    
    // Get the current window's position and size
    const windowLeft = window.screenX ?? window.screenLeft;
    const windowTop = window.screenY ?? window.screenTop;
    const windowWidth = window.outerWidth;
    const windowHeight = window.outerHeight;
    
    // Calculate center position: window position + (window size - popup size) / 2
    const left = Math.round(windowLeft + (windowWidth - popupWidth) / 2);
    const top = Math.round(windowTop + (windowHeight - popupHeight) / 2);
    
    const customFeatures = `width=${popupWidth},height=${popupHeight},left=${left},top=${top},popup=yes`;
    console.log('🪟 Opening Google popup:', { 
      window: { left: windowLeft, top: windowTop, width: windowWidth, height: windowHeight },
      popup: { left, top, width: popupWidth, height: popupHeight }
    });
    return originalWindowOpen.call(window, url, target, customFeatures);
  }
  return originalWindowOpen.call(window, url, target, features);
};

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={clientId}>
        <App />
      </GoogleOAuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
