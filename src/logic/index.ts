function buildOpenAIMessages(contents: any, systemInstruction: string): any[] {
  const messages: any[] = []
  if (systemInstruction)
    messages.push({ role: 'system', content: systemInstruction })

  for (const content of Array.isArray(contents) ? contents : [contents]) {
    if (typeof content === 'string') {
      messages.push({ role: 'user', content })
    }
    else if ('role' in content && 'parts' in content && Array.isArray(content.parts)) {
      // 多轮对话消息（Gemini 原生格式 { role, parts }）→ OpenAI 消息格式
      const role = content.role === 'model' ? 'assistant' : 'user'
      const parts = content.parts as any[]
      if (parts.every(p => p && typeof p.text === 'string')) {
        messages.push({ role, content: parts.map(p => p.text).join('\n') })
      }
      else {
        messages.push({
          role,
          content: parts.map(p => (p && typeof p.text === 'string')
            ? { type: 'text', text: p.text }
            : { type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } }),
        })
      }
    }
    else if ('text' in content && content.text) {
      messages.push({ role: 'user', content: content.text })
    }
    else if ('inlineData' in content && content.inlineData) {
      messages.push({
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: `data:${content.inlineData.mimeType};base64,${content.inlineData.data}` } }],
      })
    }
  }
  // 合并连续 user 消息
  const merged: any[] = []
  for (const msg of messages) {
    if (msg.role === 'system') { merged.push(msg); continue }
    const last = merged[merged.length - 1]
    if (last && last.role === 'user' && msg.role === 'user') {
      if (Array.isArray(last.content) && Array.isArray(msg.content))
        last.content.push(...msg.content)
      else if (Array.isArray(last.content) && typeof msg.content === 'string')
        last.content.push({ type: 'text', text: msg.content })
      else if (typeof last.content === 'string' && Array.isArray(msg.content))
        last.content = [{ type: 'text', text: last.content }, ...msg.content]
      else
        merged.push(msg)
    }
    else {
      merged.push(msg)
    }
  }
  return merged
}