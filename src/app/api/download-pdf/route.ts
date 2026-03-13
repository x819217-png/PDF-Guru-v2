import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: '缺少 URL' }, { status: 400 });
    }

    // 验证 URL 格式
    let pdfUrl: URL;
    try {
      pdfUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: '无效的 URL' }, { status: 400 });
    }

    // 下载 PDF
    const response = await fetch(pdfUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SumifyPDF/1.0)',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `下载失败: ${response.status} ${response.statusText}` },
        { status: 400 }
      );
    }

    // 检查 Content-Type
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('pdf')) {
      return NextResponse.json(
        { error: '链接不是 PDF 文件' },
        { status: 400 }
      );
    }

    // 获取文件大小
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'PDF 文件超过 10MB' },
        { status: 400 }
      );
    }

    // 返回 PDF 数据
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return NextResponse.json({
      data: base64,
      filename: pdfUrl.pathname.split('/').pop() || 'document.pdf',
    });

  } catch (error) {
    console.error('URL Download Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '下载失败' },
      { status: 500 }
    );
  }
}
