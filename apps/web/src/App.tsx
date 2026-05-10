import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { Splash } from './routes/Splash.js';
import { trpc, trpcClient } from './lib/trpc.js';

export function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Splash />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
