import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import App from './App';
import { initSentry, Sentry } from './lib/sentry';
import './index.css';

// Error-tracking startujemy przed renderem (no-op gdy brak VITE_SENTRY_DSN).
initSentry();

/**
 * Jeden klient React Query na cala aplikacje.
 * retry: 1 — przy bledzie 4xx nie ma sensu ponawiac w nieskonczonosc.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!, {
  // Bledy renderu React (React 19) trafiaja do error-trackingu (no-op gdy wylaczone).
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    {/* attribute="class" -> next-themes dopisuje klase .dark do <html>, czego oczekuje Tailwind */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
          <Toaster position="bottom-right" richColors />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
