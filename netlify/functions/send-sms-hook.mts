// Supabase Auth "Send SMS Hook" → Solapi(솔라피) bridge.
// Supabase가 OTP를 생성해 이 엔드포인트로 서명된 요청을 보내면, 여기서 Solapi로 문자를 발송한다.
// 보안: Standard Webhooks 서명(SEND_SMS_HOOK_SECRET)으로 Supabase 요청만 허용.
// 비밀값(SOLAPI_API_SECRET, SEND_SMS_HOOK_SECRET)은 서버 전용 환경변수. 로그에 출력 금지.
import crypto from 'node:crypto';
import type {Config} from '@netlify/functions';

const env = (n: string): string => process.env[n] || '';

// Standard Webhooks (Supabase Auth Hook) 서명 검증
function verifyHook(secret: string, id: string, ts: string, body: string, sigHeader: string): boolean {
  if (!secret || !id || !ts || !sigHeader) return false;
  let key = secret.startsWith('v1,') ? secret.slice(3) : secret;
  key = key.replace(/^whsec_/, '');
  let secretBytes: Buffer;
  try { secretBytes = Buffer.from(key, 'base64'); } catch { return false; }
  const expected = crypto.createHmac('sha256', secretBytes).update(`${id}.${ts}.${body}`).digest('base64');
  const exp = Buffer.from(expected);
  for (const part of sigHeader.split(' ')) {
    const sig = part.includes(',') ? part.split(',')[1] : part;
    if (!sig) continue;
    const got = Buffer.from(sig);
    if (got.length === exp.length && crypto.timingSafeEqual(got, exp)) return true;
  }
  return false;
}

// +8210######## / 8210######## → 010########
function toLocal(phone: string): string {
  const d = String(phone || '').replace(/[^0-9]/g, '');
  if (d.startsWith('82')) return '0' + d.slice(2);
  return d;
}

async function solapiSend(to: string, text: string): Promise<boolean> {
  const apiKey = env('SOLAPI_API_KEY'), apiSecret = env('SOLAPI_API_SECRET'), from = env('SOLAPI_SENDER_NUMBER') || env('SOLAPI_SENDER');
  if (!apiKey || !apiSecret || !from) return false;
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const signature = crypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex');
  const authorization = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
  try {
    const res = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { to, from, text } }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) { console.error('[send-sms] solapi status', res.status); await res.body?.cancel(); return false; }
    await res.body?.cancel();
    return true;
  } catch (e) {
    console.error('[send-sms] solapi error', (e as Error)?.name || 'ERR');
    return false;
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  const body = await req.text();
  const ok = verifyHook(env('SEND_SMS_HOOK_SECRET'), req.headers.get('webhook-id') || '', req.headers.get('webhook-timestamp') || '', body, req.headers.get('webhook-signature') || '');
  if (!ok) return new Response('unauthorized', { status: 401 });
  let payload: any;
  try { payload = JSON.parse(body); } catch { return new Response('bad_request', { status: 400 }); }
  const phone = payload?.user?.phone || payload?.phone;
  const otp = payload?.sms?.otp || payload?.otp;
  if (!phone || !otp) return new Response(JSON.stringify({ error: { message: 'missing_fields' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const sent = await solapiSend(toLocal(phone), `[우리곁에 보험소] 인증번호 ${otp} (타인에게 알려주지 마세요)`);
  if (!sent) return new Response(JSON.stringify({ error: { message: 'send_failed' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export const config: Config = { path: '/api/auth/send-sms' };
