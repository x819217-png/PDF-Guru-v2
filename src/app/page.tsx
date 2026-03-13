'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

type Status = 'idle' | 'extracting' | 'ocr' | 'processing' | 'success' | 'error';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [pdfLibLoaded, setPdfLibLoaded] = useState(false);

  useEffect(() => {
    import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      (window as any).pdfjsLib = pdfjs;
      setPdfLibLoaded(true);
    });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      f => f.type === 'application/pdf'
    );
    if (droppedFiles.length > 0) {
      setFiles(prev => [...prev, ...droppedFiles].slice(0, 10));
      setSummary('');
      setError('');
      setMessages([]);
    } else {
      setError('请上传 PDF 文件');
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter(
      f => f.type === 'application/pdf'
    );
    if (selectedFiles.length > 0) {
      setFiles(prev => [...prev, ...selectedFiles].slice(0, 10));
      setSummary('');
      setError('');
      setMessages([]);
    }
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;

    setStatus('extracting');
    setError('');
    setProgress(0);
    setStatusText('正在处理...');

    try {
      let allText = '';

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatusText(`正在处理 ${file.name} (${i + 1}/${files.length})...`);

        let text = await extractPDFText(file);
        
        if (!text.trim() || text.trim().length < 50) {
          setStatus('ocr');
          setStatusText(`识别扫描件 ${file.name}...`);
          text = await ocrPDF(file);
        }

        allText += `\n\n=== ${file.name} ===\n\n${text}`;
      }

      if (!allText.trim()) {
        throw new Error('无法从 PDF 中提取文本');
      }

      setStatus('processing');
      setStatusText('正在生成摘要...');
      setProgress(90);

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: allText,
          filename: files.map(f => f.name).join(', '),
          batch: files.length > 1,
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
      setError(err instanceof Error ? err.message : '处理失败');
      setStatus('error');
      setStatusText('');
    }
  };

  const handleAskQuestion = async (q?: string) => {
    const questionText = q || question.trim();
    if (!questionText || !summary) return;

    // 添加用户消息
    setMessages(prev => [...prev, { role: 'user', content: questionText }]);
    setQuestion('');
    setIsAsking(true);

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionText,
          summary,
          history: messages,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '提问失败');
      }

      const data = await response.json();
      
      // 添加 AI 回复
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提问失败');
    } finally {
      setIsAsking(false);
    }
  };

  const handleDownloadMarkdown = () => {
    let markdown = `# PDF 摘要\n\n${summary}\n\n`;
    
    if (messages.length > 0) {
      markdown += `## 问答记录\n\n`;
      messages.forEach(msg => {
        markdown += `**${msg.role === 'user' ? '问' : '答'}**: ${msg.content}\n\n`;
      });
    }

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'summary.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const presetQuestions = [
    '总结核心要点',
    '提取关键数据',
    '列出主要结论',
    '翻译成英文',
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">PDF Guru</h1>
            <p className="text-sm text-gray-500">AI PDF 摘要工具 - 支持批量处理</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 上传区域 */}
        <div
          className={`drop-zone rounded-xl p-8 text-center cursor-pointer transition-all ${
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
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          
          <div className="text-5xl mb-4">📎</div>
          <p className="text-lg font-medium text-gray-900 mb-2">
            拖拽 PDF 到这里，或点击上传
          </p>
          <p className="text-sm text-gray-500">
            支持批量上传（最多 10 个文件，每个最大 10MB）
          </p>
        </div>

        {/* 文件列表 */}
        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between bg-white p-3 rounded-lg border"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">📄</span>
                  <div>
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 处理按钮 */}
        {files.length > 0 && status === 'idle' && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleSubmit}
              className="btn-primary px-8 py-3 rounded-lg font-medium text-lg"
            >
              生成摘要 ({files.length} 个文件)
            </button>
          </div>
        )}

        {/* 进度显示 */}
        {(status === 'extracting' || status === 'ocr' || status === 'processing') && (
          <div className="mt-8 bg-white p-6 rounded-xl border">
            <div className="flex items-center justify-center mb-4">
              <div className="loading-spinner"></div>
            </div>
            <p className="text-center text-gray-700 mb-2">{statusText}</p>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="text-center text-sm text-gray-500 mt-2">{progress}%</p>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="mt-8 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700">❌ {error}</p>
          </div>
        )}

        {/* 摘要结果 */}
        {status === 'success' && summary && (
          <div className="mt-8 space-y-6 fade-in">
            {/* 摘要内容 */}
            <div className="bg-white rounded-xl border p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">📝 摘要结果</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(summary)}
                    className="btn-secondary px-4 py-2 rounded-lg text-sm"
                  >
                    📋 复制
                  </button>
                  <button
                    onClick={handleDownloadMarkdown}
                    className="btn-secondary px-4 py-2 rounded-lg text-sm"
                  >
                    ⬇️ 下载 Markdown
                  </button>
                </div>
              </div>
              <div className="prose max-w-none">
                <pre className="whitespace-pre-wrap text-gray-700 font-sans">
                  {summary}
                </pre>
              </div>
            </div>

            {/* Chat 区域 */}
            <div className="bg-white rounded-xl border p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">💬 继续提问</h2>
              
              {/* 预设问题 */}
              <div className="flex flex-wrap gap-2 mb-4">
                {presetQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleAskQuestion(q)}
                    disabled={isAsking}
                    className="btn-secondary px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* 对话历史 */}
              {messages.length > 0 && (
                <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-blue-50 ml-8'
                          : 'bg-gray-50 mr-8'
                      }`}
                    >
                      <p className="font-medium text-sm text-gray-600 mb-1">
                        {msg.role === 'user' ? '你' : 'AI'}
                      </p>
                      <p className="text-gray-800 whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* 输入框 */}
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
                  placeholder="输入你的问题..."
                  disabled={isAsking}
                  className="flex-1 px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={() => handleAskQuestion()}
                  disabled={!question.trim() || isAsking}
                  className="btn-primary px-6 py-3 rounded-lg disabled:opacity-50"
                >
                  {isAsking ? '...' : '发送'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
