import {chatAvailable,mountSupportChat} from './support-chat.js';
import {memberService} from './member-access.js';
import {resources} from '../public/claim-resources-data.js';
import {statusLabel,kindLabel} from './support-status.js';
const root=document.getElementById('rightsContent');
const params=new URLSearchParams(location.search);
const reportResource=resources.find(r=>r.id===params.get('resource'));
// 전문가 화면의 '이름 변경 요청' 에서 들어온 경우. 본문을 미리 채우되 전송은 하지 않는다.
const nameChange=params.get('kind')==='CORRECT'&&params.get('topic')==='name';
const loginNext=reportResource?'/support.html?resource='+encodeURIComponent(reportResource.id):nameChange?'/support.html?'+params:'';
if(loginNext){const login=root.querySelector('a');if(login)login.href='/login.html?next='+encodeURIComponent(loginNext);}
async function start(){const {client}=await memberService();const {data}=await client.auth.getUser();if(!data.user)return;
 if(await chatAvailable(client)){
  const body=nameChange?'현재: '+(params.get('current')||'')+'\n바꿀 이름: \n사유: ':reportResource?'공식 링크 오류 제보\n기관: '+reportResource.name+'\n주소: '+reportResource.url+'\n확인한 문제: ':'';
  await mountSupportChat({client,host:root,userId:data.user.id,initialKind:nameChange?'CORRECT':reportResource?'REPORT':'INQUIRY',initialBody:body});return;
 }

 root.innerHTML='<h2>내 정보와 문의</h2><form id="rightsForm"><label>요청 유형<select name="kind"><option value="INQUIRY">문의</option><option value="ACCESS">개인정보 열람</option><option value="CORRECT">개인정보 정정</option><option value="DELETE">개인정보 삭제</option><option value="REPORT">전문가·오류 신고</option><option value="WITHDRAW">회원탈퇴</option></select></label><label>내용<textarea name="detail" maxlength="2000" rows="4" placeholder="비밀번호·인증번호·건강 상세정보는 입력하지 마세요."></textarea></label><p>삭제는 보관 의무와 처리 범위를 확인한 뒤 결과를 안내합니다. 탈퇴하면 회원 기능 이용이 즉시 중지됩니다.</p><button class="btn">요청 접수</button></form><p id="rightsStatus" role="status"></p><div id="rightsHistory"></div>';
 const status=document.getElementById('rightsStatus'),history=document.getElementById('rightsHistory');
 if(nameChange){const form=document.getElementById('rightsForm');form.elements.kind.value='CORRECT';
  form.elements.detail.value='현재: '+(params.get('current')||'')+'\n바꿀 이름: \n사유: ';
  status.textContent='바꿀 이름과 사유를 적고 접수 버튼을 눌러 주세요. 아직 전송되지 않았습니다.';
  form.elements.detail.focus();}
 if(reportResource){const form=document.getElementById('rightsForm');form.elements.kind.value='REPORT';form.elements.detail.value='공식 링크 오류 제보\n기관: '+reportResource.name+'\n주소: '+reportResource.url+'\n확인한 문제: ';status.textContent='문제를 적고 접수 버튼을 눌러 주세요. 아직 전송되지 않았습니다.';}
 const draw=async()=>{const result=await client.rpc('member_rights',{operation:'list'});if(result.error)throw result.error;history.replaceChildren();for(const r of result.data.requests){const p=document.createElement('p');p.textContent=new Date(r.created_at).toLocaleDateString('ko-KR')+' · '+kindLabel(r.kind)+' · '+statusLabel(r.status);history.append(p);if(r.response){const reply=document.createElement('p');reply.textContent=r.response;history.append(reply);}}};
 document.getElementById('rightsForm').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,d=new FormData(form),operation=String(d.get('kind'));if(operation==='WITHDRAW'&&!confirm('회원 이용을 중지하고 탈퇴를 접수할까요? 예약·자료의 삭제 범위와 보관 사유는 확인 후 안내됩니다.'))return;const button=form.querySelector('button');button.disabled=true;try{const result=await client.rpc('member_rights',{operation,payload:{detail:d.get('detail'),confirmed:operation==='WITHDRAW'}});if(result.error)throw result.error;if(operation==='WITHDRAW'){await client.auth.signOut({scope:'global'});root.replaceChildren();const p=document.createElement('p');p.textContent='탈퇴 요청을 접수하고 회원 이용을 중지했습니다. 자료 삭제 처리 결과는 검토 후 문의 내역으로 알려드릴게요.';root.append(p);return;}status.textContent='문의가 접수됐어요. 내용을 검토한 뒤 답변드릴게요. 확인까지 시간이 소요될 수 있으니 양해 부탁드려요. 답변은 아래 문의 내역에서 확인하실 수 있어요.';form.elements.detail.value='';await draw();}catch{status.textContent='접수하지 못했습니다. 잠시 후 다시 시도하거나 아래 이메일로 문의해 주세요.';}finally{button.disabled=false;}};
 await draw();
}
start().catch(()=>{root.textContent='온라인 요청 연결을 확인하지 못했습니다. 아래 이메일로 문의해 주세요.';});
