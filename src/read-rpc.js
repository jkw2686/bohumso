// Bound read-only requests. Mutations must retain their server result semantics.
export async function readRpc(client,name,args){
 let timer;
 try{
  const result=await Promise.race([client.rpc(name,args),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('read_timeout')),12000);})]);
  if(result.error)throw result.error;
  return result.data;
 }finally{clearTimeout(timer);}
}
