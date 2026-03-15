import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// 支持的模型配置
const MODELS = {
  'gpt-4o': { provider: 'openai', endpoint: 'https://api.openai.com/v1/chat/completions' },
  'deepseek-chat': { provider: 'deepseek', endpoint: 'https://api.deepseek.com/v1/chat/completions', apiKeyEnv: 'DEEPSEEK_API_KEY' },
  'qwen-turbo': { provider: 'qwen', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', apiKeyEnv: 'DASHSCOPE_API_KEY' },
  'qwen-plus': { provider: 'qwen', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', apiKeyEnv: 'DASHSCOPE_API_KEY' },
  'qwen-max': { provider: 'qwen', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', apiKeyEnv: 'DASHSCOPE_API_KEY' },
  'glm-4': { provider: 'zhipu', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', apiKeyEnv: 'ZHIPU_API_KEY' },
  'glm-4-flash': { provider: 'zhipu', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', apiKeyEnv: 'ZHIPU_API_KEY' },
  'ernie-4': { provider: 'baidu', endpoint: 'https://qianfan.baidubce.com/v2/chat/completions', apiKeyEnv: 'BAIDU_API_KEY' },
  'ernie-speed': { provider: 'baidu', endpoint: 'https://qianfan.baidubce.com/v2/chat/completions', apiKeyEnv: 'BAIDU_API_KEY' },
};

const DEFAULT_MODEL = (process.env.DEFAULT_MODEL as keyof typeof MODELS) || 'glm-4-flash';

// 流式调用 AI
async function* streamAI(modelName: string, messages: { role: string; content: string }[]) {
  const model = MODELS[modelName as keyof typeof MODELS] || MODELS[DEFAULT_MODEL];
  const apiKeyEnv = (model as any).apiKeyEnv || 'OPENAI_API_KEY';
  const apiKey = process.env[apiKeyEnv];
  
  if (!apiKey) throw new Error(`请配置环境变量: ${apiKeyEnv}`);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  
  if (model.provider === 'openai' || model.provider === 'deepseek' || model.provider === 'qwen' || model.provider === 'zhipu') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model.provider === 'baidu') {
    headers['Authorization'] = `Basic ${Buffer.from(`:${apiKey}`).toString('base64')}`;
  }

  const response = await fetch(model.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelName,
      messages,
      max_tokens: 2000,
      temperature: 0.7,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI API 错误: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取响应');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {}
      }
    }
  }
}

// 非流式调用 AI
async function callAI(modelName: string, messages: { role: string; content: string }[]) {
  const model = MODELS[modelName as keyof typeof MODELS] || MODELS[DEFAULT_MODEL];
  const apiKeyEnv = (model as any).apiKeyEnv || 'OPENAI_API_KEY';
  const apiKey = process.env[apiKeyEnv];
  
  if (!apiKey) throw new Error(`请配置环境变量: ${apiKeyEnv}`);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  
  if (model.provider === 'openai' || model.provider === 'deepseek' || model.provider === 'qwen' || model.provider === 'zhipu') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model.provider === 'baidu') {
    headers['Authorization'] = `Basic ${Buffer.from(`:${apiKey}`).toString('base64')}`;
  }

  const response = await fetch(model.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelName,
      messages,
      max_tokens: 2000,
      temperature: 0.7,
    }),
  });

  if (!response.ok) throw new Error(`AI API 错误: ${response.status}`);
  
  const data = await response.json();
  return data.choices[0]?.message?.content;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, question, summary, model, template, extractKeywords, batch, stream, userEmail } = body;
    const selectedModel = model || DEFAULT_MODEL;
    const useStream = stream !== false;

    // 追问场景（不消耗用量）
    if (question && summary) {
      const messages = [
        { role: 'system', content: '你是一个 PDF 文档助手，基于给定的摘要内容回答用户问题。如果问题超出摘要范围，请如实告知。请用中文回答。' },
        { role: 'user', content: `摘要内容：\n${summary}\n\n问题：${question}` },
      ];

      // 追问使用流式
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamAI(selectedModel, messages)) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          } catch (e) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: (e instanceof Error ? e.message : "error") })}\n\n`));
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    // PDF 摘要场景 — 先检查用量
    if (!text) {
      return NextResponse.json({ error: '缺少 PDF 文本内容' }, { status: 400 });
    }

    // 登录用户：通过 D1 检查用量
    if (userEmail) {
      const consumeRes = await fetch(`${request.nextUrl.origin}/api/user/consume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': userEmail },
      });
      if (!consumeRes.ok) {
        const err = await consumeRes.json() as any;
        return NextResponse.json({ error: err.message || 'No credits', upgrade: true }, { status: 402 });
      }
    }

    const truncatedText = text.slice(0, 15000);

    let systemPrompt = '';
    switch (template) {
      case 'academic':
        systemPrompt = '你是一个学术文献摘要助手。请生成结构化的学术摘要，包含：1）研究背景与目的；2）研究方法；3）主要发现；4）结论与意义。使用学术语言，保持客观严谨。页码标注规则：在每个要点末尾必须用 [P数字] 格式标注来源页码，例如 [P3] 表示第3页，[P12] 表示第12页，只用这个格式，不要用其他格式。';
        break;
      case 'business':
        systemPrompt = '你是一个商业文档摘要助手。请生成商业报告摘要，包含：1）核心观点；2）关键数据与指标；3）行动建议；4）风险与机会。使用简洁专业的商业语言。页码标注规则：在每个要点末尾必须用 [P数字] 格式标注来源页码，例如 [P3] 表示第3页，[P12] 表示第12页，只用这个格式，不要用其他格式。';
        break;
      case 'simple':
        systemPrompt = '你是一个文档摘要助手。请用最简单易懂的语言总结文档，包含：1）这篇文档讲什么；2）3-5个关键要点；3）为什么重要。避免专业术语，像给朋友解释一样。页码标注规则：在每个要点末尾必须用 [P数字] 格式标注来源页码，例如 [P3] 表示第3页，[P12] 表示第12页，只用这个格式，不要用其他格式。';
        break;
      default:
        systemPrompt = '你是一个专业的文档摘要助手。请仔细阅读用户提供的文档内容，然后生成一个简洁、结构化的摘要。要求：1）用中文输出；2）包含文档的主要主题和目的；3）列出关键内容要点（3-5个）；4）标注文档类型。页码标注规则：在每个要点末尾必须用 [P数字] 格式标注来源页码，例如 [P3] 表示第3页，[P12] 表示第12页，只用这个格式，不要用其他格式。';
    }

    if (batch) {
      systemPrompt += '\n\n这是多个文档的内容，请生成对比分析摘要，突出各文档的异同点。';
    }

    const summaryMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请为以下文档生成摘要：\n\n${truncatedText}` },
    ];

    // 如果使用流式
    if (useStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // 流式发送摘要
            let fullSummary = '';
            for await (const chunk of streamAI(selectedModel, summaryMessages)) {
              fullSummary += chunk;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'summary', content: chunk })}\n\n`));
            }

            // 关键词提取（摘要完成后，仅一次 AI 调用）
            if (extractKeywords) {
              const keywordMessages = [
                { role: 'system', content: '你是一个关键词提取助手。请从文档中提取 5-10 个最重要的关键词或短语，用逗号分隔，只返回关键词列表。' },
                { role: 'user', content: `文档内容：\n${truncatedText.slice(0, 5000)}` },
              ];
              const keywordResult = await callAI(selectedModel, keywordMessages);
              const keywords = keywordResult.split(/[,，、]/).map((k: string) => k.trim()).filter((k: string) => k);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'keywords', content: keywords })}\n\n`));
            }

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          } catch (e) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: (e instanceof Error ? e.message : "error") })}\n\n`));
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    // 非流式返回（兼容旧版）
    const aiSummary = await callAI(selectedModel, summaryMessages);
    
    let keywords: string[] = [];
    if (extractKeywords) {
      const keywordMessages = [
        { role: 'system', content: '你是一个关键词提取助手。请从文档中提取 5-10 个最重要的关键词或短语，用逗号分隔，只返回关键词列表，不要其他内容。' },
        { role: 'user', content: `文档内容：\n${truncatedText.slice(0, 5000)}` },
      ];
      const keywordResult = await callAI(selectedModel, keywordMessages);
      keywords = keywordResult.split(/[,，、]/).map((k: string) => k.trim()).filter((k: string) => k);
    }

    return NextResponse.json({ summary: aiSummary, keywords });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '服务器错误' },
      { status: 500 }
    );
  }
}
