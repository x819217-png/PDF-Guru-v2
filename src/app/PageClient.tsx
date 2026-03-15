'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSession, signIn, signOut } from '@/components/ClientProviders';
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
  mindmap?: any;
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
  const [isMindmapLoading, setIsMindmapLoading] = useState(false);
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
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const [pdfScale, setPdfScale] = useState(1.0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [currentFilename, setCurrentFilename] = useState('');
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');
  const [guestUsed, setGuestUsed] = useState(0);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [pdfPanelWidth, setPdfPanelWidth] = useState(600); // px
  const MAX_GUEST = 3;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pdfViewerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const isDraggingDivider = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    setKeywords(item.keywords || []);
    setMessages(item.messages || []);
    setMindmap(item.mindmap || null);
    setShowMindmap(!!item.mindmap);
    setCurrentFilename(item.filename);
    setStatus('success');
    setShowHistory(false);
    setFiles([]);
    // 历史记录没有 PDF 文件，清空 pdfDoc
    setPdfDoc(null);
    setPdfFile(null);
    setShowSidebar(false);
  };

  // 设备指纹（用于 guest 限额）
  const getDeviceKey = () => {
    const fp = [navigator.userAgent, screen.width, screen.height, Intl.DateTimeFormat().resolvedOptions().timeZone].join('|');
    let hash = 0;
    for (let i = 0; i < fp.length; i++) { hash = ((hash << 5) - hash) + fp.charCodeAt(i); hash |= 0; }
    return `sumify_guest_${Math.abs(hash)}`;
  };

  const checkGuestQuota = (): boolean => {
    if (session) return true; // 登录用户不限制
    const key = getDeviceKey();
    const stored = localStorage.getItem(key);
    if (!stored) return true;
    const data = JSON.parse(stored);
    const today = new Date().toDateString();
    if (data.date !== today) return true;
    return data.count < MAX_GUEST;
  };

  const useGuestQuota = () => {
    if (session) return;
    const key = getDeviceKey();
    const stored = localStorage.getItem(key);
    const today = new Date().toDateString();
    let count = 0;
    if (stored) {
      const data = JSON.parse(stored);
      if (data.date === today) count = data.count;
    }
    const newCount = count + 1;
    localStorage.setItem(key, JSON.stringify({ date: today, count: newCount }));
    setGuestUsed(newCount);
  };

  useEffect(() => {
    const browserLang = navigator.language.toLowerCase();
    setLanguage(browserLang.startsWith('zh') ? 'zh' : 'en');
    // 读取 guest 已用次数
    const key = getDeviceKey();
    const stored = localStorage.getItem(key);
    if (stored) {
      const data = JSON.parse(stored);
      if (data.date === new Date().toDateString()) setGuestUsed(data.count);
    }
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
      setProgress(Math.round((i / pdf.numPages) * 40)); // 0→40%
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
      setProgress(Math.round((i / numPages) * 40)); // OCR 0→40%
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
    // 固定最小宽度 500px，内容不被压缩，超出时容器横向滚动
    const MIN_WIDTH = 500;
    const container = canvas.parentElement;
    const containerWidth = container && container.clientWidth > 50 ? container.clientWidth - 32 : MIN_WIDTH;
    const renderWidth = Math.max(MIN_WIDTH, containerWidth);
    const baseViewport = page.getViewport({ scale: 1 });
    const fitScale = renderWidth / baseViewport.width;
    const finalScale = fitScale * pdfScale;
    const viewport = page.getViewport({ scale: finalScale });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    const context = canvas.getContext('2d');
    if (context) await page.render({ canvasContext: context, viewport }).promise;
  };

  const generateMindmap = async () => {
    if (!summary || isMindmapLoading) return;
    setIsMindmapLoading(true);
    setShowMindmap(true);
    try {
      const response = await fetch('/api/mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary, messages }),
      });
      if (!response.ok) throw new Error('生成失败');
      const data = await response.json();
      setMindmap(data.mindmap);
    } catch {
      setMindmap(null);
    } finally {
      setIsMindmapLoading(false);
    }
  };

  const goToPage = (pageNum: number) => {
    if (pageNum >= 1 && pageNum <= totalPages) setCurrentPage(pageNum);
  };

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingDivider.current = true;
    const startX = e.clientX;
    const startWidth = pdfPanelWidth;
    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingDivider.current) return;
      // 往左拖 → PDF 变宽（鼠标向左移动，deltaX 为负，宽度增加）
      const delta = startX - ev.clientX;
      const newWidth = Math.min(900, Math.max(300, startWidth + delta));
      setPdfPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      isDraggingDivider.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  useEffect(() => { (window as any).scrollToPage = goToPage; }, [totalPages]);

  useEffect(() => {
    if (!pdfDoc || !showSidebar) return;
    const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
    if (canvas) renderPage(currentPage, canvas);
  }, [pdfDoc, currentPage, showSidebar, pdfScale]);

  // 当 showSidebar 变为 true 时，等 DOM 渲染后再绘制（多次重试确保容器宽度正确）
  useEffect(() => {
    if (!pdfDoc || !showSidebar) return;
    let attempts = 0;
    const tryRender = () => {
      const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
      const container = canvas?.parentElement;
      if (canvas && container && container.clientWidth > 50) {
        renderPage(currentPage, canvas);
      } else if (attempts < 5) {
        attempts++;
        setTimeout(tryRender, 100);
      }
    };
    setTimeout(tryRender, 50);
  }, [showSidebar]);

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

  // 快速检测 PDF 是否需要 OCR（只提取前 2 页判断）
  const quickCheckNeedsOCR = async (file: File): Promise<boolean> => {
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) return false;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const checkPages = Math.min(pdf.numPages, 2);
    let textLength = 0;
    for (let i = 1; i <= checkPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      textLength += pageText.trim().length;
    }
    return textLength < 200; // 前 2 页少于 200 字符说明是扫描件
  };

  const processFiles = async (filesToProcess: File[], filename: string) => {
    // 检查 guest 配额
    if (!checkGuestQuota()) {
      setShowLoginPrompt(true);
      return;
    }
    setStatus('extracting');
    setError('');
    setProgress(0);
    setStatusText(language === 'zh' ? '正在提取文本...' : 'Extracting text...');
    try {
      let allText = '';
      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        // 快速判断是否需要 OCR
        const needsOCR = await quickCheckNeedsOCR(file);
        let text = '';
        if (needsOCR) {
          setStatus('ocr');
          setStatusText(language === 'zh' ? '检测到扫描件，正在 OCR 识别...' : 'Scanned doc detected, OCR...');
          text = await ocrPDF(file);
        } else {
          text = await extractPDFText(file);
        }
        allText += `\n\n=== ${file.name} ===\n\n${text}`;
      }
      if (!allText.trim()) throw new Error(t.errorNoText);

      setStatus('processing');
      setStatusText(language === 'zh' ? '正在生成摘要...' : 'Generating summary...');
      setProgress(50); // 50% — 开始 AI
      setSummary('');
      setKeywords([]);
      setMindmap(null);

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: allText,
          filename,
          batch: filesToProcess.length > 1,
          template,
          extractKeywords: true,
          stream: true,
          userEmail: session?.user?.email || null,
        }),
      });
      if (!response.ok) {
        const errData = await response.json() as any;
        if (errData.upgrade) { setShowLoginPrompt(true); setStatus('idle'); return; }
        throw new Error(errData.error || '处理失败');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('无法读取响应');

      let fullSummary = '';
      let charCount = 0;
      let finalKeywords: string[] = [];
      let finalMindmap: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'summary' && data.content) {
                fullSummary += data.content;
                charCount += data.content.length;
                setSummary(fullSummary);
                // 50→95% 流式进度
                setProgress(Math.min(95, 50 + Math.floor(charCount / 5)));
              } else if (data.type === 'keywords' && data.content) {
                finalKeywords = data.content;
                setKeywords(data.content);
                setProgress(98);
              } else if (data.type === 'mindmap' && data.content) {
                finalMindmap = data.content;
                setMindmap(data.content);
              }
            } catch {}
          }
        }
      }

      setCurrentFilename(filename);
      setProgress(100);
      setStatus('success');
      setStatusText('');
      saveToHistory({ filename, summary: fullSummary, keywords: finalKeywords, messages: [], mindmap: finalMindmap || undefined });
      useGuestQuota();
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

    // 添加空的 AI 回复占位，记录当前 index
    let msgIndex = -1;
    setMessages(prev => {
      msgIndex = prev.length + 1; // user msg + this assistant msg
      return [...prev, { role: 'assistant', content: '' }];
    });

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questionText, summary, history: messages, stream: true }),
      });
      if (!response.ok) throw new Error((await response.json()).error || '提问失败');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('无法读取响应');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                setMessages(prev => {
                  const updated = [...prev];
                  const idx = updated.length - 1; // 最后一条就是 AI 占位
                  if (updated[idx] && updated[idx].role === 'assistant') {
                    updated[idx] = { ...updated[idx], content: updated[idx].content + data.content };
                  }
                  return updated;
                });
              }
            } catch {}
          }
        }
      }
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
            {/* PDF 工具入口 — 所有人可见，显眼按钮 */}
            <a
              href="/tools"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              🛠️ {language === 'zh' ? 'PDF 工具箱' : 'PDF Tools'}
            </a>

            {/* Guest 次数提示 */}
            {!session && guestUsed > 0 && (
              <span className="text-xs text-gray-400 hidden sm:block">
                {language === 'zh' ? `今日剩余 ${MAX_GUEST - guestUsed} 次` : `${MAX_GUEST - guestUsed} left today`}
              </span>
            )}
            {sessionStatus !== 'loading' && (
              session ? (
                <div className="flex items-center gap-2">
                  {session.user?.image && <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />}
                  <span className="text-sm text-gray-600 hidden sm:block">{session.user?.name}</span>
                  <a href="/dashboard" className="text-sm text-purple-600 hover:text-purple-700 px-2 py-1 rounded hover:bg-purple-50 hidden sm:block">
                    {language === 'zh' ? '个人中心' : 'Dashboard'}
                  </a>
                  <button onClick={() => signOut()} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
                    {language === 'zh' ? '退出' : 'Sign out'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => signIn()}
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
                    <p className="text-xs text-amber-500 mt-1">📎 {language === 'zh' ? '需重新上传 PDF 以查看原文' : 'Re-upload PDF to view original'}</p>
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
      <main className="flex-1 w-full px-4 py-6 max-w-[1400px] mx-auto">

        {/* ── Login Prompt Modal (guest quota exceeded) ── */}
        {showLoginPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowLoginPrompt(false)}>
            <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="text-4xl mb-4">🔒</div>
              {session ? (
                <>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">
                    {language === 'zh' ? '今日额度已用完' : 'Daily credits used up'}
                  </h2>
                  <p className="text-gray-500 text-sm mb-6">
                    {language === 'zh' ? '升级 Pro 享无限次数，每月仅 $2.99' : 'Upgrade to Pro for unlimited use — $2.99/month'}
                  </p>
                  <a href="/pricing" className="block w-full px-4 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors mb-3 text-center">
                    {language === 'zh' ? '查看 Pro 方案' : 'View Pro Plan'}
                  </a>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">
                    {language === 'zh' ? '今日免费次数已用完' : 'Daily free limit reached'}
                  </h2>
                  <p className="text-gray-500 text-sm mb-6">
                    {language === 'zh'
                      ? `每天可免费使用 ${MAX_GUEST} 次，登录后注册送 3 次，每天再送 1 次`
                      : `Free users get ${MAX_GUEST} uses/day. Sign in to get 3 credits + 1 daily`}
                  </p>
                  <button
                    onClick={() => signIn()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors mb-3"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    {language === 'zh' ? '用 Google 登录' : 'Sign in with Google'}
                  </button>
                </>
              )}
              <button onClick={() => setShowLoginPrompt(false)} className="text-sm text-gray-400 hover:text-gray-600">
                {language === 'zh' ? '稍后再说' : 'Maybe later'}
              </button>
            </div>
          </div>
        )}

        {/* ── IDLE: Hero + Upload ── */}
        {status === 'idle' && files.length === 0 && !summary && (
          <div className="flex flex-col items-center">
            {/* Hero - 精简 */}
            <div className="text-center mb-6">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                {language === 'zh' ? '让 PDF 变成会说话的朋友' : 'Make your PDF talk back'}
              </h1>
            </div>

            {/* Upload Box - 放大 */}
            <div className="w-full max-w-3xl mx-auto">
              <div
                ref={dropRef}
                className={`relative border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all ${
                  isDragOver ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleFileSelect} />
                <div className="w-20 h-20 mx-auto mb-4 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-xl font-semibold text-gray-700 mb-2">
                  {language === 'zh' ? '拖入 PDF 文件，或点击上传' : 'Drop PDF here, or click to upload'}
                </p>
                <p className="text-sm text-gray-400">
                  {language === 'zh' ? '支持扫描件 OCR识别 · 最多 10 个文件 · 最大 10MB' : 'Scanned docs supported · Up to 10 files · Max 10MB'}
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
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                />
                <button
                  onClick={handleUrlSubmit}
                  disabled={!pdfUrl.trim()}
                  className="px-6 py-3 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-40 transition-colors"
                >
                  {language === 'zh' ? '解析' : 'Parse'}
                </button>
              </div>
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
          <div className="relative">

            {/* 摘要+对话区 — 全宽，不受 PDF 面板影响 */}
            <div className={`w-full overflow-y-auto transition-all duration-200 ${showSidebar && pdfDoc ? 'pr-4' : ''}`}
              style={showSidebar && pdfDoc ? { paddingRight: `${pdfPanelWidth + 16}px` } : undefined}
            >
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-600 truncate max-w-xs">{currentFilename}</span>
                  {pdfDoc ? (
                    <button onClick={() => setShowSidebar(!showSidebar)} className={`text-xs px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 ${showSidebar ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {language === 'zh' ? '原文对照' : 'View PDF'}
                    </button>
                  ) : (
                    <label className="text-xs px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:bg-gray-50 cursor-pointer flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      {language === 'zh' ? '上传 PDF 查看原文' : 'Upload PDF to view'}
                      <input type="file" accept=".pdf" className="hidden" onChange={async e => {
                        const f = e.target.files?.[0];
                        if (f) { await loadPdfToSidebar(f); setShowSidebar(true); }
                      }} />
                    </label>
                  )}
                  <button
                    onClick={() => mindmap ? setShowMindmap(!showMindmap) : generateMindmap()}
                    disabled={isMindmapLoading}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 ${showMindmap ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'} disabled:opacity-50`}
                  >
                    🧠 {isMindmapLoading ? (language === 'zh' ? '生成中...' : 'Generating...') : (language === 'zh' ? '思维导图' : 'Mind map')}
                  </button>
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

              {/* Chat — 核心区域 */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
                {/* 对话消息区 */}
                <div className="px-4 py-4 space-y-4 min-h-[200px] max-h-[420px] overflow-y-auto">
                  {messages.length === 0 && !isAsking && (
                    <div className="flex flex-col items-center justify-center h-32 text-center">
                      <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mb-3">
                        <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-400">{language === 'zh' ? '对文档有任何疑问，直接问我' : 'Ask me anything about this document'}</p>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'assistant' && (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-white text-xs font-bold">AI</span>
                        </div>
                      )}
                      <div className={`max-w-[78%] px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-purple-600 text-white rounded-2xl rounded-tr-sm'
                          : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-2xl rounded-tl-sm'
                      }`}>
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                        {msg.role === 'assistant' && msg.content === '' && isAsking && (
                          <span className="inline-flex gap-1 ml-1">
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                        )}
                      </div>
                      {msg.role === 'user' && (
                        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                  {isAsking && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '' && null}
                  <div ref={chatEndRef} />
                </div>

                {/* 预设问题 — 始终显示 */}
                <div className="px-4 pb-3 flex flex-wrap gap-1.5 border-t border-gray-50 pt-3">
                  {(language === 'zh'
                    ? ['核心结论是什么？', '有哪些风险点？', '用三句话总结', '有哪些关键数据？', '下一步行动建议？']
                    : ['Key conclusions?', 'Main risks?', 'Summarize in 3 sentences', 'Key data points?', 'Next steps?']
                  ).map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleAskQuestion(q)}
                      disabled={isAsking}
                      className="text-xs px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-full text-gray-500 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-600 transition-colors disabled:opacity-40"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                {/* 输入框 */}
                <div className="px-4 pb-4 flex gap-2">
                  <input
                    type="text"
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAskQuestion()}
                    placeholder={language === 'zh' ? '问关于这份文档的任何问题...' : 'Ask anything about this document...'}
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                    disabled={isAsking}
                  />
                  <button
                    onClick={() => handleAskQuestion()}
                    disabled={!question.trim() || isAsking}
                    className="px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    {language === 'zh' ? '发送' : 'Send'}
                  </button>
                </div>
              </div>

              {/* Summary — 折叠式，默认展开 */}
              <details open className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <summary className="px-5 py-3 cursor-pointer flex items-center justify-between select-none hover:bg-gray-50 transition-colors">
                  <span className="text-sm font-semibold text-gray-700">{language === 'zh' ? '📄 文档摘要' : '📄 Summary'}</span>
                  <svg className="w-4 h-4 text-gray-400 transition-transform details-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-5 pb-5 pt-2 prose prose-sm max-w-none text-gray-700 leading-relaxed border-t border-gray-100">
                  {summary.split(/(\[(?:P|p|第)\s*\d+\s*(?:页)?\]|\((?:P|p)\s*\d+\))/g).map((part, i) => {
                    const match = part.match(/\d+/);
                    const isPageRef = /\[(?:P|p|第)\s*\d+\s*(?:页)?\]|\((?:P|p)\s*\d+\)/.test(part);
                    if (isPageRef && match) {
                      const page = parseInt(match[0]);
                      return (
                        <button
                          key={i}
                          onClick={() => { goToPage(page); setShowSidebar(true); }}
                          className="inline-flex items-center px-1.5 py-0.5 mx-0.5 text-xs bg-purple-100 text-purple-600 rounded hover:bg-purple-200 transition-colors font-medium cursor-pointer"
                          title={`跳转到第 ${page} 页`}
                        >
                          📄P{page}
                        </button>
                      );
                    }
                    return <span key={i} className="whitespace-pre-wrap">{part}</span>;
                  })}
                </div>
              </details>
            </div>

            {/* PDF 面板 — 右侧 fixed 叠加，不挤压摘要区 */}
            {pdfDoc && showSidebar && (
              <div
                className="fixed top-0 right-0 h-full flex z-30"
                style={{ width: `${pdfPanelWidth}px` }}
              >
                {/* 拖拽分隔条 */}
                <div
                  ref={containerRef}
                  onMouseDown={handleDividerMouseDown}
                  className="w-2 flex-shrink-0 cursor-col-resize hover:bg-purple-400 bg-gray-300 transition-colors self-stretch"
                  title={language === 'zh' ? '左右拖拽调整宽度' : 'Drag to resize'}
                />
                {/* PDF 内容 */}
                <div className="flex-1 flex flex-col border-l border-gray-200 bg-white shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
                    <span className="text-sm font-medium text-gray-700 truncate">📄 {currentFilename}</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setPdfScale(s => Math.max(0.5, s - 0.25))} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 text-sm">−</button>
                      <span className="text-xs text-gray-400 w-10 text-center">{Math.round(pdfScale * 100)}%</span>
                      <button onClick={() => setPdfScale(s => Math.min(3, s + 0.25))} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 text-sm">+</button>
                      <button onClick={() => setShowSidebar(false)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400">✕</button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto bg-gray-50 flex justify-center p-4" ref={pdfViewerRef}>
                    <canvas id="pdf-canvas" className="shadow-lg" style={{ minWidth: '480px', height: 'auto' }} />
                  </div>
                  <div className="flex justify-center items-center gap-2 px-4 py-2.5 border-t border-gray-100 flex-shrink-0 bg-white">
                    <button onClick={() => goToPage(1)} disabled={currentPage <= 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-500 text-xs">⏮</button>
                    <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-600">◀</button>
                    <span className="text-sm text-gray-600 min-w-[4rem] text-center">{currentPage} / {totalPages}</span>
                    <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-600">▶</button>
                    <button onClick={() => goToPage(totalPages)} disabled={currentPage >= totalPages} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-500 text-xs">⏭</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      <footer className="border-t border-gray-100 py-6 mt-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-gray-400">
          {language === 'zh' ? '© 2025 SumifyPDF · 让每份文档都值得被读懂' : '© 2025 SumifyPDF · Every document deserves to be understood'}
        </div>
      </footer>
    </div>
  );
}
