import crypto from 'node:crypto';
// Проверка подписи initData от Telegram (HMAC-SHA256 с ключом из токена бота).
export function verifyInitData(initData, botToken, maxAgeSec = 86400) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
    if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
    const age = Date.now() / 1000 - Number(params.get('auth_date'));
    if (!(age >= 0 && age <= maxAgeSec)) return null;
    return JSON.parse(params.get('user'));
  } catch { return null; }
}
