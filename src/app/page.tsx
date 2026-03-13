'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

type Status = 'idle' | 'extracting' | 'ocr' | 'processing' | 'success' | 'error';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<string>('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [question, setQuestion] = useState('');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfLibLoaded, setPdfLibLoaded] = useState(false);

  // 动态加载 pdf.js
  useEffect(() => {
    import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      (window as any).pdfjsLib = pdfjs;
      setPdfLibLoaded(true);
    });
  }, []);

  // 提取 PDF 文本
  const extractPDFText = async (pdfFile: File): Promise<string> => {
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) {
      throw new Error('PDF 库加载失败，请刷新页面重试');
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    const numPages = pdf.numPages;

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
      
      setProgress(Math.round((i / numPages) * 50)); // 文本提取占 50%
    }

    return fullText;
  };

  // OCR 识别（将 PDF 转为图片后识别）
  const ocrPDF = async (pdfFile: File): Promise<string> => {
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) {
      throw new Error('PDF 库加载失败');
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    const numPages = Math.min(pdf.numPages, 10); // 限制最多 10 页

    for (let i = 1; i <= numPages; i++) {
      setStatusText(`正在识别第 ${i}/${numPages} 页...`);
      setProgress(50 + Math.round((i / numPages) * 40)); // OCR 占 40%

      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      
      // 创建 canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // 渲染 PDF 页面到 canvas
      await page.render({
        canvasContext: context!,
        viewport: viewport,
      }).promise;

      // 转为 base64
      const imageData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

      // 调用 OCR API
      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'OCR 识别失败');
      }

      const data = await response.json();
      fullText += data.text + '\n\n';
    }

    return fullText;
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
      setSummary('');
      setError('');
    } else {
      setError('请上传 PDF 文件');
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setSummary('');
      setError('');
    } else if (selectedFile) {
      setError('请上传 PDF 文件');
    }
  }, []);

  const handleSubmit = async () => {
    if (!file) return;

    setStatus('extracting');
    setError('');
    setProgress(0);
    setStatusText('正在提取文本...');

    try {
      // 1. 尝试提取 PDF 文本
      let text = await extractPDFText(file);
      
      // 2. 如果文本为空或太少，使用 OCR
      if (!text.trim() || text.trim().length < 50) {
        setStatus('ocr');
        setStatusText('检测到扫描件，正在识别...');
        text = await ocrPDF(file);
        
        if (!text.trim()) {
          throw new Error('无法从 PDF 中提取或识别文本');
        }
      }

      setStatus('processing');
      setStatusText('正在生成摘要...');
      setProgress(90);

      // 3. 调用 API 生成摘要
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          filename: file.name,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '处理失败');
      }

      const data = await response.json();
      setSummary(data.summary);
      setProgress(100);
      setStatus('success');
      setStatusText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '处理失败，请重试');
      setStatus('error');
      setStatusText('');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(summary);
    alert('已复制到剪贴板');
  };

  const handleDownload = () => {
    const blob = new Blob([summary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'summary.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAskQuestion = async () => {
    if (!question.trim() || !summary) return;

    setStatus('processing');
    setError('');

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          summary,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '提问失败');
      }

      const data = await response.json();
      setSummary(prev => prev + '\n\n---\n\n问: ' + question.trim() + '\n答: ' + data.answer);
      setQuestion('');
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提问失败，请重试');
      setStatus('error');
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">PDF Guru</h1>
          <p className="text-sm text-gray-500">AI PDF 摘要工具 · 支持扫描件</p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* 上传区域 */}
        <div
          className={`drop-zone rounded-lg p-12 text-center cursor-pointer ${
            isDragOver ? 'drag-over' : ''
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileSelect}
          />
          
          {file ? (
            <div>
              <div className="text-4xl mb-2">📄</div>
              <p className="font-medium text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-500 mt-1">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <div>
              <div className="text-4xl mb-2">📎</div>
              <p className="font-medium text-gray-900">拖拽 PDF 到这里，或点击上传</p>
              <p className="text-sm text-gray-500 mt-1">支持文字 PDF 和扫描件 · 最大 10MB</p>
            </div>
          )}
        </div>

        {/* 上传按钮 */}
        {file && status === 'idle' && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={handleSubmit}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              生成摘要
            </button>
          </div>
        )}

        {/* 状态显示 */}
        {(status === 'extracting' || status === 'ocr') && (
          <div className="mt-8">
            <div className="text-center mb-4">
              <div className="loading-spinner mx-auto mb-4"></div>
              <p className="text-gray-600">{statusText}</p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-center text-sm text-gray-500 mt-2">{progress}%</p>
          </div>
        )}

        {status === 'processing' && (
          <div className="mt-8 text-center">
            <div className="loading-spinner mx-auto mb-4"></div>
            <p className="text-gray-600">{statusText || '正在生成摘要...'}</p>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* 摘要结果 */}
        {summary && status === 'success' && (
          <div className="mt-8">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">摘要结果</h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    复制
                  </button>
                  <button
                    onClick={handleDownload}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    下载
                  </button>
                </div>
              </div>
              <div className="prose max-w-none">
                <pre className="whitespace-pre-wrap text-gray-700 font-sans">
                  {summary}
                </pre>
              </div>
            </div>

            {/* 追问功能 */}
            <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">继续提问</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
                  placeholder="对摘要有疑问？继续提问..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleAskQuestion}
                  disabled={!question.trim() || status !== 'success'}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        )}

        <footer className="mt-16 text-center text-sm text-gray-400">
          <p>不存储用户文件 • 保护隐私 • 支持中英文</p>
        </footer>
      </div>
    </main>
  );
}
