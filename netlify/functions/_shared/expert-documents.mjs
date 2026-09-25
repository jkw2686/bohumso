export const DOCUMENT_LIMIT=10*1024*1024;
export function documentType(bytes){
 if(bytes.length<8||bytes.length>DOCUMENT_LIMIT)throw Error('invalid_document');
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return 'image/png';
 if(String.fromCharCode(...bytes.slice(0,5))==='%PDF-')return 'application/pdf';
 throw Error('invalid_document');
}
export function safeFilename(value){return String(value||'document').replace(/[\\/\x00-\x1f<>]/g,'_').slice(0,120);}
