export async function renderAdminAccess({client,host}){
 const {data,error}=await client.rpc('admin_access_command',{operation:'list'});
 if(error||!Array.isArray(data))return;
 const el=(tag,text,parent)=>{const n=document.createElement(tag);n.textContent=text;parent.append(n);return n;};
 const box=el('details','',host);box.className='card';el('summary','관리자 계정 관리',box);
 el('p','이 목록의 계정만 관리자 기능을 사용할 수 있습니다. 추가·해제는 대표자만 할 수 있습니다.',box);
 const list=el('div','',box);
 const label=el('label','추가할 관리자 이메일',box);const email=el('input','',label);email.type='email';email.autocomplete='off';email.required=true;
 const whyLabel=el('label','추가·해제 사유',box);const reason=el('input','',whyLabel);reason.maxLength=1000;reason.placeholder='사유를 5자 이상 입력하세요';
 const add=el('button','관리자 추가',box);add.type='button';add.className='btn';
 const status=el('p','',box);status.setAttribute('role','status');
 let busy=false;
 const run=async(operation,mail)=>{
  if(busy)return;
  if(!email.checkValidity()&&operation==='add'){email.reportValidity();return;}
  if(reason.value.trim().length<5){status.textContent='사유를 5자 이상 입력해 주세요.';reason.focus();return;}
  if(!confirm(mail+' 계정의 관리자 권한을 '+(operation==='add'?'추가':'해제')+'할까요?'))return;
  busy=true;box.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{const result=await client.rpc('admin_access_command',{operation,payload:{email:mail,reason:reason.value.trim()}});if(result.error)throw result.error;
   const fresh=await client.rpc('admin_access_command',{operation:'list'});if(fresh.error)throw fresh.error;draw(fresh.data);email.value='';reason.value='';status.textContent='관리자 목록을 저장했습니다.';
  }catch(e){status.textContent=({owner_required:'대표자만 변경할 수 있습니다.',registered_account_required:'먼저 회원가입을 완료한 계정이어야 합니다.',verified_active_member_required:'이메일 확인과 회원가입을 완료한 계정이어야 합니다.',owner_protected:'대표자 계정은 해제할 수 없습니다.',invalid_email:'이메일을 확인해 주세요.'})[e.message]||'저장하지 못했습니다. 입력과 연결 상태를 확인해 주세요.';}
  finally{busy=false;box.querySelectorAll('button').forEach(b=>b.disabled=false);}
 };
 function draw(rows){list.replaceChildren();for(const row of rows){const line=el('p',row.email+(row.owner?' · 대표자':''),list);if(!row.owner){const remove=el('button','권한 해제',line);remove.type='button';remove.className='btn ghost';remove.onclick=()=>run('remove',row.email);}}}
 add.onclick=()=>run('add',email.value.trim());draw(data);
}
