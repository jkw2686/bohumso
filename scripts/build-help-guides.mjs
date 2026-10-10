import {writeFile} from 'node:fs/promises';
import {helpGuides,claimDocumentSource} from '../src/help-guide-content.mjs';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function buildHelpGuides(){
 for(const guide of helpGuides){
  const coverage=guide.slug==='coverage',mapURL='/map.html?view=experts&purpose='+(coverage?'coverage':'claim')+'&situation='+guide.slug;
  const choices=guide.slug==='claim'?`<fieldset class="guide-situation-choice"><legend>어떤 상황인가요? <span>(선택)</span></legend>${[['illness','진단받았어요'],['hospitalization','입원·수술했어요'],['accident','다쳤어요 / 사고가 났어요'],['death','가족이 돌아가셨어요'],['claim','어떤 항목인지 잘 모르겠어요']].map(([value,label])=>`<label><input type="radio" name="guideSituation" value="${value}"${value==='claim'?' checked':''}><span>${label}</span></label>`).join('')}</fieldset>`:'';
  const html=`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(guide.title)} · 우리곁에 보험소</title><meta name="description" content="${esc(guide.intro)}"><link rel="canonical" href="https://bohumso.netlify.app/help/${guide.slug}.html">
<meta property="og:title" content="${esc(guide.title)} · 우리곁에 보험소"><meta property="og:description" content="${esc(guide.intro)}"><meta property="og:type" content="website">
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/simple-ux.css"><link rel="stylesheet" href="/type-system.css"><link rel="stylesheet" href="/help-guide.css"></head>
<body class="claim-help-page"><header class="nav"><a class="logo" href="/"><img class="brand-logo" src="/brand/logo-horizontal-transparent.svg" alt="우리곁에 보험소" width="224" height="60"></a><nav data-member-header class="member-header" aria-label="회원 메뉴"><a href="/login.html">로그인</a><a class="member-primary" href="/signup.html">무료 회원가입</a></nav></header>
<main class="help-guide" data-guide-situation="${guide.slug}">
<a class="guide-back" href="/#situations">← 다른 상황 선택</a>
<div class="guide-intro"><span class="guide-icon" data-icon="${guide.icon}" aria-hidden="true"></span><p class="guide-eyebrow">${coverage?'가입한 보험부터 차근차근':'보험금 청구, 여기서부터'}</p><h1>${esc(guide.title)}</h1><p>${esc(guide.intro)}</p></div>
${choices}
<section class="service-steps guide-steps" aria-label="도움받는 3단계"><ol>${guide.steps.map(([title,body],i)=>`<li><span class="guide-step-number">0${i+1}</span><div><h2>${esc(title)}</h2><p>${esc(body)}</p></div></li>`).join('')}</ol></section>
<div class="guide-actions" aria-label="다음 단계"><a class="btn" data-guide-primary href="${coverage?'#documents':esc(mapURL)}">${esc(guide.primary)}</a><a class="btn ghost" data-guide-secondary href="${coverage?esc(mapURL):'#documents'}">${esc(guide.secondary)}</a></div>
<p class="guide-note guide-access">안내와 전문가 탐색은 가입 없이 이용할 수 있어요. 상담 요청 시 로그인과 필요한 본인 확인을 진행합니다.</p>
<details id="documents" class="guide-documents"><summary>${coverage?'가입보험 확인 준비':'필요서류 먼저 확인'}<span>펼쳐보기</span></summary><div class="guide-document-body">
<h2>${coverage?'내 보험, 이렇게 확인하세요':'상담 전 준비'}</h2>
<p>${coverage?'보험증권이나 보험사 앱을 보며 직접 확인해 보세요.':'아래는 준비할 서류의 예시입니다. 발급 전 가입 보험사에 최종 제출서류를 확인해 주세요.'}</p>
<ul>${guide.documents.map(([title,body])=>`<li><strong>${esc(title)}</strong><p>${esc(body)}</p></li>`).join('')}</ul>
${coverage?'':`<p class="guide-note">보험사·상품·청구 항목에 따라 추가서류나 대체서류가 달라질 수 있어요. <a href="${esc(claimDocumentSource)}" target="_blank" rel="noopener noreferrer">보험사 서류 안내 예시 · 새 창</a></p>`}
<p class="guide-note">이 화면에서는 신분증·진단서 등 개인정보를 입력하거나 제출하지 않습니다.</p></div></details>
<section class="guide-trust"><h2>보험 가입 의무는 없습니다.</h2><p>현재 상황에 필요한 상담과 보험금 청구 준비를 돕습니다.</p><details><summary>비용과 보험 가입</summary><p>보험소의 가입·탐색·상담 신청은 무료입니다. 별도 비용이 필요한 업무는 진행 전에 전문가에게 범위와 비용을 확인하세요.</p></details></section>
<p class="guide-note">실제 보험금 지급 여부와 지급금액은 가입한 보험상품의 약관 및 보험사의 심사 결과에 따라 달라질 수 있습니다.</p>
<section class="company-info" data-company-info aria-label="운영 정보"></section></main>
<footer class="policy-footer"><a href="/terms.html">이용약관</a> · <a href="/privacy.html">개인정보처리방침</a> · <a href="/support.html">문의하기</a></footer>
<nav class="customer-nav" data-customer-nav="home" aria-label="주 메뉴"></nav><script src="/ui-icons.js"></script><script src="/help-guide.js"></script><script type="module" src="/assets/member.js"></script><script type="module" src="/company-info.js"></script></body></html>
`;
  await writeFile(new URL('../public/help/'+guide.slug+'.html',import.meta.url),html);
 }
}
