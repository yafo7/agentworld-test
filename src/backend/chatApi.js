// Unified LLM API client — supports both DeepSeek direct and backend /api/chat proxy.

const DEEPSEEK_KEY = 'sk-4xxxxxx8';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

const BACKEND_CHAT_URL = '/api/voxel/api/chat';

/**
 * Call DeepSeek API directly (OpenAI-compatible).
 * Returns parsed JSON from the response.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} [temperature=0.8]
 * @param {number} [maxTokens=2048]
 * @returns {Promise<object>}
 */
export async function callDeepSeek(systemPrompt, userPrompt, temperature = 0.8, maxTokens = 2048) {
  const body = {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature,
    max_tokens: maxTokens,
  };

  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI API returned empty response');

  try {
    return JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) return JSON.parse(jsonMatch[1]);
    throw new Error(`Failed to parse AI response as JSON: ${content.slice(0, 200)}`);
  }
}

/**
 * Call backend /api/chat (lightweight LLM proxy).
 * Use this for simple text generation where JSON is not required.
 *
 * @param {Array<{role:string,content:string}>} messages
 * @param {string} [provider='fireworks']
 * @param {number} [temperature=0.7]
 * @param {number} [maxTokens=1024]
 * @returns {Promise<string>}
 */
export async function callBackendChat(messages, provider = 'fireworks', temperature = 0.7, maxTokens = 1024) {
  const resp = await fetch(BACKEND_CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, provider, temperature, maxTokens }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Backend chat error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || 'Backend chat failed');
  return data.content;
}

// Backward-compatible alias for existing prompt modules
export { callDeepSeek as callAI };
