'use client';

import { useState } from 'react';

interface MindMapNode {
  name: string;
  children?: MindMapNode[];
}

interface MindMapProps {
  data: MindMapNode;
  language: 'zh' | 'en';
}

function MindMapNode({ node, level = 0, language }: { node: MindMapNode; level?: number; language: 'zh' | 'en' }) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children && node.children.length > 0;
  
  const colors = [
    'bg-purple-600',
    'bg-blue-600',
    'bg-green-600',
    'bg-yellow-600',
    'bg-red-600',
    'bg-pink-600',
    'bg-indigo-600',
    'bg-teal-600',
  ];
  
  const color = colors[level % colors.length];
  
  return (
    <div className="ml-4 mt-2">
      <div 
        className={`inline-flex items-center px-3 py-1 rounded-lg text-white text-sm cursor-pointer ${color} ${hasChildren ? '' : 'opacity-80'}`}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren && (
          <span className="mr-1 text-xs">
            {expanded ? '▼' : '▶'}
          </span>
        )}
        {node.name}
      </div>
      {hasChildren && expanded && (
        <div className="border-l-2 border-gray-300 ml-2">
          {node.children!.map((child, i) => (
            <MindMapNode key={i} node={child} level={level + 1} language={language} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MindMap({ data, language }: MindMapProps) {
  if (!data) return null;
  
  return (
    <div className="min-h-[200px] p-4">
      <MindMapNode node={data} level={0} language={language} />
    </div>
  );
}
