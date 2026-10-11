export const categories={weekly:'주간 레터',book:'이달의 책',rest:'마음 쉬어가기',tools:'상담 도구'};
export const privacyReminder='고객 이름·연락처·주민등록번호·병력 등 개인정보는 적지 마세요.';
export const dayKST=(now=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function weekEnd(now=new Date()){const day=dayKST(now),d=new Date(day+'T12:00:00+09:00');d.setUTCDate(d.getUTCDate()+(7-(d.getUTCDay()||7)));return dayKST(d);}
export function taskGroup(task,now=new Date()){if(task.completed_at)return 'completed';if(!task.due_date)return 'undated';const today=dayKST(now);return task.due_date<today?'overdue':task.due_date===today?'today':'later';}
export const toKSTInput=value=>value?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(value)).replace(' ','T'):'';
export const fromKSTInput=value=>value?new Date(value+':00+09:00').toISOString():null;
export function safeSource(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export const errorCopy={membership_required:'로그인 상태를 확인해 주세요.',expert_required:'전문가 등록 후 이용할 수 있습니다.',admin_required:'운영자만 이용할 수 있습니다.',owner_required:'대표 계정에서 승인할 수 있습니다.',task_forbidden:'이 실천 기록에 접근할 수 없습니다.',content_unavailable:'현재 공개되지 않은 자료입니다. 저장한 실천은 그대로 유지됩니다.',stale_record:'다른 화면에서 변경됐습니다. 입력 내용을 보관하고 새로고침해 주세요.',invalid_task:'할 일은 100자, 메모는 300자 이내로 입력해 주세요.',content_review_required:'확인 항목을 해결하고 현재 원고를 승인해 주세요.',invalid_schedule:'앞으로의 게시 시각을 한국 시간으로 선택해 주세요.',invalid_content:'자료의 제목·본문·실천 제안과 분류를 확인해 주세요.',request_key_conflict:'이전 저장 결과를 확인한 뒤 다시 시도해 주세요.',invalid_hosts:'허용할 공식 사이트의 도메인만 입력해 주세요.'};
export const growthError=e=>errorCopy[e?.message]||'저장 여부를 확인하지 못했습니다. 입력은 유지했으니 같은 내용으로 다시 시도해 주세요.';
export async function growthRPC(client,operation,payload={}){const r=await client.rpc('growth_command',{operation,payload});if(r.error)throw r.error;if(/^(task_|admin_(save|approve|exclude|publish|schedule|unpublish|settings_save))/.test(operation)&&!r.data?.saved)throw Error('missing_receipt');return r.data;}
