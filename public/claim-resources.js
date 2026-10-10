import {resources,resourceTypes,applicantTypes,resourceScope} from './claim-resources-data.js';
import {matchesResourceQuery,inResourceCategory} from './claim-resource-search.js';

const $=id=>document.getElementById(id),form=$('resourceFilters'),queryInput=form.elements.query,selected=new Map();
let category='all',composing=false,lastSearch='';
function el(tag,text,parent,cls){const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;parent?.append(node);return node;}
function official(parent,label,url){const a=el('a',label+' ↗',parent);a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label',label+' · 새 창');return a;}
function typeLabel(r){return (r.type==='insurer'&&resourceTypes[r.insuranceClass])||resourceTypes[r.type];}
const initialQuery=new URLSearchParams(location.search);
if(initialQuery.get('view')==='consumer'){
 $('resourceBack').textContent='전문가 살펴보기';initialQuery.set('view','experts');
 $('resourceBack').href='/map.html?'+initialQuery;
 $('consumerResourceNote').querySelector('a').href=$('resourceBack').href;$('consumerResourceNote').hidden=false;
}
function sourceInfo(parent,r){
 const stale=Date.now()-new Date(r.checkedAt+'T00:00:00+09:00').getTime()>90*86400000;
 el('p',r.verification+' · '+r.checkedAt+(stale?' · 최신 내용 재확인 필요':''),parent,'resource-meta');
 if(r.importedVerification)el('p','원자료: '+r.importedVerification+' · '+(r.sourceDate||r.checkedAt),parent,'resource-meta');
 if(r.checkNote)el('p',r.checkNote,parent,'resource-note');
 if(r.alternateUrl)official(parent,'공식 홈페이지',r.alternateUrl);
 el('p','메뉴: '+r.menu,parent,'resource-note');
 if(r.legacyUrl)official(parent,r.legacyLabel,r.legacyUrl);
 if(r.successorNote)el('p',r.successorNote,parent,'resource-note');
}
function facts(parent,r,applicant='self'){
 const dl=el('dl','',parent);
 for(const [title,value]of [['접수·발급 방법',r.method],['공식 양식·구비서류',r.forms]]){
  el('dt',title,dl);el('dd',value,dl);
 }
 if(r.applicants){el('dt',applicantTypes[applicant]+' 신청',dl);el('dd',r.applicants[applicant],dl);}
}
function checklist(parent,r,applicant){
 const set=el('fieldset','',parent,'resource-checklist');el('legend','안내문에 담을 내용',set);
 const entries=r.checklist.map((text,i)=>({key:r.id+':'+i,text}));
 if(r.applicants)entries.unshift({key:r.id+':applicant:'+applicant,text:applicantTypes[applicant]+' 신청: '+r.applicants[applicant]});
 for(const entry of entries){
  const label=el('label','',set),box=el('input','',label);box.type='checkbox';box.checked=selected.has(entry.key);el('span',entry.text,label);
  box.onchange=()=>{if(box.checked)selected.set(entry.key,{resource:r,text:entry.text});else selected.delete(entry.key);preview();};
 }
}
function details(parent,r){
 el('p',r.summary,parent);
 let applicant='self',select;
 if(r.applicants){
  const label=el('label','기록 발급 신청자',parent,'field');select=el('select','',label);select.setAttribute('aria-label',r.name+' 기록 발급 신청자');
  for(const [value,title]of Object.entries(applicantTypes))el('option',title,select).value=value;
 }
 const content=el('div','',parent);
 const refresh=()=>{content.replaceChildren();facts(content,r,applicant);checklist(content,r,applicant);};
 if(select)select.onchange=()=>{applicant=select.value;refresh();};refresh();
 const actions=el('div','',parent,'resource-actions');
 if(r.formsUrl)official(actions,'공식 양식',r.formsUrl).className='btn ghost';
 if(r.detailsUrl)official(actions,r.type==='hospital'?'관계별 구비서류':'참여기관 확인',r.detailsUrl).className='btn ghost';
 if(r.menuUrl)official(actions,r.menuLabel,r.menuUrl).className='btn ghost';
 const toPreparation=el('button','선택한 안내문 보기',actions,'btn ghost');toPreparation.type='button';
 toPreparation.onclick=()=>{$('preparationTools').open=true;$('preparationSummary').focus();$('preparationTools').scrollIntoView({block:'start'});};
 sourceInfo(parent,r);
 const tools=el('div','',parent,'resource-actions'),status=el('p','',parent,'resource-meta');status.setAttribute('role','status');
 const copy=el('button','링크 복사',tools,'btn ghost');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(r.url);status.textContent='공식 링크를 복사했습니다.';}catch{let fallback=parent.querySelector('[data-link-copy]');if(!fallback){const label=el('label','복사할 공식 링크',parent,'field');fallback=el('input','',label);fallback.readOnly=true;fallback.dataset.linkCopy='';fallback.value=r.url;}fallback.focus();fallback.select();status.textContent='주소를 선택했습니다. 복사 기능을 사용해 주세요.';}};
 const report=el('a','링크 오류 제보',tools,'btn ghost');report.href='/support.html?resource='+encodeURIComponent(r.id);el('small','기관명과 링크만 문의 내용에 담습니다. 접수 전 직접 확인하세요.',parent,'resource-note');
}
function row(parent,r){
 const tr=el('tr','',parent,'resource-row');tr.dataset.resourceId=r.id;
 const title=el('td','',tr,'resource-name');el('h3',r.name,title);
 const toggle=el('button','준비사항·확인정보',title,'resource-detail-toggle');toggle.type='button';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','resource-info-'+r.id);
 const meta=el('td','',tr,'resource-place');el('span',r.region,meta);el('span',typeLabel(r),meta);
 const links=el('td','',tr,'resource-links');official(links,r.urlLabel,r.url).className='btn ghost';
 if(r.reviewStatus==='check')el('span','세부 안내 재확인',links,'resource-meta');
 const info=el('tr','',parent,'resource-info');info.hidden=true;info.id='resource-info-'+r.id;
 const cell=el('td','',info);cell.colSpan=3;let built=false;
 toggle.onclick=()=>{const open=info.hidden;info.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open&&!built){details(cell,r);built=true;}};
}
function updateCategories(){const insurance=['insurer','life','nonlife','post'].includes(category);$('insuranceCategories').hidden=!insurance;for(const button of $('resourceCategories').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.category===category||(insurance&&button.dataset.category==='insurer')));for(const button of $('insuranceCategories').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.category===category));}
function render(){
 const rows=resources.filter(r=>inResourceCategory(r,category)&&matchesResourceQuery(r,queryInput.value,resourceTypes));
 const fragment=document.createDocumentFragment();for(const r of rows)row(fragment,r);$('resourceList').replaceChildren(fragment);
 $('resourceCount').textContent=queryInput.value.trim()?'“'+queryInput.value.trim()+'” 검색 결과 '+rows.length+'곳':rows.length+'곳';
 $('resourceEmpty').hidden=rows.length!==0;$('resetResources').hidden=!queryInput.value&&category==='all';updateCategories();
}
function search(){if(composing)return;const key=category+'\n'+queryInput.value;if(key===lastSearch)return;lastSearch=key;render();}
function reset(){queryInput.value='';category='all';lastSearch='';search();queryInput.focus();}
queryInput.oncompositionstart=()=>{composing=true;};
queryInput.oncompositionend=()=>{composing=false;category='all';search();};
queryInput.oninput=()=>{if(!composing){category='all';search();}};
form.onsubmit=e=>{e.preventDefault();search();};
$('resetResources').onclick=reset;$('clearEmptySearch').onclick=reset;
for(const button of document.querySelectorAll('#resourceCategories button,#insuranceCategories button'))button.onclick=()=>{category=button.dataset.category;search();};
function preview(){
 const groups=new Map();
 for(const {resource,text}of selected.values()){if(!groups.has(resource.id))groups.set(resource.id,{resource,texts:[]});groups.get(resource.id).texts.push(text);}
 const blocks=[...groups.values()].map(({resource:r,texts})=>'['+r.name+']\n'+texts.map(t=>'• '+t).join('\n')+'\n공식 안내: '+r.url+'\n확인일: '+r.checkedAt);
 $('preparationText').value=blocks.length?'상담 후 함께 확인할 준비사항\n\n'+blocks.join('\n\n')+'\n\n필요한 자료와 신청 자격은 기관의 최신 안내로 확인해 주세요. 이 안내만으로 보험금 지급이 결정되지 않습니다.':'';
 for(const id of ['copyPreparation','sharePreparation','clearPreparation'])$(id).disabled=!blocks.length;
 $('preparationSummary').textContent='안내문 만들기'+(selected.size?' · '+selected.size+'개 선택':'');
 $('preparationStatus').textContent=blocks.length?selected.size+'개 항목을 선택했어요. 공유 전에 내용을 확인해 주세요.':'기관의 준비사항에서 안내할 항목을 선택하세요.';
}
function comparison(){
 const root=$('compareResults');root.replaceChildren();const ids=[...$('compareChoices').querySelectorAll('select')].map(n=>n.value);
 const rows=resources.filter(r=>ids.includes(r.id));
 for(const r of rows){const c=el('article','',root,'card');el('h3',r.name,c);official(c,r.urlLabel,r.url);facts(c,r);}
 if(rows.length<2)el('p','서로 다른 보험사 두 곳을 선택하세요.',root);
}
for(const labelText of ['첫 번째 보험사','두 번째 보험사']){
 const label=el('label',labelText,$('compareChoices'),'field'),select=el('select','',label);el('option','보험사 선택',select).value='';
 for(const r of resources.filter(r=>r.type==='insurer'))el('option',r.name,select).value=r.id;select.onchange=comparison;
}
const scope=resourceScope.summary;
$('resourceScope').textContent='병원 '+scope.hospital+'곳 · 생명보험 '+(scope.life+scope.pension)+'곳(연금보험 '+scope.pension+'곳 포함) · 손해보험 '+scope.nonlife+'곳 · 우체국보험 '+scope.post+'곳. 연금보험과 보증·재보험 '+scope.other+'곳은 업무 범위를 구분해 안내합니다.';
$('clearPreparation').onclick=()=>{selected.clear();for(const input of $('resourceList').querySelectorAll('input[type=checkbox]'))input.checked=false;preview();};
function manualCopy(){const text=$('preparationText');text.focus();text.select();$('preparationStatus').textContent='안내문을 선택했습니다. 길게 누르거나 복사 기능을 사용해 주세요.';}
$('copyPreparation').onclick=async()=>{try{await navigator.clipboard.writeText($('preparationText').value);$('preparationStatus').textContent='안내문을 복사했습니다.';}catch{manualCopy();}};
$('sharePreparation').onclick=async()=>{if(!navigator.share){manualCopy();return;}try{await navigator.share({title:'함께 확인할 준비사항 · 보험소',text:$('preparationText').value});$('preparationStatus').textContent='공유 창을 닫았습니다. 실제 전달 여부는 선택한 앱에서 확인하세요.';}catch(e){if(e.name==='AbortError')$('preparationStatus').textContent='공유를 취소했어요. 선택한 항목은 유지됩니다.';else manualCopy();}};
function openHash(){const id=location.hash.slice(1),panel=id==='compareTitle'?'comparisonTools':id==='preparationTitle'?'preparationTools':null;if(panel){$(panel).open=true;$(id).scrollIntoView({block:'start'});}}
window.addEventListener('hashchange',openHash);search();comparison();preview();openHash();
