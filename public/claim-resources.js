import {mountClaimConversations} from './claim-conversations.js';
import {resources,resourceTypes,applicantTypes,resourceScope} from './claim-resources-data.js';
import {matchesResourceQuery,inResourceCategory} from './claim-resource-search.js';

const $=id=>document.getElementById(id),form=$('resourceFilters'),queryInput=form.elements.query;
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
function details(parent,r){
 el('p',r.summary,parent);
 let applicant='self',select;
 if(r.applicants){
  const label=el('label','기록 발급 신청자',parent,'field');select=el('select','',label);select.setAttribute('aria-label',r.name+' 기록 발급 신청자');
  for(const [value,title]of Object.entries(applicantTypes))el('option',title,select).value=value;
 }
 const content=el('div','',parent);
 const refresh=()=>{content.replaceChildren();facts(content,r,applicant);};
 if(select)select.onchange=()=>{applicant=select.value;refresh();};refresh();
 const actions=el('div','',parent,'resource-actions');
 if(r.formsUrl)official(actions,'공식 양식',r.formsUrl).className='btn ghost';
 if(r.detailsUrl)official(actions,r.type==='hospital'?'관계별 구비서류':'참여기관 확인',r.detailsUrl).className='btn ghost';
 if(r.menuUrl)official(actions,r.menuLabel,r.menuUrl).className='btn ghost';
 sourceInfo(parent,r);
 const tools=el('div','',parent,'resource-actions'),status=el('p','',parent,'resource-meta');status.setAttribute('role','status');
 const copy=el('button','링크 복사',tools,'btn ghost');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(r.url);status.textContent='공식 링크를 복사했습니다.';}catch{let fallback=parent.querySelector('[data-link-copy]');if(!fallback){const label=el('label','복사할 공식 링크',parent,'field');fallback=el('input','',label);fallback.readOnly=true;fallback.dataset.linkCopy='';fallback.value=r.url;}fallback.focus();fallback.select();status.textContent='주소를 선택했습니다. 복사 기능을 사용해 주세요.';}};
 const report=el('a','링크 오류 제보',tools,'btn ghost');report.href='/support.html?resource='+encodeURIComponent(r.id);el('small','기관명과 링크만 문의 내용에 담습니다. 접수 전 직접 확인하세요.',parent,'resource-note');
}
function row(parent,r){
 const tr=el('tr','',parent,'resource-row');tr.dataset.resourceId=r.id;
 const title=el('td','',tr,'resource-name'),heading=el('h3','',title);
 const toggle=el('button','',heading,'resource-detail-toggle');el('span',r.name,toggle,'resource-institution-name');el('span','준비사항·확인정보',toggle,'resource-row-hint');toggle.type='button';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','resource-info-'+r.id);
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
function openHash(){if(location.hash==='#claimScripts'){$('claimScripts').open=true;$('claimScripts').scrollIntoView({block:'start'});}if(location.hash.slice(1)==='compareTitle'){$('comparisonTools').open=true;$('compareTitle').scrollIntoView({block:'start'});}}
window.addEventListener('hashchange',openHash);search();comparison();openHash();

mountClaimConversations($('claimConversations'),{findResources(type){category=type;queryInput.value='';lastSearch='';search();$('resourceFilters').scrollIntoView({block:'start'});queryInput.focus({preventScroll:true});}});
