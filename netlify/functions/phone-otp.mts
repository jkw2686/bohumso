import {createClient} from '@supabase/supabase-js';
import {createPhoneHandler} from './_shared/phone-otp.mjs';
export default createPhoneHandler({env:(key:string)=>Netlify.env.get(key),makeClient:createClient});
export const config={path:['/api/phone/send-otp','/api/phone/resend-otp','/api/phone/verify-otp','/api/phone/status']};
