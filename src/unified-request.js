import {el,select,link} from './consultation-ui.js';
import {MEETING_MODES} from './consultation-options.js';
import {renderOfficeRequest} from './office-request.js';
import {requestParams} from './request-intent.js';

export function renderUnifiedRequest({form,command,refresh,message,selectedPlanner:p,rpc}){
 const params=requestParams(location.search),options=p.consultation_options;if(p.profession==='tax')params.set('purpose','other');
 const modes=(options?.modes||[]).filter(k=>Object.hasOwn(MEETING_MODES,k));
 const offices=(p.offices||[]).filter(o=>o.available);
 if(!offices.length){const i=modes.indexOf('insurance_office');if(i>=0)modes.splice(i,1);}
 form.hidden=false;
 if(!modes.length){el('h2','현재 선택할 수 있는 만남 방식이 없습니다.',form);link(form,'다른 전문가 보기','/map.html?view=experts');return;}
 function choose(){
  form.replaceChildren();el('h2','어디에서 만나실까요?',form);el('p',p.name+' · '+(p.profession==='tax'?'세무사':'보험설계사'),form);
  const mode=select(form,'만남 방식','meeting_mode',Object.fromEntries(modes.map(k=>[k,MEETING_MODES[k]])),params.get('meeting_mode'));
  const office=select(form,'방문할 보험소','office',Object.fromEntries(offices.map(o=>[o.id,o.name])),params.get('office'));
  const update=()=>{office.parentElement.hidden=mode.value!=='insurance_office';};mode.onchange=update;update();
  const next=el('button','날짜·시간 선택',form);next.type='submit';next.className='btn';
  form.onsubmit=e=>{e.preventDefault();params.set('meeting_mode',mode.value);if(mode.value==='insurance_office')params.set('office',office.value);else params.delete('office');history.replaceState(null,'',location.pathname+'?'+params);render();};
 }
 function render(){
  const mode=params.get('meeting_mode'),office=mode==='insurance_office'?offices.find(o=>o.id===params.get('office')):null;
  if(!modes.includes(mode)||mode==='insurance_office'&&!office){choose();return;}
  renderOfficeRequest({form,command,refresh,message,selectedPlanner:p,selectedOffice:office,
   integration:{options,mode,onChange:choose},availability:(_office,_planner,day)=>rpc('integration_slots',{target:p.id,office:office?.id||null,mode,day})});
 }
 render();
}
