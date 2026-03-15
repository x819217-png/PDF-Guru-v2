'use client';

import { useState, useRef } from 'react';

interface MindMapNode {
  name: string;
  children?: MindMapNode[];
}

interface MindMapProps {
  data: MindMapNode;
  language: 'zh' | 'en';
}

const LEVEL_COLORS = [
  { bg: 'bg-purple-600', border: 'border-purple-600', text: 'text-purple-700', light: 'bg-purple-50' },
  { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-700', light: 'bg-blue-50' },
  { bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-50' },
  { bg: 'bg-amber-500', border: 'border-amber-500', text: 'text-amber-700', light: 'bg-amber-50' },
  { bg: 'bg-rose-500', border: 'border-rose-500', text: 'text-rose-700', light: 'bg-rose-50' },
];

function MindMapNodeComp({ node, level = 0, language }: { node: MindMapNode; level?: number; language: 'zh' | 'en' }) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children && node.children.length > 0;
  const c = LEVEL_COLORS[level % LEVEL_COLORS.length];

  return (
    <div className={`${level > 0 ? 'ml-5 mt-1.5' : 'mt-0'}`}>
      <div className="flex items-center gap-1.5">
        {level > 0 && <div className={`w-3 h-px ${c.bg} opacity-50`} />}
        <button
          onClick={() => hasChildren && setExpanded(!expanded)}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
            ${level === 0
              ? `${c.bg} text-white shadow-sm`
              : `${c.light} ${c.text} border ${c.border} border-opacity-30 hover:border-opacity-60`
            }`}
        >
          {hasChildren && (
            <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          )}
          {node.name}
        </button>
      </div>
      {hasChildren && expanded && (
        <div className={`ml-4 mt-1 border-l-2 pl-1 ${c.border} border-opacity-20`}>
          {node.children!.map((child, i) => (
            <MindMapNodeComp key={i} node={child} level={level + 1} language={language} />
          ))}
        </div>
      )}
    </div>
  );
}

// 把思维导图数据转成 Markdown 文本
function toMarkdown(node: MindMapNode, depth = 0): string {
  const indent = '  '.repeat(depth);
  const prefix = depth === 0 ? '# ' : depth === 1 ? '## ' : '- ';
  let md = `${indent}${prefix}${node.name}\n`;
  if (node.children) {
    for (const child of node.children) {
      md += toMarkdown(child, depth + 1);
    }
  }
  return md;
}

export default function MindMap({ data, language }: MindMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (!data) return null;

  const handleExportMd = () => {
    const md = toMarkdown(data);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPng = async () => {
    if (!containerRef.current) return;
    try {
      // 动态加载 html2canvas（可选依赖，未安装时降级）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await (Function('return import("html2canvas")')() as Promise<any>).catch(() => null);
      if (!mod) { handleExportMd(); return; }
      const html2canvas = mod.default;
      const canvas = await html2canvas(containerRef.current, { backgroundColor: '#ffffff', scale: 2 });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mindmap.png';
      a.click();
    } catch {
      handleExportMd();
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {language === 'zh' ? '思维导图' : 'Mind Map'}
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={handleExportMd}
            className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Markdown
          </button>
          <button
            onClick={handleExportPng}
            className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            PNG
          </button>
        </div>
      </div>
      <div ref={containerRef} className="p-4 bg-white rounded-lg overflow-auto">
        <MindMapNodeComp node={data} level={0} language={language} />
      </div>
    </div>
  );
}
