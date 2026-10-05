export function createPhoneHandler(options:{env:(key:string)=>string|undefined;makeClient:Function;fetcher?:typeof fetch;generate?:()=>string}):(request:Request,context?:{ip?:string;deploy?:{context:string;id:string}})=>Promise<Response>;
export function phoneEnabled(env:(key:string)=>string|undefined,deployContext?:string):boolean;
export function normalizePhone(value:unknown):string;
export function maskPhone(value:string):string;
export function otpHash(secret:string,user:string,phone:string,otp:string):string;
