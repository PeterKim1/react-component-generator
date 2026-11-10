import {
  stripCodeFences,
  ensureRenderCall,
  createSSEParser,
  anthropicDelta,
  googleDelta,
} from './generator';
import { withModelFallback } from './fallback';

// 우선순위 순서. 앞 모델이 실패하면 다음 모델로 폴백한다.
const GOOGLE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

const SYSTEM_PROMPT = `You are a React component generator. Generate a single React component based on the user's description.

Rules:
- Use inline styles only (no CSS imports, no CSS modules)
- Do NOT use import statements — React is already available in scope as a global
- Define the component as a function, then call render(<ComponentName />) at the end
- Make the component visually appealing with proper styling
- Use React hooks if needed (e.g., React.useState, React.useEffect)
- The component must be completely self-contained
- Respond with ONLY the code block — no explanations, no markdown fences
- Use descriptive variable names and clean formatting
- For colors, prefer modern palettes (gradients, shadows, etc.)
- Ensure the component is interactive where appropriate (hover states, click handlers, etc.)
- Do NOT use TypeScript syntax — no type annotations, no interfaces, no generics, no "as" casts. Write plain JavaScript only.

Example output format:
const GradientButton = () => {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      style={{
        background: hovered
          ? 'linear-gradient(135deg, #667eea, #764ba2)'
          : 'linear-gradient(135deg, #764ba2, #667eea)',
        color: 'white',
        border: 'none',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '16px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Click me
    </button>
  );
};

render(<GradientButton />);`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Provider = 'anthropic' | 'google';

const ENV_KEYS: Record<Provider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
};

function resolveApiKey(provider: Provider, clientKey?: string): string | null {
  return clientKey || ENV_KEYS[provider] || null;
}

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

async function callGoogleModel(prompt: string, apiKey: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates: Array<{
      content: { parts: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
  }

  return (
    candidate?.content?.parts
      ?.map((part) => part.text)
      ?.join('') ?? ''
  );
}

async function callGoogle(prompt: string, apiKey: string): Promise<string> {
  return withModelFallback(GOOGLE_MODELS, (model) => callGoogleModel(prompt, apiKey, model));
}

// provider의 SSE 응답 본문을 읽어 텍스트 델타를 하나씩 내보낸다.
async function* sseTextDeltas(
  response: Response,
  extract: (data: string) => string,
): AsyncGenerator<string> {
  if (!response.body) throw new Error('응답 본문이 없습니다.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const feed = createSSEParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      for (const data of feed(decoder.decode(value, { stream: true }))) {
        const text = extract(data);
        if (text) yield text;
      }
    }
  } finally {
    // 소비자가 중단하면(클라이언트 연결 종료 등) 업스트림 요청도 취소해 토큰 낭비를 막는다.
    await reader.cancel().catch(() => {});
  }
}

// 연결과 상태 코드 검사는 스트림을 열기 전에 끝낸다. 실패하면 일반 에러 응답으로 매핑된다.
async function streamAnthropic(prompt: string, apiKey: string): Promise<AsyncGenerator<string>> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  return sseTextDeltas(response, anthropicDelta);
}

async function streamGoogleModel(prompt: string, apiKey: string, model: string): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  return response;
}

async function streamGoogle(prompt: string, apiKey: string): Promise<AsyncGenerator<string>> {
  const response = await withModelFallback(GOOGLE_MODELS, (model) =>
    streamGoogleModel(prompt, apiKey, model),
  );

  return sseTextDeltas(response, (data) => {
    const { text, truncated } = googleDelta(data);
    if (truncated) {
      throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
    }
    return text;
  });
}

// 요청 본문을 검증한다. 잘못된 요청이면 400 Response를 그대로 돌려준다.
async function parseGenerateRequest(
  req: Request,
): Promise<{ prompt: string; resolvedKey: string; provider: Provider } | Response> {
  const { prompt, apiKey, provider = 'anthropic' } = (await req.json()) as {
    prompt: string;
    apiKey?: string;
    provider?: Provider;
  };

  const resolvedKey = resolveApiKey(provider, apiKey);

  if (!resolvedKey) {
    return Response.json(
      { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (!prompt) {
    return Response.json(
      { error: 'Prompt is required' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  return { prompt, resolvedKey, provider };
}

function errorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : 'Unknown error';

  if (message.includes('503')) {
    return Response.json(
      { error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.' },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  if (message.includes('429')) {
    return Response.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429, headers: CORS_HEADERS }
    );
  }

  return Response.json(
    { error: message },
    { status: 500, headers: CORS_HEADERS }
  );
}

// 스트림 도중 발생한 에러는 상태 코드를 바꿀 수 없으므로 error 이벤트의 메시지로 전달한다.
function streamErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Unknown error';
  if (message.includes('503')) return 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.';
  if (message.includes('429')) return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
  return message;
}

const server = Bun.serve({
  port: 3002,
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return Response.json(
        {
          envKeys: {
            anthropic: !!ENV_KEYS.anthropic,
            google: !!ENV_KEYS.google,
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      try {
        const parsed = await parseGenerateRequest(req);
        if (parsed instanceof Response) return parsed;
        const { prompt, resolvedKey, provider } = parsed;

        const text =
          provider === 'google'
            ? await callGoogle(prompt, resolvedKey)
            : await callAnthropic(prompt, resolvedKey);

        const code = ensureRenderCall(stripCodeFences(text));

        return Response.json({ code }, { headers: CORS_HEADERS });
      } catch (err) {
        return errorResponse(err);
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/generate/stream') {
      try {
        const parsed = await parseGenerateRequest(req);
        if (parsed instanceof Response) return parsed;
        const { prompt, resolvedKey, provider } = parsed;

        const deltas =
          provider === 'google'
            ? await streamGoogle(prompt, resolvedKey)
            : await streamAnthropic(prompt, resolvedKey);

        // NDJSON: 한 줄에 이벤트 하나 (delta | done | error)
        const encoder = new TextEncoder();
        let cancelled = false;
        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (event: object) =>
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            let full = '';
            try {
              for await (const text of deltas) {
                if (cancelled) return;
                full += text;
                send({ type: 'delta', text });
              }
              if (!full.trim()) throw new Error('모델이 빈 응답을 반환했습니다. 다시 시도해주세요.');
              send({ type: 'done', code: ensureRenderCall(stripCodeFences(full)) });
            } catch (err) {
              if (cancelled) return;
              send({ type: 'error', error: streamErrorMessage(err) });
            }
            if (!cancelled) controller.close();
          },
          cancel() {
            // 클라이언트가 연결을 끊으면 for-await가 다음 델타에서 멈추며 업스트림 reader를 취소한다.
            cancelled = true;
          },
        });

        return new Response(body, {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
        });
      } catch (err) {
        return errorResponse(err);
      }
    }

    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS }
    );
  },
});

console.log(`API server running at http://localhost:${server.port}`);
