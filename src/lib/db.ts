// Cloudflare D1 数据库操作
// Edge Runtime 兼容

export const runtime = 'edge';

const DB_ID = 'c147850c-5941-4a4c-93a2-265f09ad334d';
const ACCOUNT_ID = 'd7137fd92ba7c3a136b6ada46b93d5ec';

async function queryD1(sql: string, params: any[] = []) {
  const token = process.env.CLOUDFLARE_D1_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_D1_TOKEN not set');

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    }
  );
  const data = await res.json() as any;
  if (!data.success) throw new Error(data.errors?.[0]?.message || 'D1 query failed');
  return data.result?.[0];
}

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  plan: 'free' | 'pro';
  credits: number;
  credits_updated_at: string;
  subscription_status?: string;
  subscription_expires_at?: string;
  created_at: string;
}

// 获取或创建用户（登录时调用）
export async function upsertUser(email: string, name?: string, avatar?: string): Promise<User> {
  const existing = await queryD1('SELECT * FROM users WHERE email = ?', [email]);
  if (existing?.results?.[0]) return existing.results[0] as User;

  // 新用户：注册送 3 次
  const id = crypto.randomUUID();
  await queryD1(
    'INSERT INTO users (id, email, name, avatar, plan, credits) VALUES (?, ?, ?, ?, ?, ?)',
    [id, email, name || null, avatar || null, 'free', 3]
  );
  const created = await queryD1('SELECT * FROM users WHERE id = ?', [id]);
  return created.results[0] as User;
}

// 获取用户信息
export async function getUser(email: string): Promise<User | null> {
  const result = await queryD1('SELECT * FROM users WHERE email = ?', [email]);
  return result?.results?.[0] as User || null;
}

// 每日登录送 1 次（最多累积 10 次）
export async function dailyGrant(email: string): Promise<User> {
  const user = await getUser(email);
  if (!user) throw new Error('User not found');

  // Pro 用户不需要
  if (user.plan === 'pro') return user;

  const lastUpdate = new Date(user.credits_updated_at);
  const now = new Date();
  const isNewDay = now.toDateString() !== lastUpdate.toDateString();

  if (isNewDay && user.credits < 10) {
    const newCredits = Math.min(10, user.credits + 1);
    await queryD1(
      'UPDATE users SET credits = ?, credits_updated_at = ? WHERE email = ?',
      [newCredits, now.toISOString(), email]
    );
    return { ...user, credits: newCredits, credits_updated_at: now.toISOString() };
  }
  return user;
}

// 消耗一次用量
export async function consumeCredit(email: string): Promise<{ ok: boolean; credits: number; message?: string }> {
  const user = await getUser(email);
  if (!user) return { ok: false, credits: 0, message: 'User not found' };

  // Pro 用户无限制
  if (user.plan === 'pro') {
    await queryD1('INSERT INTO usage_logs (user_id, action) VALUES (?, ?)', [user.id, 'summarize']);
    return { ok: true, credits: -1 };
  }

  if (user.credits <= 0) {
    return { ok: false, credits: 0, message: 'No credits remaining' };
  }

  await queryD1('UPDATE users SET credits = credits - 1 WHERE email = ?', [email]);
  await queryD1('INSERT INTO usage_logs (user_id, action) VALUES (?, ?)', [user.id, 'summarize']);
  return { ok: true, credits: user.credits - 1 };
}

// 升级为 Pro
export async function upgradeToPro(email: string, paypalSubscriptionId: string, expiresAt: string) {
  const user = await getUser(email);
  if (!user) throw new Error('User not found');

  await queryD1(
    'UPDATE users SET plan = ?, subscription_id = ?, subscription_status = ?, subscription_expires_at = ? WHERE email = ?',
    ['pro', paypalSubscriptionId, 'active', expiresAt, email]
  );
  await queryD1(
    'INSERT INTO subscriptions (id, user_id, paypal_subscription_id, plan, status, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    [crypto.randomUUID(), user.id, paypalSubscriptionId, 'pro', 'active', expiresAt]
  );
}

// 取消订阅
export async function cancelSubscription(email: string) {
  await queryD1(
    'UPDATE users SET plan = ?, subscription_status = ? WHERE email = ?',
    ['free', 'cancelled', email]
  );
  await queryD1(
    'UPDATE subscriptions SET status = ?, cancelled_at = ? WHERE user_id = (SELECT id FROM users WHERE email = ?)',
    ['cancelled', new Date().toISOString(), email]
  );
}
