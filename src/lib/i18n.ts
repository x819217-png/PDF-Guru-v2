export const translations = {
  zh: {
    // Header
    title: 'PDF Guru',
    subtitle: 'AI PDF 摘要工具',
    
    // Hero
    heroTitle: 'AI PDF 摘要工具',
    heroSubtitle: '支持文字 PDF 和扫描件，一键生成智能摘要',
    featureBatch: '批量处理',
    featureChat: '智能对话',
    featureLanguage: '中英文支持',
    featureExport: '导出 Markdown',
    
    // Upload
    uploadTitle: '拖拽 PDF 到这里，或点击上传',
    uploadSubtitle: '支持批量上传（最多 10 个文件，每个最大 10MB）',
    uploadButton: '选择文件',
    
    // File list
    removeFile: '移除',
    
    // Actions
    startProcessing: '开始处理',
    processing: '处理中...',
    
    // Status
    statusExtracting: '正在提取文本...',
    statusOCR: '检测到扫描件，正在识别...',
    statusProcessing: '正在生成摘要...',
    statusSuccess: '处理完成',
    
    // Summary
    summaryTitle: '📝 摘要结果',
    copyButton: '📋 复制',
    downloadButton: '⬇️ 下载 Markdown',
    copiedSuccess: '已复制到剪贴板',
    
    // Chat
    chatTitle: '💬 继续提问',
    chatPlaceholder: '输入你的问题...',
    askButton: '提问',
    presetQuestion1: '总结要点',
    presetQuestion2: '提取关键数据',
    presetQuestion3: '翻译成英文',
    presetQuestion4: '简化语言',
    
    // Features
    featuresTitle: '核心功能',
    feature1Title: '批量处理',
    feature1Desc: '一次上传多个 PDF，自动生成对比摘要',
    feature2Title: '智能对话',
    feature2Desc: '与 PDF 对话，追问细节，深入理解',
    feature3Title: '导出功能',
    feature3Desc: '下载 Markdown 格式，方便保存和分享',
    
    // FAQ
    faqTitle: '常见问题',
    faq1Q: '支持哪些文件格式？',
    faq1A: '目前支持 PDF 格式，包括文字 PDF 和扫描件。',
    faq2Q: '文件大小有限制吗？',
    faq2A: '单个文件最大 10MB，一次最多上传 10 个文件。',
    faq3Q: '支持哪些语言？',
    faq3A: '支持中英文混合识别和摘要生成。',
    faq4Q: '数据安全吗？',
    faq4A: '所有处理都在内存中完成，不会保存您的文件。',
    
    // Errors
    errorUpload: '请上传 PDF 文件',
    errorProcessing: '处理失败，请重试',
    errorNoText: '无法从 PDF 中提取文本',
  },
  
  en: {
    // Header
    title: 'PDF Guru',
    subtitle: 'AI PDF Summarizer',
    
    // Hero
    heroTitle: 'AI PDF Summarizer',
    heroSubtitle: 'Support text PDFs and scanned documents, generate smart summaries instantly',
    featureBatch: 'Batch Processing',
    featureChat: 'Smart Chat',
    featureLanguage: 'Multi-language',
    featureExport: 'Export Markdown',
    
    // Upload
    uploadTitle: 'Drag PDFs here, or click to upload',
    uploadSubtitle: 'Support batch upload (up to 10 files, 10MB each)',
    uploadButton: 'Choose Files',
    
    // File list
    removeFile: 'Remove',
    
    // Actions
    startProcessing: 'Start Processing',
    processing: 'Processing...',
    
    // Status
    statusExtracting: 'Extracting text...',
    statusOCR: 'Scanned document detected, recognizing...',
    statusProcessing: 'Generating summary...',
    statusSuccess: 'Processing complete',
    
    // Summary
    summaryTitle: '📝 Summary',
    copyButton: '📋 Copy',
    downloadButton: '⬇️ Download Markdown',
    copiedSuccess: 'Copied to clipboard',
    
    // Chat
    chatTitle: '💬 Ask Questions',
    chatPlaceholder: 'Type your question...',
    askButton: 'Ask',
    presetQuestion1: 'Summarize key points',
    presetQuestion2: 'Extract key data',
    presetQuestion3: 'Translate to Chinese',
    presetQuestion4: 'Simplify language',
    
    // Features
    featuresTitle: 'Core Features',
    feature1Title: 'Batch Processing',
    feature1Desc: 'Upload multiple PDFs at once, generate comparative summaries',
    feature2Title: 'Smart Chat',
    feature2Desc: 'Chat with your PDF, ask follow-up questions, deep understanding',
    feature3Title: 'Export',
    feature3Desc: 'Download in Markdown format, easy to save and share',
    
    // FAQ
    faqTitle: 'FAQ',
    faq1Q: 'What file formats are supported?',
    faq1A: 'Currently supports PDF format, including text PDFs and scanned documents.',
    faq2Q: 'Is there a file size limit?',
    faq2A: 'Maximum 10MB per file, up to 10 files at once.',
    faq3Q: 'What languages are supported?',
    faq3A: 'Supports Chinese and English mixed recognition and summarization.',
    faq4Q: 'Is my data safe?',
    faq4A: 'All processing is done in memory, we do not save your files.',
    
    // Errors
    errorUpload: 'Please upload PDF files',
    errorProcessing: 'Processing failed, please try again',
    errorNoText: 'Unable to extract text from PDF',
  },
};

export type Language = 'zh' | 'en';
export type TranslationKey = keyof typeof translations.zh;
