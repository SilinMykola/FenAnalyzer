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

export async function getAiCommentary({
  fen,
  turn,
  score,
  best_move_san,
  explanation,
  verbal_verdict,
  custom_api_key,
  model,
}) {
  const response = await fetch('/api/ai-commentary', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fen,
      turn,
      score,
      best_move_san,
      explanation,
      verbal_verdict,
      custom_api_key: custom_api_key || undefined,
      model: model || undefined,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Server error: ${response.status}`);
  }

  return response.json();
}

/**
 * Reads a chess position from an image (sent as base64) using Gemini.
 * Resolves to { success, fen, turn_detected, is_valid, model, error,
 * retry_after_seconds }.
 */
export async function recognizeImage({ image_base64, mime_type, custom_api_key, model }) {
  const response = await fetch('/api/recognize-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_base64,
      mime_type,
      custom_api_key: custom_api_key || undefined,
      model: model || undefined,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Server error: ${response.status}`);
  }

  return response.json();
}

/**
 * The Gemini models the API key can use, for the model picker.
 * Resolves to { success, models, default_model, error }.
 */
export async function listGeminiModels({ custom_api_key }) {
  const response = await fetch('/api/gemini-models', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      custom_api_key: custom_api_key || undefined,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Server error: ${response.status}`);
  }

  return response.json();
}
