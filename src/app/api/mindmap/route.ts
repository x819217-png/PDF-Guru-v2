import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const MODELS: Record<string, { provider: string; endpoint: string; apiKeyEnv?: string }> = {
  'glm-4-flash': { provider: 'zhipu', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', apiKeyEnv: 'ZHIPU_API_KEY' },
  'deepseek-chat': { provider: 'deepseek', endpoint: 'https://api.deepseek.com/v1/chat/completions', apiKeyEnv: 'DEEPSEEK_API_KEY' },
};

const DEFAULT_MODEL = (process.env.DEFAULT_MODEL as keyof typeof MODELS) || 'glm-4-flash';

async function callAI(modelName: string, messages: { role: string; content: string }[]) {
  const model = MODELS[modelName] || MODELS[DEFAULT_MODEL];
  const apiKey = process.env[model.apiKeyEnv || 'ZHIPU_API_KEY'];
  if (!apiKey) throw new Error(`请配置环境变量: ${model.apiKeyEnv}`);

  const response = await fetch(model.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: modelName, messages, max_tokens: 2000, temperature: 0.5 }),
  });
  if (!response.ok) throw new Error(`AI API 错误: ${response.status}`);
  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

export async function POST(request: NextRequest) {
  try {
    const { summary, messages, model } = await request.json();
    if (!summary) return NextResponse.json({ error: '缺少摘要内容' }, { status: 400 });

    const selectedModel = model || DEFAULT_MODEL;

    // 把对话内容也纳入思维导图生成
    const chatContext = messages && messages.length > 0
      ? '\n\n用户追问内容：\n' + messages.map((m: any) => `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}`).join('\n')
      : '';

    const prompt = `请根据以下文档摘要${chatContext ? '和用户追问' : ''}生成一个思维导图结构。
返回严格的 JSON 格式：{"name":"根主题","children":[{"name":"分支1","children":[{"name":"详情1"}]}]}
只返回 JSON，不要其他内容。

文档摘要：
${summary}${chatContext}`;

    const result = await callAI(selectedModel, [
      { role: 'system', content: '你是一个思维导图生成助手，只返回 JSON 格式的思维导图结构。' },
      { role: 'user', content: prompt },
    ]);

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('无法解析思维导图数据');
    const mindmap = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ mindmap });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '生成失败' }, { status: 500 });
  }
}
