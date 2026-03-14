'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { translations, Language } from '@/lib/i18n';
import MindMap from '@/components/MindMap';

type Status = 'idle' | 'extracting' | 'ocr' | 'processing' | 'success' | 'error';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface HistoryItem {
  id: string;
  filename: string;
  summary: string;
  keywords: string[];
  messages: Message[];
  createdAt: number;
}

const HISTORY_KEY = (userId?: string) => `sumify_history_${userId || 'guest'}`;
const MAX_HISTORY = 20;

export default function Home() {
  const { data: session, status: sessionStatus } = useSession();
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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [currentFilename, setCurrentFilename] = useState('');
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pdfViewerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const t = translations[language];

  // 历史记录操作
  const loadHistory = useCallback(() => {
    try {
      const key = HISTORY_KEY(session?.user?.email || undefined);
      const stored = localStorage.getItem(key);
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
  }, [session?.user?.email]);

  const saveToHistory = useCallback((item: Omit<HistoryItem, 'id' | 'createdAt'>) => {
    try {
      const key = HISTORY_KEY(session?.user?.email || undefined);
      const stored = localStorage.getItem(key);
      const existing: HistoryItem[] = stored ? JSON.parse(stored) : [];
      const newItem: HistoryItem = { ...item, id: Date.now().toString(), createdAt: Date.now() };
      const updated = [newItem, ...existing].slice(0, MAX_HISTORY);
      localStorage.setItem(key, JSON.stringify(updated));
      setHistory(updated);
    } catch {}
  }, [session?.user?.email]);

  const deleteHistory = useCallback((id: string) => {
    try {
      const key = HISTORY_KEY(session?.user?.email || undefined);
      const updated = history.filter(h => h.id !== id);
      localStorage.setItem(key, JSON.stringify(updated));
      setHistory(updated);
    } catch {}
  }, [history, session?.user?.email]);

  const loadFromHistory = (item: HistoryItem) => {
    setSummary(item.summary);
    setKeywords(item.keywords);
    setMessages(item.messages);
    setCurrentFilename(item.filename);
    setStatus('success');
    setShowHistory(false);
    setFiles([]);
  };

  useEffect(() => {
    const browserLang = navigator.language.toLowerCase();
    setLanguage(browserLang.startsWith('zh') ? 'zh' : 'en');
  }, []);

  useEffect(() => {
    if (sessionStatus !== 'loading') loadHistory();
  }, [sessionStatus, loadHistory]);

  useEffect(() => {
    import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      (window as any).pdfjsLib = pdfjs;
    });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const extractPDFText = async (file: File): Promise<string> => {
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) throw new Error('PDF 库加载失败');
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n\n';
      setProgress(Math.round((i / pdf.numPages) * 50));
    }
    return fullText;
  };

  const ocrPDF = async (file: File): Promise<string> => {
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) throw new Error('PDF 库加载失败');
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    const numPages = Math.min(pdf.numPages, 10);
    for (let i = 1; i <= numPages; i++) {
      setStatusText(`${language === 'zh' ? '识别第' : 'Page'} ${i}/${numPages}...`);
      setProgress(50 + Math.round((i / numPages) * 40));
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      const imageData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'OCR 失败');
      fullText += (await response.json()).text + '\n\n';
    }
    return fullText;
  };

  const loadPdfToSidebar = async (file: File) => {
    try {
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) return;
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setPdfFile(file);
      setCurrentPage(1);
    } catch {}
  };

  const renderPage = async (pageNum: number, canvas: HTMLCanvasElement) => {
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    const context = canvas.getContext('2d');
    if (context) await page.render({ canvasContext: context, viewport }).promise;
  };

  const goToPage = (pageNum: number) => {
    if (pageNum >= 1 && pageNum <= totalPages) setCurrentPage(pageNum);
  };

  useEffect(() => { (window as any).scrollToPage = goToPage; }, [totalPages]);

  useEffect(() => {
    if (!pdfDoc || !showSidebar) return;
    const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
    if (canvas) renderPage(currentPage, canvas);
  }, [pdfDoc, currentPage, showSidebar]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    if (dropped.length > 0) {
      setFiles(prev => [...prev, ...dropped].slice(0, 10));
      setSummary(''); setError(''); setMessages([]); setStatus('idle');
    } else {
      setError(language === 'zh' ? '请上传 PDF 文件' : 'Please upload PDF files');
    }
  }, [language]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter(f => f.type === 'application/pdf');
    if (selected.length > 0) {
      setFiles(prev => [...prev, ...selected].slice(0, 10));
      setSummary(''); setError(''); setMessages([]); setStatus('idle');
    }
  }, []);

  const processFiles = async (filesToProcess: File[], filename: string) => {
    setStatus('extracting');
    setError('');
    setProgress(0);
    setStatusText(language === 'zh' ? '正在提取文本...' : 'Extracting text...');
    try {
      let allText = '';
      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        let text = await extractPDFText(file);
        if (!text.trim() || text.trim().length < 50) {
          setStatus('ocr');
          setStatusText(language === 'zh' ? '识别扫描件...' : 'OCR scanning...');
          text = await ocrPDF(file);
        }
        allText += `\n\n=== ${file.name} ===\n\n${text}`;
      }
      if (!allText.trim()) throw new Error(t.errorNoText);

      setStatus('processing');
      setStatusText(language === 'zh' ? '正在生成摘要...' : 'Generating summary...');
      setProgress(90);

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: allText, filename, batch: filesToProcess.length > 1, template, extractKeywords: true }),
      });
      if (!response.ok) throw new Error((await response.json()).error || '处理失败');

      const data = await response.json();
      setSummary(data.summary);
      setKeywords(data.keywords || []);
      setMindmap(data.mindmap || null);
      setCurrentFilename(filename);
      setProgress(100);
      setStatus('success');
      setStatusText('');
      saveToHistory({ filename, summary: data.summary, keywords: data.keywords || [], messages: [] });
      if (filesToProcess.length > 0) loadPdfToSidebar(filesToProcess[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '处理失败');
      setStatus('error');
      setStatusText('');
    }
  };

  const handleSubmit = () => {
    if (files.length === 0) return;
    processFiles(files, files.map(f => f.name).join(', '));
  };

  const handleUrlSubmit = async () => {
    if (!pdfUrl.trim()) return;
    setStatus('extracting');
    setError('');
    setProgress(0);
    setStatusText(language === 'zh' ? '正在下载 PDF...' : 'Downloading PDF...');
    try {
      const downloadResponse = await fetch('/api/download-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pdfUrl }),
      });
      if (!downloadResponse.ok) throw new Error((await downloadResponse.json()).error || '下载失败');
      const { data, filename } = await downloadResponse.json();
      const bytes = new Uint8Array(atob(data).split('').map(c => c.charCodeAt(0)));
      const file = new File([new Blob([bytes], { type: 'application/pdf' })], filename, { type: 'application/pdf' });
      setFiles([file]);
      setPdfUrl('');
      await processFiles([file], filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : '处理失败');
      setStatus('error');
      setStatusText('');
    }
  };

  const handleAskQuestion = async (q?: string) => {
    const questionText = q || question.trim();
    if (!questionText || !summary) return;
    setMessages(prev => [...prev, { role: 'user', content: questionText }]);
    setQuestion('');
    setIsAsking(true);
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questionText, summary, history: messages }),
      });
      if (!response.ok) throw new Error((await response.json()).error || '提问失败');
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提问失败');
    } finally {
      setIsAsking(false);
    }
  };

  const handleDownload = (format: 'markdown' | 'word' | 'notion') => {
    let content = '', filename = '', mimeType = '';
    if (format === 'markdown') {
      content = `# PDF 摘要\n\n${keywords.length > 0 ? `**关键词**: ${keywords.join(', ')}\n\n` : ''}${summary}\n\n${messages.length > 0 ? `## 问答记录\n\n${messages.map(m => `**${m.role === 'user' ? '问' : '答'}**: ${m.content}`).join('\n\n')}` : ''}`;
      filename = 'summary.md'; mimeType = 'text/markdown';
    } else if (format === 'word') {
      content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PDF Summary</title></head><body><h1>PDF 摘要</h1>${keywords.length > 0 ? `<p><strong>关键词:</strong> ${keywords.join(', ')}</p>` : ''}<pre style="white-space:pre-wrap;font-family:Arial;">${summary}</pre></body></html>`;
      filename = 'summary.doc'; mimeType = 'application/msword';
    } else {
      content = `# PDF 摘要\n\n${keywords.length > 0 ? `> **关键词**: ${keywords.join(', ')}\n\n` : ''}${summary}`;
      filename = 'summary-notion.md'; mimeType = 'text/markdown';
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const resetAll = () => {
    setFiles([]); setSummary(''); setKeywords([]); setMindmap(null);
    setMessages([]); setStatus('idle'); setError(''); setProgress(0);
    setStatusText(''); setCurrentFilename(''); setPdfDoc(null);
    setShowSidebar(false); setShowMindmap(false);
  };

  const isProcessing = status === 'extracting' || status === 'ocr' || status === 'processing';

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* ── Header ── */}
      <header className="border-b border-gray-100 bg-white sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={resetAll} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <span className="text-xl font-bold text-purple-600">SumifyPDF</span>
            </button>
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {language === 'zh' ? '历史' : 'History'}
                <span className="bg-purple-100 text-purple-600 text-xs px-1.5 py-0.5 rounded-full">{history.length}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {sessionStatus !== 'loading' && (
              session ? (
                <div className="flex items-center gap-2">
                  {session.user?.image && <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />}
                  <span className="text-sm text-gray-600 hidden sm:block">{session.user?.name}</span>
                  <button onClick={() => signOut()} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
                    {language === 'zh' ? '退出' : 'Sign out'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => signIn('google')}
                  className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {language === 'zh' ? '登录' : 'Sign in'}
                </button>
              )
            )}
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
              <button onClick={() => setLanguage('zh')} className={`px-2.5 py-1 ${language === 'zh' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>中</button>
              <button onClick={() => setLanguage('en')} className={`px-2.5 py-1 ${language === 'en' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>EN</button>
            </div>
          </div>
        </div>
      </header>

      {/* ── History Dropdown ── */}
      {showHistory && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setShowHistory(false)}>
          <div className="absolute top-14 left-4 w-80 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
              <span className="font-medium text-gray-800">{language === 'zh' ? '历史记录' : 'History'}</span>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">{language === 'zh' ? '暂无记录' : 'No history yet'}</p>
              ) : history.map(item => (
                <div key={item.id} className="flex items-start gap-2 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <button className="flex-1 text-left" onClick={() => loadFromHistory(item)}>
                    <p className="text-sm font-medium text-gray-800 truncate">{item.filename}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(item.createdAt).toLocaleDateString()}</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.summary.slice(0, 80)}...</p>
                  </button>
                  <button onClick={() => deleteHistory(item.id)} className="text-gray-300 hover:text-red-400 mt-1 flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">

        {/* ── IDLE: Hero + Upload ── */}
        {status === 'idle' && files.length === 0 && !summary && (
          <div className="flex flex-col items-center">
            {/* Hero */}
            <div className="text-center mb-10 mt-4">
              <h1 className="text-4xl font-bold text-gray-900 mb-3">
                {language === 'zh' ? '和你的 PDF 对话' : 'Chat with your PDF'}
              </h1>
              <p className="text-lg text-gray-500 max-w-xl mx-auto">
                {language === 'zh'
                  ? '上传文档，AI 帮你读懂每一页'
                  : 'Upload a document, let AI understand every page for you'}
              </p>
            </div>

            {/* Upload Box */}
            <div className="w-full max-w-2xl">
              <div
                ref={dropRef}
                className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  isDragOver ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleFileSelect} />
                <div className="text-5xl mb-4">📄</div>
                <p className="text-lg font-medium text-gray-700 mb-1">
                  {language === 'zh' ? '拖入 PDF，或点击上传' : 'Drop PDF here, or click to upload'}
                </p>
                <p className="text-sm text-gray-400">
                  {language === 'zh' ? '支持扫描件 · 最多 10 个文件' : 'Scanned docs supported · Up to 10 files'}
                </p>
              </div>

              {/* URL input */}
              <div className="mt-4 flex gap-2">
                <input
                  type="url"
                  value={pdfUrl}
                  onChange={e => setPdfUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
                  placeholder={language === 'zh' ? '或粘贴 PDF 链接...' : 'Or paste a PDF URL...'}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                />
                <button
                  onClick={handleUrlSubmit}
                  disabled={!pdfUrl.trim()}
                  className="px-5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-40 transition-colors"
                >
                  {language === 'zh' ? '解析' : 'Parse'}
                </button>
              </div>
            </div>

            {/* Scenarios */}
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
              {[
                { icon: '🎓', title: language === 'zh' ? '研究者' : 'Researchers', desc: language === 'zh' ? '快速从论文中提取关键发现，不再逐页苦读' : 'Extract key findings from papers without reading every page' },
                { icon: '💼', title: language === 'zh' ? '职场人' : 'Professionals', desc: language === 'zh' ? '秒懂合同条款、财务报告，开会前心里有数' : 'Understand contracts and reports before meetings' },
                { icon: '📚', title: language === 'zh' ? '学生' : 'Students', desc: language === 'zh' ? '教材、讲义一键总结，复习效率翻倍' : 'Summarize textbooks and notes, double your study efficiency' },
              ].map((s, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-2">{s.icon}</div>
                  <p className="font-medium text-gray-800 text-sm mb-1">{s.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Files selected, ready to process ── */}
        {status === 'idle' && files.length > 0 && (
          <div className="max-w-2xl mx-auto">
            <div className="space-y-2 mb-6">
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📄</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{file.name}</p>
                      <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400">✕</button>
                </div>
              ))}
            </div>

            {/* Style selector */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {(['default', 'academic', 'business', 'simple'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTemplate(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${template === t ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {{ default: language === 'zh' ? '📄 通用' : '📄 General', academic: language === 'zh' ? '🎓 学术' : '🎓 Academic', business: language === 'zh' ? '💼 商业' : '💼 Business', simple: language === 'zh' ? '✨ 简洁' : '✨ Simple' }[t]}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={handleSubmit} className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors">
                🚀 {language === 'zh' ? `开始解读 (${files.length} 个文件)` : `Analyze (${files.length} file${files.length > 1 ? 's' : ''})`}
              </button>
              <button onClick={resetAll} className="px-4 py-3 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors">
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {/* ── Processing ── */}
        {isProcessing && (
          <div className="max-w-md mx-auto text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full mb-6">
              <svg className="w-8 h-8 text-purple-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-800 mb-2">{statusText || (language === 'zh' ? '正在处理...' : 'Processing...')}</p>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-4">
              <div className="bg-purple-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-sm text-gray-400 mt-2">{progress}%</p>
          </div>
        )}

        {/* ── Error ── */}
        {status === 'error' && error && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-4">
              <p className="text-red-600 text-sm">❌ {error}</p>
            </div>
            <button onClick={resetAll} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              {language === 'zh' ? '重新开始' : 'Start over'}
            </button>
          </div>
        )}

        {/* ── Success: Result + Chat ── */}
        {status === 'success' && summary && (
          <div className={`flex gap-6 ${showSidebar ? '' : ''}`}>
            {/* PDF Sidebar */}
            {showSidebar && pdfDoc && (
              <div className="w-80 flex-shrink-0 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col sticky top-20 h-[calc(100vh-6rem)]">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-700">📄 PDF</span>
                  <button onClick={() => setShowSidebar(false)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
                </div>
                <div className="flex-1 overflow-auto bg-gray-50 flex justify-center p-3" ref={pdfViewerRef}>
                  <canvas id="pdf-canvas" className="shadow-sm max-w-full" />
                </div>
                <div className="flex justify-center items-center gap-3 px-4 py-2 border-t border-gray-100">
                  <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">◀</button>
                  <span className="text-xs text-gray-500">{currentPage} / {totalPages}</span>
                  <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">▶</button>
                </div>
              </div>
            )}

            <div className="flex-1 min-w-0">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700 truncate max-w-xs">{currentFilename}</span>
                  {pdfDoc && (
                    <button onClick={() => setShowSidebar(!showSidebar)} className={`text-xs px-2 py-1 rounded-lg border transition-colors ${showSidebar ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      {language === 'zh' ? '对照' : 'Side by side'}
                    </button>
                  )}
                  {mindmap && (
                    <button onClick={() => setShowMindmap(!showMindmap)} className={`text-xs px-2 py-1 rounded-lg border transition-colors ${showMindmap ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      🧠 {language === 'zh' ? '导图' : 'Mind map'}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => navigator.clipboard.writeText(summary)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                    📋 {language === 'zh' ? '复制' : 'Copy'}
                  </button>
                  <div className="relative group">
                    <button className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                      ⬇️ {language === 'zh' ? '导出' : 'Export'} ▾
                    </button>
                    <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 text-sm">
                      {(['markdown', 'word', 'notion'] as const).map(f => (
                        <button key={f} onClick={() => handleDownload(f)} className="block w-full text-left px-3 py-2 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg text-gray-700">
                          {f === 'markdown' ? '📝 Markdown' : f === 'word' ? '📄 Word' : '📓 Notion'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={resetAll} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                    {language === 'zh' ? '新文档' : 'New doc'}
                  </button>
                </div>
              </div>

              {/* Mind Map */}
              {showMindmap && mindmap && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 overflow-auto">
                  <MindMap data={mindmap} language={language} />
                </div>
              )}

              {/* Keywords */}
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {keywords.map((kw, i) => (
                    <span key={i} className="px-2.5 py-1 bg-purple-50 text-purple-600 rounded-full text-xs">{kw}</span>
                  ))}
                </div>
              )}

              {/* Summary */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{language === 'zh' ? '摘要' : 'Summary'}</h2>
                <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">{summary}</div>
              </div>

              {/* Chat */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">💬 {language === 'zh' ? '继续提问' : 'Ask questions'}</h3>
                </div>

                {messages.length > 0 && (
                  <div className="px-5 py-4 space-y-4 max-h-96 overflow-y-auto">
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-purple-600 text-white rounded-br-sm'
                            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {isAsking && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 px-4 py-2.5 rounded-2xl rounded-bl-sm">
                          <span className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* Suggested questions */}
                {messages.length === 0 && (
                  <div className="px-5 py-3 flex flex-wrap gap-2">
                    {(language === 'zh'
                      ? ['这篇文档的核心结论是什么？', '有哪些值得关注的风险点？', '用三句话总结给我听']
                      : ['What are the key conclusions?', 'What are the main risks?', 'Summarize in 3 sentences']
                    ).map((q, i) => (
                      <button key={i} onClick={() => handleAskQuestion(q)} className="text-xs px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-gray-600 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-600 transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {/* Input */}
                <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
                  <input
                    type="text"
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAskQuestion()}
                    placeholder={language === 'zh' ? '问关于这份文档的任何问题...' : 'Ask anything about this document...'}
                    className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                    disabled={isAsking}
                  />
                  <button
                    onClick={() => handleAskQuestion()}
                    disabled={!question.trim() || isAsking}
                    className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-40 transition-colors"
                  >
                    {language === 'zh' ? '发送' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-6 mt-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-gray-400">
          {language === 'zh' ? '© 2025 SumifyPDF · 让每份文档都值得被读懂' : '© 2025 SumifyPDF · Every document deserves to be understood'}
        </div>
      </footer>
    </div>
  );
}
