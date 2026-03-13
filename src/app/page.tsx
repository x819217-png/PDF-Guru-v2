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

  useEffect(() => {
    import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      (window as any).pdfjsLib = pdfjs;
      setPdfLibLoaded(true);
    });
  }, []);

  const extractPDFText = async (pdfFile: File): Promise<string> => {
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) throw new Error('PDF 库加载失败');

    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    const numPages = pdf.numPages;

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n\n';
      setProgress(Math.round((i / numPages) * 50));
    }

    return fullText;
  };

  const ocrPDF = async (pdfFile: File): Promise<string> => {
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) throw new Error('PDF 库加载失败');

    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    const numPages = Math.min(pdf.numPages, 10);

    for (let i = 1; i <= numPages; i++) {
      setStatusText(`正在识别第 ${i}/${numPages} 页...`);
      setProgress(50 + Math.round((i / numPages) * 40));

      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context!, viewport }).promise;
      const imageData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

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
      let text = await extractPDFText(file);
      
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

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename: file.name }),
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
        body: JSON.stringify({ question: question.trim(), summary }),
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
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          AI PDF 摘要工具
        </h1>
        <p className="text-xl text-gray-600 mb-12">
          快速提取 PDF 关键信息，支持文字和扫描件
        </p>

        {/* Upload Area */}
        <div
          className={`relative border-2 border-dashed rounded-2xl p-16 transition-all cursor-pointer ${
            isDragOver
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50'
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
            <div className="space-y-4">
              <div className="text-6xl">📄</div>
              <div>
                <p className="text-lg font-semibold text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              {status === 'idle' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSubmit();
                  }}
                  className="mt-4 px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-lg"
                >
                  生成摘要
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-6xl">📎</div>
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  拖拽 PDF 到这里，或点击上传
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  支持文字 PDF 和扫描件 • 最大 10MB
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Progress */}
        {(status === 'extracting' || status === 'ocr' || status === 'processing') && (
          <div className="mt-8 max-w-md mx-auto">
            <div className="bg-white rounded-lg p-6 shadow-lg">
              <div className="flex items-center justify-center mb-4">
                <div className="loading-spinner mr-3"></div>
                <span className="text-gray-700">{statusText}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-500 mt-2">{progress}%</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-8 max-w-md mx-auto bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* Summary Result */}
      {summary && (
        <div className="max-w-4xl mx-auto px-4 pb-16">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">摘要结果</h2>
              <div className="flex gap-3">
                <button
                  onClick={handleCopy}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  📋 复制
                </button>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  ⬇️ 下载
                </button>
              </div>
            </div>
            
            <div className="prose max-w-none">
              <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                {summary}
              </div>
            </div>

            {/* Chat */}
            <div className="mt-8 pt-8 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">继续提问</h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
                  placeholder="对摘要有什么疑问？"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={status !== 'success'}
                />
                <button
                  onClick={handleAskQuestion}
                  disabled={!question.trim() || status !== 'success'}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Features */}
      <div className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          为什么选择 PDF Guru？
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center p-6">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-xl font-semibold mb-2">快速准确</h3>
            <p className="text-gray-600">
              AI 驱动，秒级生成摘要，准确提取关键信息
            </p>
          </div>
          <div className="text-center p-6">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-xl font-semibold mb-2">安全私密</h3>
            <p className="text-gray-600">
              不存储文件，纯内存处理，保护您的隐私
            </p>
          </div>
          <div className="text-center p-6">
            <div className="text-4xl mb-4">🌍</div>
            <h3 className="text-xl font-semibold mb-2">中英文支持</h3>
            <p className="text-gray-600">
              支持中英文混合识别，扫描件也能轻松处理
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-600">
          <p>© 2026 PDF Guru. 不存储用户文件 • 保护隐私</p>
        </div>
      </footer>
    </div>
  );
}
