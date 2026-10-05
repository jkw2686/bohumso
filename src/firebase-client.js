import {initializeApp,getApps} from 'firebase/app';
import {getMessaging,getToken,deleteToken,onMessage,isSupported} from 'firebase/messaging';
export {getToken,deleteToken,onMessage,isSupported};
export const messaging=config=>getMessaging(getApps()[0]||initializeApp(config));
