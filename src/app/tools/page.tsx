'use client';

import { useState, useEffect } from 'react';

const STIRLING_URL = 'https://stirling-pdf-378727436564.us-central1.run.app';

export default function ToolsPage() {
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');

  useEffect(() => {
    const saved = localStorage.getItem('sumify_lang');
    if (saved === 'en' || saved === 'zh') setLanguage(saved as 'zh' | 'en');
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <a href="/" className="text-gray-400 hover:text-gray-600 text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {language === 'zh' ? '返回首页' : 'Back'}
          </a>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-semibold text-gray-700">
            🛠️ {language === 'zh' ? 'PDF 工具箱' : 'PDF Toolkit'}
          </span>
          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-600 rounded-full font-medium">
            {language === 'zh' ? '免费使用' : 'Free'}
          </span>
        </div>
        <a href="/" className="text-xs text-purple-600 hover:text-purple-700 font-medium">
          ✨ {language === 'zh' ? '试试 AI 摘要 →' : 'Try AI Summary →'}
        </a>
      </div>
      <iframe
        src={STIRLING_URL}
        className="flex-1 w-full border-0"
        title="PDF Toolkit"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
