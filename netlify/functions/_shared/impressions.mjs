import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
export function impressionToken(secret,subscriptionId,now=Date.now()){
 const payload=Buffer.from(JSON.stringify({subscriptionId,eventId:randomUUID(),expires:now+600000})).toString('base64url');
 return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
}
export function verifyImpressionToken(secret,token,now=Date.now()){
 if(typeof token!=='string'||token.length>1500)throw Error('invalid_token');
 const [body,signature,...extra]=token.split('.');
 if(extra.length||!body||!signature)throw Error('invalid_token');
 const actual=Buffer.from(signature,'base64url'),expected=createHmac('sha256',secret).update(body).digest();
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('invalid_token');
 const p=JSON.parse(Buffer.from(body,'base64url').toString());
 if(!/^[a-f0-9-]{36}$/.test(p.subscriptionId)||!/^[a-f0-9-]{36}$/.test(p.eventId)||!Number.isSafeInteger(p.expires)||p.expires<=now||p.expires>now+600000)throw Error('expired_token');
 return p;
}
