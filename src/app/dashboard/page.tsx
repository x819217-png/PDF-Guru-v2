'use client';

import { useSession, signOut } from '@/components/ClientProviders';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface UserInfo {
  email: string;
  name?: string;
  avatar?: string;
  plan: 'free' | 'pro';
  credits: number | null;
  subscriptionStatus?: string;
  subscriptionExpiresAt?: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      window.location.href = '/';
      return;
    }
    // 已登录，拉用户信息
    fetch('/api/user')
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          // API 报错时用 session 里的基本信息兜底
          setUserInfo({
            email: session?.user?.email || '',
            name: session?.user?.name,
            plan: 'free',
            credits: 0,
          });
        } else {
          setUserInfo(data);
        }
        setLoading(false);
      })
      .catch(() => {
        // 网络错误时也用 session 兜底
        setUserInfo({
          email: session?.user?.email || '',
          name: session?.user?.name,
          plan: 'free',
          credits: 0,
        });
        setLoading(false);
      });
  }, [status]);

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  const isPro = userInfo?.plan === 'pro';
  const credits = userInfo?.credits ?? 0;
  const creditsPercent = isPro ? 100 : Math.round((credits / 10) * 100);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-purple-600">SumifyPDF</Link>
          <button onClick={() => signOut()} className="text-sm text-gray-500 hover:text-gray-700">退出登录</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">个人中心</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 账户信息 */}
          <div className="md:col-span-1 bg-white rounded-2xl p-6 border border-gray-100">
            <div className="flex flex-col items-center text-center">
              {session.user?.image ? (
                <img src={session.user.image} alt="" className="w-16 h-16 rounded-full mb-3" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-3 text-2xl font-bold text-purple-600">
                  {(session.user?.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <p className="font-semibold text-gray-900">{session.user?.name || session.user?.email}</p>
              <p className="text-xs text-gray-400 mt-0.5 break-all">{session.user?.email}</p>
              <div className="mt-3">
                {isPro ? (
                  <span className="px-3 py-1 bg-purple-600 text-white text-xs rounded-full font-medium">✨ Pro</span>
                ) : (
                  <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">免费版</span>
                )}
              </div>
            </div>
          </div>

          {/* 用量看板 */}
          <div className="md:col-span-2 bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">用量</h2>
            {isPro ? (
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center text-2xl">∞</div>
                <div>
                  <p className="font-semibold text-gray-900">无限次解析</p>
                  <p className="text-sm text-gray-400">Pro 会员专享</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-3xl font-bold text-gray-900">{credits}</span>
                  <span className="text-sm text-gray-400">/ 10 次可用</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                  <div className="bg-purple-600 h-2 rounded-full transition-all" style={{ width: `${creditsPercent}%` }} />
                </div>
                <p className="text-xs text-gray-400">每天登录自动获得 1 次，最多累积 10 次</p>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-gray-100">
              {isPro ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Pro 订阅</p>
                    {userInfo?.subscriptionExpiresAt && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        到期：{userInfo.subscriptionExpiresAt === '2099-12-31T00:00:00Z' ? '永久' : new Date(userInfo.subscriptionExpiresAt).toLocaleDateString('zh-CN')}
                      </p>
                    )}
                  </div>
                  <span className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded-full">有效</span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">升级到 Pro</p>
                    <p className="text-xs text-gray-400 mt-0.5">无限次解析 · 思维导图 · PDF 编辑</p>
                  </div>
                  <Link href="/pricing" className="text-xs px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium">
                    $2.99/月
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* 快捷操作 */}
          <div className="md:col-span-3 bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">快捷操作</h2>
            <div className="flex flex-wrap gap-3">
              <Link href="/" className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
                📄 开始解析 PDF
              </Link>
              {!isPro && (
                <Link href="/pricing" className="px-4 py-2 border border-purple-200 text-purple-600 rounded-lg text-sm hover:bg-purple-50 transition-colors">
                  💎 升级 Pro
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
