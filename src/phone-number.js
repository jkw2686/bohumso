export function normalizeKoreanPhone(value){const digits=String(value).replace(/\D/g,'');return digits.startsWith('82')?'+'+digits:'+82'+digits.replace(/^0/,'');}
