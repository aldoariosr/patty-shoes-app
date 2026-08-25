import { render, screen } from '@testing-library/react';
import App from './App';

test('renderiza el dashboard principal', async () => {
  render(<App />);
  expect(await screen.findByText(/PATTY SHOES/i, {}, { timeout: 8000 })).toBeInTheDocument();
}, 15000);
