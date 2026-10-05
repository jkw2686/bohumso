import {pushConfiguration} from './_shared/fcm.mjs';
export default async function(){const config=pushConfiguration(k=>process.env[k]);return new Response('self.BOHUMSO_FIREBASE='+JSON.stringify(config?.web||null)+';',{headers:{'Content-Type':'application/javascript','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export const config={path:'/api/push/sw-config'};
