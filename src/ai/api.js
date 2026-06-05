// DeepSeek API client — OpenAI-compatible chat completions.

const API_KEY = 'sk-49e1871170a442bcb963cc45f68a4988';
const API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';

/**
 * Call the DeepSeek API with a system prompt and user prompt.
 * Returns parsed JSON from the response.
 *
 * @param {string} systemPrompt — role & task definition
 * @param {string} userPrompt   — specific data/context
 * @returns {Promise<object>} parsed JSON response
 */
export async function callAI(systemPrompt, userPrompt) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
    max_tokens: 2048,
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
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
    // Try to extract JSON from markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) return JSON.parse(jsonMatch[1]);
    throw new Error(`Failed to parse AI response as JSON: ${content.slice(0, 200)}`);
  }
}
