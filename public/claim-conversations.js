import {conversations,commonReplies,conversationReview} from './claim-conversations-data.js';
import {conversationArt} from './claim-conversation-art.js';
const node=(tag,text,parent,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;parent.append(n);return n;};
export function mountClaimConversations(host,{findResources}){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let current=conversations[0],playing=false,elapsed=0,last=0,frame=0,active=-1,animations=[];
 node('h2','상황별 청구 도움',host);node('p','상담 전에는 흐름을 익히고, 상담 중에는 필요한 말을 골라 쓰세요. 병원명·보험사·서류를 몰라도 도움을 요청할 수 있습니다.',host);
 const choices=node('div','',host,'conversation-choices');choices.setAttribute('role','group');choices.setAttribute('aria-label','상담 상황');
 const body=node('div','',host);const buttons=[];
 const button=(parent,text,fn,primary=false)=>{const b=node('button',text,parent,primary?'btn':'btn ghost');b.type='button';b.onclick=fn;return b;};
 const copy=(parent,label,text)=>{const status=node('p','',parent,'conversation-meta');status.setAttribute('role','status');button(parent,label,async()=>{try{await navigator.clipboard.writeText(text);status.textContent='멘트를 복사했습니다.';}catch{let field=parent.querySelector('textarea');if(!field){const label=node('label','직접 복사할 멘트',parent,'field');field=node('textarea','',label);field.readOnly=true;field.value=text;}field.focus();field.select();status.textContent='멘트를 선택했습니다. 기기의 복사 기능을 사용해 주세요.';}});};
 const stop=()=>{cancelAnimationFrame(frame);animations.forEach(a=>a.cancel());animations=[];playing=false;};
 let staticGrid,player,stage,play,pause,replay,comic,clock,progress,motionNote;
 function controls(){play.disabled=playing;play.textContent=elapsed>=24000?'다시 재생':elapsed?'이어서 재생':'24초 애니메이션 재생';pause.disabled=!playing;play.hidden=reduced.matches;pause.hidden=replay.hidden=comic.hidden=player.hidden;motionNote.hidden=!reduced.matches;clock.textContent=Math.floor(elapsed/1000)+'초 / 24초';progress.value=elapsed/1000;}
 function showScene(index){active=index;animations.forEach(a=>a.cancel());animations=[];stage.replaceChildren();const p=current.panels[index],duration=[5000,6000,5000,8000][index];node('p',(index+1)+' / 4 · '+p.speaker,stage,'conversation-meta');stage.append(conversationArt(current.id,index,p.scene));node('p',p.speaker,stage,'conversation-speaker');node('p',p.text,stage,'conversation-bubble');
  for(const n of stage.querySelectorAll('.art-head'))animations.push(n.animate([{transform:'rotate(0deg)'},{transform:'rotate(1.3deg)',offset:.35},{transform:'rotate(-.7deg)',offset:.7},{transform:'rotate(0deg)'}],{duration,iterations:1,easing:'ease-in-out'}));
  for(const n of stage.querySelectorAll('.art-hand'))animations.push(n.animate([{transform:'translateY(0)'},{transform:'translateY(-3px)',offset:.4},{transform:'translateY(0)'}],{duration,iterations:1,easing:'ease-in-out'}));
  animations.push(stage.querySelector('.conversation-bubble').animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:200,fill:'both'}));
  if(!playing)animations.forEach(a=>a.pause());
 }
 function tick(now){if(!playing)return;elapsed=Math.min(24000,elapsed+now-last);last=now;const index=elapsed>=16000?3:elapsed>=11000?2:elapsed>=5000?1:0;if(index!==active)showScene(index);controls();if(elapsed>=24000){playing=false;animations.forEach(a=>a.finish());controls();return;}frame=requestAnimationFrame(tick);}
 function start(restart=false){if(reduced.matches)return;if(restart||elapsed>=24000){stop();elapsed=0;active=-1;}staticGrid.hidden=true;player.hidden=false;playing=true;last=performance.now();if(active<0)showScene(0);else animations.forEach(a=>a.play());controls();frame=requestAnimationFrame(tick);}
 function pausePlayback(){if(!playing)return;playing=false;cancelAnimationFrame(frame);animations.forEach(a=>a.pause());controls();}
 function staticView(){const restore=player.contains(document.activeElement)||comic===document.activeElement;stop();elapsed=0;active=-1;player.hidden=true;staticGrid.hidden=false;controls();if(restore){staticGrid.tabIndex=-1;staticGrid.focus();}}
 function draw(){stop();elapsed=0;active=-1;body.replaceChildren();for(const b of buttons)b.setAttribute('aria-pressed',String(b.dataset.story===current.id));
  const heading=node('h3',current.title+' · 먼저 건넬 말',body);heading.tabIndex=-1;
  const script=node('dl','',body,'conversation-script');for(const [title,text]of [['고객이 주로 하는 질문',current.question],['전문가의 첫마디',current.first]]){node('dt',title,script);node('dd',text,script);}
  const details=node('section','',body,'conversation-more');node('h3','확인 질문·다음 행동·피해야 할 표현',details);const deeper=node('dl','',details,'conversation-script');for(const [title,text]of [['상황을 확인하는 짧은 질문',current.check],['다음 행동을 설명하는 말',current.next],['피해야 할 표현',current.avoid]]){node('dt',title,deeper);node('dd',text,deeper);}
  node('h3','상담 장면 · 4컷 만화',body);node('p','가상의 상담 예시입니다. 순서대로 천천히 읽어보세요. 애니메이션은 소리 없이 24초간 재생되며, 읽는 속도에 맞춰 일시정지할 수 있습니다.',body,'conversation-meta');
  staticGrid=node('div','',body,'conversation-comic');staticGrid.dataset.comic='';current.panels.forEach((p,i)=>{const f=node('figure','',staticGrid,'conversation-panel');f.append(conversationArt(current.id,i,p.scene));const caption=node('figcaption','',f);node('p',(i+1)+' / 4 · '+p.speaker,caption,'conversation-speaker');node('p',p.text,caption,'conversation-bubble');});
  player=node('section','',body,'conversation-player');player.hidden=true;player.setAttribute('aria-label',current.title+' 상담 애니메이션');stage=node('div','',player,'conversation-stage');
  const toolbar=node('div','',body,'conversation-controls');play=button(toolbar,'24초 애니메이션 재생',()=>start(),true);pause=button(toolbar,'일시정지',pausePlayback);replay=button(toolbar,'다시 보기',()=>start(true));comic=button(toolbar,'만화로 보기',staticView);
  clock=node('span','0초 / 24초',toolbar,'conversation-meta');progress=node('progress','',toolbar);progress.max=24;progress.value=0;progress.setAttribute('aria-label','애니메이션 재생 진행');
  motionNote=node('p','동작 줄이기 설정에 따라 정적인 4컷 만화를 제공합니다.',body,'conversation-meta');controls();
  node('h3','바로 쓰는 멘트',body);const replies=node('div','',body,'conversation-replies');for(const item of commonReplies){const card=node('article','',replies);node('h4',item.question,card);node('p',item.answer,card);copy(card,'멘트 복사',item.answer);}
  const related=node('section','',body,'conversation-related');node('h3','관련 병원·보험사 공식 안내',related);node('p','기관별 확인정보의 출처·확인일·재확인 표시를 확인하세요. 필요한 서류와 신청 자격은 기관·신청자별로 다릅니다.',related);const actions=node('div','',related,'conversation-controls');button(actions,'병원 서류 발급 안내 찾기',()=>findResources('hospital'));button(actions,'보험사 청구 안내 찾기',()=>findResources('insurer'));copy(related,'고객에게 안내할 문구 복사',current.guide);
  const steps=node('section','',related);node('h3','서로 다른 준비 단계 구분하기',steps);node('p','신분증 사본 준비, 위임장·동의서 요건 확인, 병원서류 발급, 보험사 청구 접수·완료 확인은 서로 다른 단계입니다. 앞 단계를 진행했다고 다음 단계까지 완료된 것은 아닙니다.',steps);node('p','모든 고객에게 같은 서류나 종이 원본 지참·전자위임장을 필수로 요구하지 않습니다. 대리 발급은 해당 기관의 자격·동의 요건을 확인한 뒤 안내하세요.',steps);
  node('p','공통 주의: “무조건 지급”, “전액 보장”, “제가 반드시 받아드립니다” 등 확답은 피합니다. 고객이 원하지 않는 상품상담으로 유도하지 않습니다.',body,'conversation-caution');node('p','보험소 자체 작성 상담 예시 · 문구 검토 '+conversationReview+' · 기관 안내 확인일은 기존 자료의 확인정보를 따릅니다.',body,'conversation-meta');
 }
 for(const story of conversations){const b=button(choices,story.title,()=>{current=story;draw();});b.dataset.story=story.id;buttons.push(b);}
 const initially=new URLSearchParams(location.search).get('situation'),key=({hospitalization:'hospital',surgery:'hospital',illness:'cancer'})[initially]||initially;current=conversations.find(c=>c.id===key)||current;draw();
 reduced.addEventListener('change',()=>{if(reduced.matches)staticView();else controls();});document.addEventListener('visibilitychange',()=>{if(document.hidden)pausePlayback();});host.closest('details')?.addEventListener('toggle',e=>{if(!e.target.open)pausePlayback();});window.addEventListener('pagehide',stop);
}
