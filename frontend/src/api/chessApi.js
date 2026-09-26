/**
 * API client to communicate with the FastAPI Stockfish backend.
 */
export async function analyzeFen(fen, depth = 16, multipv = 3) {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fen: fen.trim(),
      depth: Number(depth),
      multipv: Number(multipv),
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Server error: ${response.status}`);
  }

  return response.json();
}

export async function checkBackendHealth() {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) return { ok: false };
    return { ok: true, ...(await response.json()) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
