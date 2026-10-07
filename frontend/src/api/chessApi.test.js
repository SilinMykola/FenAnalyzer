import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeFen, checkBackendHealth, getAiCommentary, recognizeImage } from './chessApi';

// A stand-in for the browser's fetch: every test decides what the "server"
// answers, and can then inspect what the client sent.
const fetchMock = vi.fn();

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

// A response whose body is not JSON, such as an HTML error page from a proxy.
function brokenResponse(status) {
  return {
    ok: false,
    status,
    json: () => Promise.reject(new SyntaxError('Unexpected token <')),
  };
}

// The JSON body of the n-th fetch call.
const sentBody = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  return () => vi.unstubAllGlobals();
});

describe('analyzeFen', () => {
  it('posts the trimmed FEN with numeric depth and line count', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ lines: [] }));

    await analyzeFen('  8/8/8/8/8/8/8/8 w - - 0 1 ', '12', '2');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/analyze');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(sentBody()).toEqual({ fen: '8/8/8/8/8/8/8/8 w - - 0 1', depth: 12, multipv: 2 });
  });

  it('uses depth 16 and 3 lines by default', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await analyzeFen('fen');

    expect(sentBody()).toMatchObject({ depth: 16, multipv: 3 });
  });

  it('returns the parsed analysis', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ verbal_verdict: 'Even position' }));

    await expect(analyzeFen('fen')).resolves.toEqual({ verbal_verdict: 'Even position' });
  });

  it("throws the server's error detail", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Invalid FEN string' }, { status: 400 }));

    await expect(analyzeFen('nonsense')).rejects.toThrow('Invalid FEN string');
  });

  it('throws the status code when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(brokenResponse(502));

    await expect(analyzeFen('fen')).rejects.toThrow('Server error: 502');
  });
});

describe('checkBackendHealth', () => {
  it('reports ok together with the health details', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok', engine_available: true }));

    await expect(checkBackendHealth()).resolves.toEqual({
      ok: true,
      status: 'ok',
      engine_available: true,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/health');
  });

  it('reports not ok on an error status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 500 }));

    await expect(checkBackendHealth()).resolves.toEqual({ ok: false });
  });

  it('reports not ok, without throwing, when the server is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(checkBackendHealth()).resolves.toEqual({ ok: false, error: 'Failed to fetch' });
  });
});

describe('getAiCommentary', () => {
  const request = {
    fen: 'some fen',
    turn: 'white',
    score: '+0.30',
    best_move_san: 'e4',
    explanation: 'Pawn moves to e4',
    verbal_verdict: 'Even position',
  };

  it('posts the position details to the commentary endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, commentary: 'Grab the centre.' }));

    const result = await getAiCommentary({ ...request, custom_api_key: 'user-key' });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/ai-commentary');
    expect(sentBody()).toEqual({ ...request, custom_api_key: 'user-key' });
    expect(result).toEqual({ success: true, commentary: 'Grab the centre.' });
  });

  it('leaves the key out when the user has not set one', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await getAiCommentary({ ...request, custom_api_key: '' });

    // An empty key would override the server's own key, so it must not be sent.
    expect(sentBody()).not.toHaveProperty('custom_api_key');
  });

  it("throws the server's error detail", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'field required' }, { status: 422 }));

    await expect(getAiCommentary(request)).rejects.toThrow('field required');
  });

  it('throws the status code when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(brokenResponse(500));

    await expect(getAiCommentary(request)).rejects.toThrow('Server error: 500');
  });
});

describe('recognizeImage', () => {
  const request = { image_base64: 'aGVsbG8=', mime_type: 'image/png' };

  it('posts the image to the recognition endpoint', async () => {
    const answer = { success: true, fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1' };
    fetchMock.mockResolvedValue(jsonResponse(answer));

    const result = await recognizeImage({ ...request, custom_api_key: 'user-key' });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/recognize-image');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(sentBody()).toEqual({ ...request, custom_api_key: 'user-key' });
    expect(result).toEqual(answer);
  });

  it('leaves the key out when the user has not set one', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await recognizeImage({ ...request, custom_api_key: '' });

    expect(sentBody()).not.toHaveProperty('custom_api_key');
  });

  it("throws the server's error detail", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: 'Image is larger than 10 MB.' }, { status: 413 })
    );

    await expect(recognizeImage(request)).rejects.toThrow('Image is larger than 10 MB.');
  });

  it('throws the status code when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(brokenResponse(502));

    await expect(recognizeImage(request)).rejects.toThrow('Server error: 502');
  });
});
