'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { translations, Language } from '@/lib/i18n';
import MindMap from '@/components/MindMap';

type Status = 'idle' | 'extracting' | 'ocr' | 'processing' | 'success' | 'error';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [language, setLanguage] = useState<Language>('zh');
  const [files, setFiles] = useState<File[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [mindmap, setMindmap] = useState<any>(null);
  const [showMindmap, setShowMindmap] = useState(false);
  const [template, setTemplate] = useState<'default' | 'academic' | 'business' | 'simple'>('default');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [pageTexts, setPageTexts] = useState<Record<number, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [usedToday, setUsedToday] = useState(0);
  const MAX_FREE_PER_DAY = 3;
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pdfViewerRef = useRef<HTMLDivElement>(null);
  const [pdfLibLoaded, setPdfLibLoaded] = useState(false);

  const t = translations[language];

  // 免费额度检查
  const checkQuota = useCallback(() => {
    const today = new Date().toDateString();
    const stored = localStorage.getItem('sumify_pdf_quota');
    if (stored) {
      const data = JSON.parse(stored);
      if (data.date === today) {
        setUsedToday(data.count);
        return data.count < MAX_FREE_PER_DAY;
      }
    }
    return true; // 新的一天
  }, []);

  const useQuota = useCallback(() => {
    const today = new Date().toDateString();
    const stored = localStorage.getItem('sumify_pdf_quota');
    let count = 0;
    if (stored) {
      const data = JSON.parse(stored);
      if (data.date === today) {
        count = data.count;
      }
    }
    const newCount = count + 1;
    localStorage.setItem('sumify_pdf_quota', JSON.stringify({ date: today, count: newCount }));
    setUsedToday(newCount);
  }, []);

  // 检测浏览器语言
  useEffect(() => {
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('zh')) {
      setLanguage('zh');
    } else {
      setLanguage('en');
    }
    // 加载已用额度
    const stored = localStorage.getItem('sumify_pdf_quota');
    if (stored) {
      const data = JSON.parse(stored);
      const today = new Date().toDateString();
      if (data.date === today) {
        setUsedToday(data.count);
      }
    }
  }, []);

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
      setStatusText(`${language === 'zh' ? '正在识别第' : 'Recognizing page'} ${i}/${numPages} ${language === 'zh' ? '页...' : '...'}`);
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

  // 加载 PDF 到侧边栏预览
  const loadPdfToSidebar = async (file: File) => {
    try {
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) return;
      
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setPdfFile(file);
      setCurrentPage(1);
    } catch (err) {
      console.error('Load PDF error:', err);
    }
  };

  // 渲染指定页面到 canvas
  const renderPage = async (pageNum: number, canvas: HTMLCanvasElement) => {
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    const context = canvas.getContext('2d');
    if (context) {
      await page.render({ canvasContext: context, viewport }).promise;
    }
  };

  // 跳转到指定页面
  const goToPage = (pageNum: number) => {
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
    }
  };

  // 全局函数供 onclick 调用
  useEffect(() => {
    (window as any).scrollToPage = goToPage;
  }, [totalPages]);

  // 渲染 PDF 页面
  useEffect(() => {
    if (!pdfDoc || !showSidebar) return;
    
    const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
    if (canvas) {
      renderPage(currentPage, canvas);
    }
  }, [pdfDoc, currentPage, showSidebar]);

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
    try {
      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        f => f.type === 'application/pdf'
      );
      if (droppedFiles.length > 0) {
        setFiles(prev => [...prev, ...droppedFiles].slice(0, 10));
        setSummary('');
        setError('');
        setMessages([]);
      } else {
        setError(language === 'zh' ? '请上传 PDF 文件' : 'Please upload PDF files');
      }
    } catch (err) {
      console.error('Drop error:', err);
      setError(language === 'zh' ? '拖放文件失败' : 'Failed to drop files');
    }
  }, [language]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const selectedFiles = Array.from(e.target.files || []).filter(
        f => f.type === 'application/pdf'
      );
      if (selectedFiles.length > 0) {
        setFiles(prev => [...prev, ...selectedFiles].slice(0, 10));
        setSummary('');
        setError('');
        setMessages([]);
      }
    } catch (err) {
      console.error('File select error:', err);
      setError(language === 'zh' ? '选择文件失败，请重试' : 'Failed to select files, please try again');
    }
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUrlSubmit = async () => {
    if (!pdfUrl.trim()) return;

    // 检查免费额度
    if (!checkQuota()) {
      setError(language === 'zh' 
        ? `今日免费次数已用完（${MAX_FREE_PER_DAY}次/天）。请明天再来或订阅无限次数。`
        : `Daily free quota exhausted (${MAX_FREE_PER_DAY} times/day). Please come back tomorrow or subscribe.`);
      return;
    }

    setStatus('extracting');
    setError('');
    setProgress(0);
    setStatusText(language === 'zh' ? '正在下载 PDF...' : 'Downloading PDF...');

    try {
      // 下载 PDF
      const downloadResponse = await fetch('/api/download-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pdfUrl }),
      });

      if (!downloadResponse.ok) {
        const err = await downloadResponse.json();
        throw new Error(err.error || '下载失败');
      }

      const { data, filename } = await downloadResponse.json();
      
      // 将 base64 转为 File 对象
      const binaryString = atob(data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const file = new File([blob], filename, { type: 'application/pdf' });

      // 处理 PDF
      setFiles([file]);
      setProgress(20);
      
      setStatusText(language === 'zh' ? '正在提取文本...' : 'Extracting text...');
      let text = await extractPDFText(file);
      
      if (!text.trim() || text.trim().length < 50) {
        setStatus('ocr');
        setStatusText(language === 'zh' ? '识别扫描件...' : 'OCR scanning...');
        text = await ocrPDF(file);
      }

      if (!text.trim()) {
        throw new Error(t.errorNoText);
      }

      setStatus('processing');
      setStatusText(t.statusProcessing);
      setProgress(90);

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          filename,
          template,
          extractKeywords: true,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '处理失败');
      }

      const result = await response.json();
      setSummary(result.summary);
      setKeywords(result.keywords || []);
      setMindmap(result.mindmap || null);
      setProgress(100);
      useQuota(); // 消耗一次免费额度
      setStatus('success');
      setStatusText('');
      setPdfUrl('');
      // 加载第一个文件到侧边栏预览
      if (files.length > 0) {
        loadPdfToSidebar(files[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '处理失败');
      setStatus('error');
      setStatusText('');
    }
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    
    // 检查免费额度
    if (!checkQuota()) {
      setError(language === 'zh' 
        ? `今日免费次数已用完（${MAX_FREE_PER_DAY}次/天）。请明天再来或订阅无限次数。`
        : `Daily free quota exhausted (${MAX_FREE_PER_DAY} times/day). Please come back tomorrow or subscribe.`);
      return;
    }

    setStatus('extracting');
    setError('');
    setProgress(0);
    setStatusText(t.statusProcessing);

    try {
      let allText = '';

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatusText(`${language === 'zh' ? '正在处理' : 'Processing'} ${file.name} (${i + 1}/${files.length})...`);

        let text = await extractPDFText(file);
        
        if (!text.trim() || text.trim().length < 50) {
          setStatus('ocr');
          setStatusText(`${language === 'zh' ? '识别扫描件' : 'OCR scanning'} ${file.name}...`);
          text = await ocrPDF(file);
        }

        allText += `\n\n=== ${file.name} ===\n\n${text}`;
      }

      if (!allText.trim()) {
        throw new Error(t.errorNoText);
      }

      setStatus('processing');
      setStatusText(t.statusProcessing);
      setStatusText('正在生成摘要...');
      setProgress(90);

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: allText,
          filename: files.map(f => f.name).join(', '),
          batch: files.length > 1,
          template: template,
          extractKeywords: true,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '处理失败');
      }

      const data = await response.json();
      setSummary(data.summary);
      setKeywords(data.keywords || []);
      setMindmap(data.mindmap || null);
      setProgress(100);
      useQuota(); // 消耗一次免费额度
      setStatus('success');
      setStatusText('');
      // 加载第一个文件到侧边栏预览
      if (files.length > 0) {
        loadPdfToSidebar(files[0]);
      }
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

  const handleDownload = (format: 'markdown' | 'word' | 'notion') => {
    let content = '';
    let filename = '';
    let mimeType = '';

    if (format === 'markdown') {
      content = `# PDF 摘要\n\n`;
      if (keywords.length > 0) {
        content += `**关键词**: ${keywords.join(', ')}\n\n`;
      }
      content += `${summary}\n\n`;
      
      if (messages.length > 0) {
        content += `## 问答记录\n\n`;
        messages.forEach(msg => {
          content += `**${msg.role === 'user' ? '问' : '答'}**: ${msg.content}\n\n`;
        });
      }
      filename = 'summary.md';
      mimeType = 'text/markdown';
    } else if (format === 'word') {
      // 简单的 HTML 格式，Word 可以打开
      content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>PDF Summary</title>
</head>
<body>
  <h1>PDF 摘要</h1>
  ${keywords.length > 0 ? `<p><strong>关键词:</strong> ${keywords.join(', ')}</p>` : ''}
  <pre style="white-space: pre-wrap; font-family: Arial;">${summary}</pre>
  ${messages.length > 0 ? `
    <h2>问答记录</h2>
    ${messages.map(msg => `<p><strong>${msg.role === 'user' ? '问' : '答'}:</strong> ${msg.content}</p>`).join('')}
  ` : ''}
</body>
</html>`;
      filename = 'summary.doc';
      mimeType = 'application/msword';
    } else if (format === 'notion') {
      // Notion 兼容的 Markdown
      content = `# PDF 摘要\n\n`;
      if (keywords.length > 0) {
        content += `> **关键词**: ${keywords.join(', ')}\n\n`;
      }
      content += `${summary}\n\n`;
      
      if (messages.length > 0) {
        content += `---\n\n## 💬 问答记录\n\n`;
        messages.forEach(msg => {
          content += `### ${msg.role === 'user' ? '❓ 问' : '💡 答'}\n\n${msg.content}\n\n`;
        });
      }
      filename = 'summary-notion.md';
      mimeType = 'text/markdown';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#7C3AED' }}>{t.title}</h1>
            <p className="text-sm text-gray-500">{t.subtitle}</p>
          </div>
          <div className="flex items-center space-x-4">
            {/* 免费额度显示 */}
            <div className="text-sm text-gray-600">
              {language === 'zh' ? (
                <span>
                  📊 今日免费: <span className="font-bold">{usedToday}/{MAX_FREE_PER_DAY}</span>
                </span>
              ) : (
                <span>
                  📊 Free Today: <span className="font-bold">{usedToday}/{MAX_FREE_PER_DAY}</span>
                </span>
              )}
            </div>
            
            <button
              onClick={() => setLanguage('zh')}
              className={`px-3 py-1 rounded ${
                language === 'zh'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              中文
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={`px-3 py-1 rounded ${
                language === 'en'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              English
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      {files.length === 0 && !summary && (
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 text-white py-16">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              {t.heroTitle}
            </h2>
            <p className="text-xl md:text-2xl mb-8 text-purple-100">
              {t.heroSubtitle}
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <span className="text-2xl">✅</span>
                <span>{t.featureBatch}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-2xl">💬</span>
                <span>{t.featureChat}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-2xl">🌍</span>
                <span>{t.featureLanguage}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-2xl">📥</span>
                <span>{t.featureExport}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`max-w-7xl mx-auto px-4 py-8 ${showSidebar ? 'flex gap-6' : ''}`}>
        {/* 侧边栏 - PDF 预览 */}
        {showSidebar && pdfDoc && (
          <div className="w-1/2 bg-white rounded-xl border p-4 fixed right-4 top-20 bottom-4 overflow-hidden flex flex-col z-40">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold">📄 PDF 预览</h3>
              <button
                onClick={() => setShowSidebar(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100 rounded flex justify-center p-4" ref={pdfViewerRef}>
              <canvas 
                id="pdf-canvas"
                className="shadow-lg"
              />
            </div>
            <div className="flex justify-center items-center gap-2 mt-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
              >
                ◀
              </button>
              <span className="text-sm">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
              >
                ▶
              </button>
            </div>
          </div>
        )}

        <div className={showSidebar ? 'w-1/2' : 'w-full'}>
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
            {t.uploadTitle}
          </p>
          <p className="text-sm text-gray-500">
            {t.uploadSubtitle}
          </p>
        </div>

        {/* URL 输入 */}
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500 mb-2">
            {language === 'zh' ? '或者输入 PDF 链接' : 'Or enter PDF URL'}
          </p>
          <div className="flex max-w-2xl mx-auto gap-2">
            <input
              type="url"
              value={pdfUrl}
              onChange={(e) => setPdfUrl(e.target.value)}
              placeholder={language === 'zh' ? 'https://example.com/document.pdf' : 'https://example.com/document.pdf'}
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={status !== 'idle'}
            />
            <button
              onClick={handleUrlSubmit}
              disabled={!pdfUrl.trim() || status !== 'idle'}
              className="btn-primary px-6 py-2 rounded-lg disabled:opacity-50"
            >
              {language === 'zh' ? '处理' : 'Process'}
            </button>
          </div>
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
                  {t.removeFile}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 模板选择 */}
        {files.length > 0 && status === 'idle' && (
          <div className="mt-4 bg-white p-4 rounded-xl border">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'zh' ? '摘要风格' : 'Summary Style'}
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTemplate('default')}
                className={`px-4 py-2 rounded-lg text-sm ${
                  template === 'default'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {language === 'zh' ? '📄 通用' : '📄 General'}
              </button>
              <button
                onClick={() => setTemplate('academic')}
                className={`px-4 py-2 rounded-lg text-sm ${
                  template === 'academic'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {language === 'zh' ? '🎓 学术' : '🎓 Academic'}
              </button>
              <button
                onClick={() => setTemplate('business')}
                className={`px-4 py-2 rounded-lg text-sm ${
                  template === 'business'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {language === 'zh' ? '💼 商业' : '💼 Business'}
              </button>
              <button
                onClick={() => setTemplate('simple')}
                className={`px-4 py-2 rounded-lg text-sm ${
                  template === 'simple'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {language === 'zh' ? '✨ 简洁' : '✨ Simple'}
              </button>
            </div>
          </div>
        )}

        {/* 处理按钮 */}
        {files.length > 0 && status === 'idle' && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleSubmit}
              className="btn-primary px-8 py-3 rounded-lg font-medium text-lg"
            >
              {t.startProcessing} ({files.length} {language === 'zh' ? '个文件' : 'files'})
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
            {/* 思维导图切换按钮 */}
            {mindmap && (
              <div className="flex justify-center">
                <button
                  onClick={() => setShowMindmap(!showMindmap)}
                  className={`px-6 py-2 rounded-lg ${
                    showMindmap
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  }`}
                >
                  🧠 {showMindmap ? (language === 'zh' ? '关闭思维导图' : 'Close Mind Map') : (language === 'zh' ? '查看思维导图' : 'View Mind Map')}
                </button>
              </div>
            )}

            {/* 思维导图展示 */}
            {showMindmap && mindmap && (
              <div className="bg-white rounded-xl border p-6 overflow-auto">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  🧠 {language === 'zh' ? '思维导图' : 'Mind Map'}
                </h3>
                <MindMap data={mindmap} language={language} />
              </div>
            )}

            {/* 关键词 */}
            {keywords.length > 0 && (
              <div className="bg-white rounded-xl border p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  {language === 'zh' ? '🏷️ 关键词' : '🏷️ Keywords'}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {keywords.map((keyword, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 摘要内容 */}
            <div className="bg-white rounded-xl border p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">{t.summaryTitle}</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(summary);
                      alert(t.copiedSuccess);
                    }}
                    className="btn-secondary px-4 py-2 rounded-lg text-sm"
                  >
                    📋 {language === 'zh' ? '复制' : 'Copy'}
                  </button>
                  <div className="relative group">
                    <button className="btn-secondary px-4 py-2 rounded-lg text-sm">
                      ⬇️ {language === 'zh' ? '导出' : 'Export'} ▾
                    </button>
                    <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      <button
                        onClick={() => handleDownload('markdown')}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-100 rounded-t-lg"
                      >
                        📝 Markdown
                      </button>
                      <button
                        onClick={() => handleDownload('word')}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                      >
                        📄 Word (.doc)
                      </button>
                      <button
                        onClick={() => handleDownload('notion')}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-100 rounded-b-lg"
                      >
                        📓 Notion
                      </button>
                    </div>
                  </div>
                  {/* 侧边栏对照模式按钮 */}
                  {pdfDoc && (
                    <button
                      onClick={() => setShowSidebar(!showSidebar)}
                      className={`px-4 py-2 rounded-lg text-sm ${
                        showSidebar
                          ? 'bg-purple-600 text-white'
                          : 'btn-secondary'
                      }`}
                    >
                      📑 {showSidebar ? (language === 'zh' ? '关闭对照' : 'Close') : (language === 'zh' ? '对照模式' : 'Compare')}
                    </button>
                  )}
                </div>
              </div>
              {/* 引用标注 - 将 [P3] 转为可点击链接 */}
              <div className="prose max-w-none">
                <pre 
                  className="whitespace-pre-wrap text-gray-700 font-sans"
                  dangerouslySetInnerHTML={{
                    __html: summary.replace(/\[P(\d+)\]/g, 
                      '<span class="text-purple-600 cursor-pointer hover:underline mx-1" onclick="window.scrollToPage && window.scrollToPage($1)">[P$1]</span>')
                  }}
                ></pre>
              </div>
            </div>

            {/* Chat 区域 */}
            <div className="bg-white rounded-xl border p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">{t.chatTitle}</h2>
              
              {/* 预设问题 */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => handleAskQuestion(t.presetQuestion1)}
                  disabled={isAsking}
                  className="btn-secondary px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
                >
                  {t.presetQuestion1}
                </button>
                <button
                  onClick={() => handleAskQuestion(t.presetQuestion2)}
                  disabled={isAsking}
                  className="btn-secondary px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
                >
                  {t.presetQuestion2}
                </button>
                <button
                  onClick={() => handleAskQuestion(t.presetQuestion3)}
                  disabled={isAsking}
                  className="btn-secondary px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
                >
                  {t.presetQuestion3}
                </button>
                <button
                  onClick={() => handleAskQuestion(t.presetQuestion4)}
                  disabled={isAsking}
                  className="btn-secondary px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
                >
                  {t.presetQuestion4}
                </button>
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
                        {msg.role === 'user' ? (language === 'zh' ? '你' : 'You') : 'AI'}
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
                  onKeyPress={(e) => e.key === 'Enter' && !isAsking && handleAskQuestion()}
                  placeholder={t.chatPlaceholder}
                  disabled={isAsking}
                  className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={() => handleAskQuestion()}
                  disabled={isAsking || !question.trim()}
                  className="btn-primary px-6 py-2 rounded-lg disabled:opacity-50"
                >
                  {isAsking ? (language === 'zh' ? '思考中...' : 'Thinking...') : t.askButton}
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 py-6 mt-16">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p>© 2026 SumifyPDF. All rights reserved.</p>
          <p className="text-sm mt-2">⚡ Powered by Cloudflare</p>
        </div>
      </footer>
    </main>
  );
}
