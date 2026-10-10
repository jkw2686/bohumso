export const PHOTO_LIMIT=131072;
export function validateThumbnail(bytes){
 if(bytes.length<10||bytes.length>PHOTO_LIMIT||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('invalid_photo');
 let at=2,dimensions=false;
 while(at<bytes.length-2){if(bytes[at++]!==255)throw Error('invalid_photo');const marker=bytes[at++];if(marker===218)break;const size=(bytes[at]<<8)|bytes[at+1];if(size<2||at+size>bytes.length||marker===225||marker===237)throw Error('invalid_photo');if([192,193,194].includes(marker)){const h=(bytes[at+3]<<8)|bytes[at+4],w=(bytes[at+5]<<8)|bytes[at+6];if(w!==h||w<48||w>256)throw Error('invalid_photo');dimensions=true;}at+=size;}
 if(!dimensions)throw Error('invalid_photo');
}
export function storedPhotoPath(url,subject){try{const u=new URL(url);if(u.origin!=='https://bohumso.netlify.app'||u.pathname!=='/api/expert-photo'||u.searchParams.get('id')!==subject||! /^[a-f0-9-]{36}$/.test(u.searchParams.get('v')||''))return null;return subject+'/'+u.searchParams.get('v')+'.jpg';}catch{return null;}}
