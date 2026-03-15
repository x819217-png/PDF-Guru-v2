'use client';

import { useSession, signIn } from '@/components/ClientProviders';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const PAYPAL_PLAN_ID = 'P-06E99215HJ861320GNG3GS2A';
const PAYPAL_CLIENT_ID = 'AefUKleNn16wx9lQgYoG2OAc9jzEB-duJqU4X6F5EnuqZGrbW_f1OVjNP7UB39_5s5tXyDbWSuEv7ZdM';

export default function PricingPage() {
  const { data: session } = useSession();
  const paypalRef = useRef<HTMLDivElement>(null);
  const [paypalLoaded, setPaypalLoaded] = useState(false);
  const [subscribeMsg, setSubscribeMsg] = useState('');

  useEffect(() => {
    if (!session || paypalLoaded) return;
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription`;
    script.setAttribute('data-sdk-integration-source', 'button-factory');
    script.onload = () => {
      setPaypalLoaded(true);
      const paypal = (window as any).paypal;
      if (!paypal || !paypalRef.current) return;
      paypalRef.current.innerHTML = '';
      paypal.Buttons({
        style: { shape: 'rect', color: 'gold', layout: 'vertical', label: 'subscribe' },
        createSubscription: async (_data: any, actions: any) => {
          const subscriptionId = await actions.subscription.create({ plan_id: PAYPAL_PLAN_ID });
          // 记录 subscriptionId → 登录邮箱，供 Webhook 兜底使用
          await fetch('/api/subscription/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscriptionId }),
          });
          return subscriptionId;
        },
        onApprove: async (data: any) => {
          setSubscribeMsg('✅ 订阅成功！正在激活 Pro 权限...');
          // 直接用当前登录的 email，不依赖 PayPal 返回的邮箱
          await fetch('/api/webhook/paypal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
              resource: { id: data.subscriptionID },
              user_email: session?.user?.email, // 直接传登录邮箱
            }),
          });
          setTimeout(() => { window.location.href = '/dashboard'; }, 2000);
        },
        onError: (err: any) => {
          setSubscribeMsg('❌ 支付失败，请重试');
          console.error('PayPal error:', err);
        },
      }).render(paypalRef.current);
    };
    document.body.appendChild(script);
  }, [session, paypalLoaded]);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-purple-600">SumifyPDF</Link>
          {session ? (
            <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">个人中心</Link>
          ) : (
            <button onClick={() => signIn()} className="text-sm px-4 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700">登录</button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">简单透明的定价</h1>
          <p className="text-lg text-gray-500">免费开始，按需升级</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-16">
          {/* Free */}
          <div className="border border-gray-200 rounded-2xl p-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-1">免费版</h2>
              <p className="text-gray-500 text-sm">适合偶尔使用</p>
            </div>
            <div className="mb-6"><span className="text-4xl font-bold text-gray-900">$0</span></div>
            <ul className="space-y-3 mb-8 text-sm text-gray-600">
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> 注册送 3 次解析</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> 每天登录送 1 次（上限 10 次）</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> AI 摘要 + 关键词</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> 对话追问（5 轮/次）</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> 历史记录（7 天）</li>
              <li className="flex items-center gap-2"><span className="text-gray-300">✗</span> <span className="text-gray-400">思维导图</span></li>
              <li className="flex items-center gap-2"><span className="text-gray-300">✗</span> <span className="text-gray-400">PDF 编辑（即将上线）</span></li>
            </ul>
            <Link href="/" className="block w-full py-3 border border-gray-200 rounded-xl text-center text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">免费开始</Link>
          </div>

          {/* Pro */}
          <div className="border-2 border-purple-600 rounded-2xl p-8 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-purple-600 text-white text-xs px-3 py-1 rounded-full font-medium">推荐</span>
            </div>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Pro 版</h2>
              <p className="text-gray-500 text-sm">适合高频使用</p>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-bold text-gray-900">$2.99</span>
              <span className="text-gray-500 text-sm ml-1">/月</span>
            </div>
            <ul className="space-y-3 mb-6 text-sm text-gray-600">
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> <strong>无限次</strong>解析</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> AI 摘要 + 关键词</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> <strong>无限轮</strong>对话追问</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> <strong>永久</strong>历史记录</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> <strong>思维导图</strong></li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> PDF 编辑（即将上线）</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> 文件最大 50MB</li>
            </ul>

            {subscribeMsg ? (
              <p className="text-center text-sm py-3 font-medium">{subscribeMsg}</p>
            ) : session ? (
              <div ref={paypalRef} className="min-h-[50px]">
                <div className="text-center text-sm text-gray-400 py-3">加载支付按钮...</div>
              </div>
            ) : (
              <button onClick={() => signIn()} className="w-full py-3 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors">
                登录后订阅
              </button>
            )}
            <p className="text-xs text-gray-400 text-center mt-2">随时取消，无违约金</p>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">常见问题</h2>
          <div className="space-y-6">
            {[
              { q: '免费版有什么限制？', a: '注册后赠送 3 次解析机会，之后每天登录可获得 1 次，最多累积 10 次。免费版不含思维导图功能。' },
              { q: '支持哪些文件格式？', a: '目前支持 PDF 文件，包括文字版和扫描版（OCR 识别）。免费版最大 10MB，Pro 版最大 50MB。' },
              { q: '上传的 PDF 会被保存吗？', a: '不会。PDF 文件仅在处理过程中临时使用，处理完成后立即丢弃，不会存储在服务器上。' },
              { q: '如何取消订阅？', a: '可以随时通过 PayPal 账户取消订阅，取消后当前计费周期结束前仍可使用 Pro 功能。' },
              { q: '支持哪些支付方式？', a: '通过 PayPal 支付，支持信用卡、借记卡和 PayPal 余额。' },
              { q: '能处理中文 PDF 吗？', a: '完全支持中文，包括中文扫描件的 OCR 识别，摘要默认以中文输出。' },
            ].map((item, i) => (
              <div key={i} className="border-b border-gray-100 pb-6">
                <h3 className="font-semibold text-gray-900 mb-2">{item.q}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-100 py-6 mt-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-gray-400">
          © 2025 SumifyPDF · 让每份文档都值得被读懂
        </div>
      </footer>
    </div>
  );
}
