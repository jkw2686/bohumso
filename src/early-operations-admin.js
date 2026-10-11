import {statusLabel,kindLabel,isOpen} from './support-status.js';
export async function renderEarlyOperations({client,host,message}){
 const el=(tag,text,parent=host)=>{const n=document.createElement(tag);n.textContent=text||'';parent.append(n);return n;};
 // ▶ 접힘 대신 제목 카드. 미처리 건수는 제목 옆 배지로 바로 보인다.
 const panel=el('section');panel.className='card admin-rights';
 const head=el('div',null,panel);head.className='admin-rights-head';
 el('h2','문의·개인정보 요청',head);
 const badge=el('span','',head);badge.className='admin-badge';badge.hidden=true;
 const result=await client.rpc('admin_member_rights',{operation:'list'});if(result.error){el('p','요청함 연결을 확인하지 못했습니다.',panel);return;}
 const open=result.data.filter(r=>isOpen(r.status)).length;
 if(open){badge.textContent='미처리 '+open+'건';badge.hidden=false;
  // 관리자 첫 화면 상단에도 같은 건수를 올린다.
  const top=document.createElement('p');top.className='card admin-open-summary';top.setAttribute('role','status');
  top.textContent='미처리 문의 '+open+'건';host.prepend(top);}
 if(!result.data.length)el('p','새 요청이 없습니다.',panel);
 for(const row of result.data){const form=el('form',null,panel);form.className='card';el('h3',kindLabel(row.kind),form);el('p',new Date(row.created_at).toLocaleString('ko-KR')+' · '+statusLabel(row.status),form);el('p',row.detail,form);const label=el('label','처리 상태',form);const status=el('select',null,label);for(const [v,t] of [['IN_PROGRESS',statusLabel('IN_PROGRESS')],['COMPLETED',statusLabel('COMPLETED')],['DECLINED',statusLabel('DECLINED')]]){const o=el('option',t,status);o.value=v;}status.value=row.status==='RECEIVED'?'IN_PROGRESS':row.status;const l=el('label','답변·처리 결과',form);const text=el('textarea',null,l);text.value=row.response;text.minLength=5;text.maxLength=2000;text.required=true;el('p','완료를 선택하기 전에 실제 처리 범위와 보관 사유를 확인하세요. 이 버튼으로 원본 데이터가 자동 삭제되지는 않습니다.',form);const save=el('button','답변 저장',form);save.type='submit';save.className='btn';form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{const r=await client.rpc('admin_member_rights',{operation:'respond',payload:{id:row.id,status:status.value,response:text.value}});if(r.error)throw r.error;message('답변을 저장했습니다. 요청자가 문의 화면에서 확인할 수 있습니다.');}catch{message('저장하지 못했습니다. 다시 확인해 주세요.');}finally{save.disabled=false;}};}
 // ▶ 접힘 대신 버튼(공통 규칙 §1). 목록이 길어 기본은 접어 둔다.
 const metrics=el('section');metrics.className='card';el('h2','오류·이용 단계 집계',metrics);
 const metricsToggle=el('button','집계 보기',metrics);metricsToggle.type='button';metricsToggle.className='btn ghost';
 const metricsBody=el('div',null,metrics);metricsBody.id='adminMetricsBody';metricsBody.hidden=true;
 metricsToggle.setAttribute('aria-expanded','false');metricsToggle.setAttribute('aria-controls',metricsBody.id);
 metricsToggle.onclick=()=>{metricsBody.hidden=!metricsBody.hidden;metricsToggle.setAttribute('aria-expanded',String(!metricsBody.hidden));metricsToggle.textContent=metricsBody.hidden?'집계 보기':'집계 닫기';};const counts=await client.rpc('operational_metrics');if(counts.error){el('p','집계 연결을 확인하지 못했습니다.',metricsBody);return;}el('p','최근 30일 · 시간별 합계 · 개인정보와 상세 상담내용은 포함하지 않습니다.',metricsBody);if(!counts.data.length)el('p','기록된 집계가 없습니다. 수집 설정이 꺼져 있으면 저장하지 않습니다.',metricsBody);for(const c of counts.data.slice(0,100))el('p',new Date(c.hour).toLocaleString('ko-KR')+' · '+c.event+' '+c.total+'회',metricsBody);
}
