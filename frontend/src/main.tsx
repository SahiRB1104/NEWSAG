import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './index.css';
import 'nprogress/nprogress.css';
import { ClerkProvider } from '@clerk/clerk-react';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Clerk Publishable Key');
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/login">
      <App />
    </ClerkProvider>
  </React.StrictMode>
);
