import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image } = body;

    if (!image) {
      return NextResponse.json({ error: '缺少图片数据' }, { status: 400 });
    }

    const apiKey = process.env.BAIDU_OCR_API_KEY;
    const secretKey = process.env.BAIDU_OCR_SECRET_KEY;

    if (!apiKey || !secretKey) {
      return NextResponse.json(
        { error: '请配置百度 OCR API Key' },
        { status: 500 }
      );
    }

    // 1. 获取 access_token
    const tokenResponse = await fetch(
      `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`,
      { method: 'POST' }
    );

    if (!tokenResponse.ok) {
      throw new Error('获取 access_token 失败');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 2. 调用 OCR API（通用文字识别-高精度版）
    const ocrResponse = await fetch(
      `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `image=${encodeURIComponent(image)}&language_type=CHN_ENG`,
      }
    );

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      throw new Error(`OCR API 错误: ${errorText}`);
    }

    const ocrData = await ocrResponse.json();

    if (ocrData.error_code) {
      throw new Error(`OCR 错误: ${ocrData.error_msg}`);
    }

    // 3. 提取文字
    const text = ocrData.words_result
      .map((item: any) => item.words)
      .join('\n');

    return NextResponse.json({ text });
  } catch (error) {
    console.error('OCR Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OCR 识别失败' },
      { status: 500 }
    );
  }
}
