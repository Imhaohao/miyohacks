import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthKitProvider, useAuth } from '@workos-inc/authkit-react';
import { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithAuthKit } from './ConvexProviderWithAuthKit';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';

function requireEnv(name: string): string {
  const value = import.meta.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required. Add it to my-app/.env.local.`);
  }
  return value;
}

const convexUrl = requireEnv('VITE_CONVEX_URL');
const workosClientId = requireEnv('VITE_WORKOS_CLIENT_ID');
const workosRedirectUri = requireEnv('VITE_WORKOS_REDIRECT_URI');
const convex = new ConvexReactClient(convexUrl);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthKitProvider
        clientId={workosClientId}
        redirectUri={workosRedirectUri}
      >
        <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
          <App />
        </ConvexProviderWithAuthKit>
      </AuthKitProvider>
    </ErrorBoundary>
  </StrictMode>,
);
