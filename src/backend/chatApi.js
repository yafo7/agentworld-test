// Unified LLM API client. Browser code only talks to the backend proxy so API
// credentials never ship in the client bundle.

const BACKEND_CHAT_URL = '/api/voxel/api/chat';

/**
 * Request DeepSeek through the backend proxy.
 * Returns parsed JSON from the response.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} [temperature=0.8]
 * @param {number} [maxTokens=2048]
 * @returns {Promise<object>}
 */
export async function callDeepSeek(systemPrompt, userPrompt, temperature = 0.8, maxTokens = 2048) {
  const content = await callBackendChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], 'deepseek', temperature, maxTokens);

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
