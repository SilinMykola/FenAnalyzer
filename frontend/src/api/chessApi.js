/**
 * API client to communicate with the FastAPI Stockfish backend.
 */

const START_HINT = 'Start the app with ./start.sh in the project folder';

// The browser's own messages for these cases ("Failed to fetch", "Server
// error: 500") do not say what to do, so requests go through here.
async function postJson(url, body) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    // No answer at all: the dev server that serves this page is not running.
    throw new Error(`Cannot reach the app's server. ${START_HINT}, then reload this page.`);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    if (errorData?.detail) throw new Error(errorData.detail);
    // The backend always answers with JSON; a bare 5xx comes from the dev
    // server's proxy when the backend behind it is not running.
    if (!errorData && response.status >= 500) {
      throw new Error(
        `Server error: ${response.status} — the backend is not answering. ${START_HINT}.`
      );
    }
    throw new Error(`Server error: ${response.status}`);
  }

  return response.json();
}

export async function analyzeFen(fen, depth = 16, multipv = 3, chess960 = false) {
  return postJson('/api/analyze', {
    fen: fen.trim(),
    depth: Number(depth),
    multipv: Number(multipv),
    // Only sent for a Chess960 game, so Stockfish plays its castling.
    chess960: chess960 || undefined,
  });
}

/**
 * Replays a PGN on the backend, which knows Chess960 (chess.js does not).
 * Resolves to { success, headers, moves: [{ san, uci, color, before }],
 * fens, chess960, error }.
 */
export async function parsePgn(pgn) {
  return postJson('/api/parse-pgn', { pgn });
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
  focus,
  lines,
}) {
  return postJson('/api/ai-commentary', {
    fen,
    turn,
    score,
    best_move_san,
    explanation,
    verbal_verdict,
    custom_api_key: custom_api_key || undefined,
    model: model || undefined,
    // "evaluation" asks why the position is rated so, backed by the lines.
    focus: focus || undefined,
    lines: lines || undefined,
  });
}

/**
 * Reads a chess position from an image (sent as base64) using Gemini, or
 * with reader 'local' on the backend against the calibrated board.
 * Resolves to { success, fen, turn_detected, is_valid, model, error,
 * retry_after_seconds }.
 */
export async function recognizeImage({ image_base64, mime_type, custom_api_key, model, reader }) {
  return postJson('/api/recognize-image', {
    image_base64,
    mime_type,
    custom_api_key: custom_api_key || undefined,
    model: model || undefined,
    reader: reader || undefined,
  });
}

/** Whether the local reader has been calibrated. Resolves to { calibrated }. */
export async function getLocalReaderStatus() {
  const response = await fetch('/api/local-reader');
  if (!response.ok) throw new Error(`Server error: ${response.status}`);
  return response.json();
}

/**
 * Teaches the local reader the board and pieces from a screenshot of the
 * starting position. Resolves to { success, fen, seen_from_black, error }.
 */
export async function calibrateLocalReader({ image_base64, mime_type }) {
  return postJson('/api/local-reader/calibrate', { image_base64, mime_type });
}

/**
 * The Gemini models the API key can use, for the model picker.
 * Resolves to { success, models, default_model, error }.
 */
export async function listGeminiModels({ custom_api_key }) {
  return postJson('/api/gemini-models', {
    custom_api_key: custom_api_key || undefined,
  });
}
