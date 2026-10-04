import { env } from '../../config/env.js';

/**
 * Universal Groq LLM Client for FoodSaver
 * Uses openai/gpt-oss-120b as specified
 */

export async function generateLLMResponse({
  messages = [],
  systemPrompt = '',
  maxTokens = 1000,
  temperature = 0.6
}) {
  const apiKey = env.groq?.apiKey || process.env.GROQ_API_KEY;
  const model = env.groq?.model || 'openai/gpt-oss-120b';
  const apiUrl = (env.groq?.apiUrl || 'https://api.groq.com/openai/v1') + '/chat/completions';

  const fullMessages = [];
  if (systemPrompt) {
    fullMessages.push({ role: 'system', content: systemPrompt });
  }
  for (const m of messages) {
    fullMessages.push({ role: m.role || 'user', content: m.content || '' });
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: fullMessages,
          max_tokens: maxTokens,
          temperature
        })
      });

      if (res.status === 429 && attempt === 0) {
        console.warn('[Groq Rate Limit 429] Waiting 2.5s before retry...');
        await new Promise(r => setTimeout(r, 2500));
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error('[Groq LLM Error]:', res.status, errText);
        throw new Error(`Groq LLM failed: ${res.status}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || '';
    } catch (err) {
      if (attempt === 1) throw err;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

export async function streamLLMResponse({
  messages = [],
  systemPrompt = '',
  onToken,
  maxTokens = 1000,
  temperature = 0.6
}) {
  const apiKey = env.groq?.apiKey || process.env.GROQ_API_KEY;
  const model = env.groq?.model || 'openai/gpt-oss-120b';
  const apiUrl = (env.groq?.apiUrl || 'https://api.groq.com/openai/v1') + '/chat/completions';

  const fullMessages = [];
  if (systemPrompt) {
    fullMessages.push({ role: 'system', content: systemPrompt });
  }
  for (const m of messages) {
    fullMessages.push({ role: m.role || 'user', content: m.content || '' });
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: fullMessages,
          max_tokens: maxTokens,
          temperature,
          stream: true
        })
      });

      if (res.status === 429 && attempt === 0) {
        console.warn('[Groq Stream Rate Limit 429] Waiting 2.5s before retry...');
        await new Promise(r => setTimeout(r, 2500));
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq Stream failed: ${res.status} ${errText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          if (trimmed === 'data: [DONE]') continue;

          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              accumulatedContent += delta.content;
              if (onToken) {
                onToken(delta.content);
              }
            }
          } catch {}
        }
      }

      return accumulatedContent.trim();
    } catch (err) {
      if (attempt === 1) throw err;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}