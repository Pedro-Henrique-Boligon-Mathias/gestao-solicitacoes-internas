import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// O Testing Library só avança relógios falsos quando acha o global `jest`. Com os timers
// falsos do Vitest, o setTimeout(0) interno dele nunca dispara e o teste trava.
Object.assign(globalThis, {
  jest: { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) },
});

afterEach(() => {
  cleanup();
});
