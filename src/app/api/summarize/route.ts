import { NextRequest, NextResponse } from 'next/server';

// 支持的模型配置
const MODELS = {
  // OpenAI
  'gpt-4o': {
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
  // DeepSeek
  'deepseek-chat': {
    provider: 'deepseek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  },
  // 阿里云通义千问
  'qwen-turbo': {
    provider: 'qwen',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
  },
  'qwen-plus': {
    provider: 'qwen',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
  },
  'qwen-max': {
    provider: 'qwen',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
  },
  // 智谱 GLM
  'glm-4': {
    provider: 'zhipu',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    apiKeyEnv: 'ZHIPU_API_KEY',
  },
  'glm-4-flash': {
    provider: 'zhipu',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    apiKeyEnv: 'ZHIPU_API_KEY',
  },
  // 百度文心
  'ernie-4': {
    provider: 'baidu',
    endpoint: 'https://qianfan.baidubce.com/v2/chat/completions',
    apiKeyEnv: 'BAIDU_API_KEY',
  },
  'ernie-speed': {
    provider: 'baidu',
    endpoint: 'https://qianfan.baidubce.com/v2/chat/completions',
    apiKeyEnv: 'BAIDU_API_KEY',
  },
};

// 默认使用 DeepSeek
const DEFAULT_MODEL = 'deepseek-chat';

async function callAI(modelName: string, messages: { role: string; content: string }[]) {
  const modelKey = modelName as keyof typeof MODELS;
  const model = MODELS[modelKey] || MODELS[DEFAULT_MODEL];
  const apiKeyEnv = (model as any).apiKeyEnv || 'OPENAI_API_KEY';
  const apiKey = process.env[apiKeyEnv];
  
  if (!apiKey) {
    throw new Error(`请配置环境变量: ${apiKeyEnv}`);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 根据不同 provider 设置认证方式
  if (model.provider === 'openai' || model.provider === 'deepseek') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model.provider === 'qwen') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model.provider === 'zhipu') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model.provider === 'baidu') {
    const baiduToken = Buffer.from(`:${apiKey}`).toString('base64');
    headers['Authorization'] = `Basic ${baiduToken}`;
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

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI API 错误: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, question, summary, model } = body;
    const selectedModel = model || DEFAULT_MODEL;

    // 追问场景
    if (question && summary) {
      const messages = [
        {
          role: 'system',
          content: '你是一个 PDF 文档助手，基于给定的摘要内容回答用户问题。如果问题超出摘要范围，请如实告知。请用中文回答。',
        },
        {
          role: 'user',
          content: `摘要内容：\n${summary}\n\n问题：${question}`,
        },
      ];

      const answer = await callAI(selectedModel, messages);
      return NextResponse.json({ answer });
    }

    // PDF 摘要场景 - 接收已提取的文本
    if (!text) {
      return NextResponse.json({ error: '缺少 PDF 文本内容' }, { status: 400 });
    }

    // 截取文本避免超出 token 限制
    const truncatedText = text.slice(0, 15000);

    const messages = [
      {
        role: 'system',
        content: '你是一个专业的文档摘要助手。请仔细阅读用户提供的文档内容，然后生成一个简洁、结构化的摘要。要求：1）用中文输出；2）包含文档的主要主题和目的；3）列出关键内容要点（3-5个）；4）标注文档类型。',
      },
      {
        role: 'user',
        content: `请为以下文档生成摘要：\n\n${truncatedText}`,
      },
    ];

    const aiSummary = await callAI(selectedModel, messages);
    return NextResponse.json({ summary: aiSummary });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '服务器错误' },
      { status: 500 }
    );
  }
}
