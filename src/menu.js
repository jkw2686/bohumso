import {MEMBER, memberService, memberState, authURL} from './member-access.js';
import '../public/expert-profile-card.js';

const identity = document.getElementById('menuIdentity');
const content = document.getElementById('menuContent');
const status = document.getElementById('menuStatus');
const retry = document.getElementById('menuRetry');
const destination = (page, hash = '') => `/${page}.html?from=menu${hash ? '#' + hash : ''}`;
const account = destination('account');
let loading = false;

function node(tag, text, parent, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  parent?.append(element);
  return element;
}
function icon(parent, name, className = '') {
  const span = node('span', '', parent, className);
  span.innerHTML = window.uiIcon(name);
  span.setAttribute('aria-hidden', 'true');
}
function row(parent, label, href, symbol) {
  const link = node('a', '', parent, 'menu-row');
  link.href = href;
  if (symbol) icon(link, symbol, 'menu-row-icon');
  node('span', label, link, 'menu-row-label');
  icon(link, 'chevron', 'menu-chevron');
  return link;
}
function group(title, items) {
  if (!items.length) return;
  const section = node('section', '', content, 'menu-group');
  const heading = node('h2', title, section);
  heading.id = 'menu-group-' + content.children.length;
  section.setAttribute('aria-labelledby', heading.id);
  const list = node('ul', '', section);
  for (const [label, href, symbol] of items) row(node('li', '', list), label, href, symbol);
}
function common(expert, billing) {
  group('이용 안내', [
    ['고객센터', destination('support'), 'support'],
    ['이용·결제 정보', billing && expert ? destination('partner-work', 'workflowSummary') : '/payment-policy.html', 'card'],
    ['계정 설정', account, 'settings'],
  ]);
}
function publicMenus() {
  group('도움 찾기', [
    ['가까운 전문가', '/map.html?view=experts', 'experts'],
    ['방문할 보험소', '/map.html?view=offices', 'office'],
    ['내 예약', destination('requests'), 'calendar'],
  ]);
  common(false, false);
}
function profile(name, role, photo) {
  identity.replaceChildren();
  const head = node('div', '', identity, 'menu-profile-row');
  window.BohumsoProfile.avatar(head, photo || {});
  const text = node('div', '', head, 'menu-profile-text');
  node('strong', name, text, 'menu-name');
  node('p', role, text, 'menu-role');
  const settings = node('a', '', head, 'menu-settings');
  settings.href = account;
  settings.setAttribute('aria-label', '계정 설정');
  icon(settings, 'settings');
}
function guest() {
  profile('반가워요', '로그인하고 내 메뉴를 확인하세요.');
  const actions = node('div', '', identity, 'menu-login-actions');
  for (const [label, mode] of [['로그인', 'login'], ['무료 회원가입', 'signup']]) {
    const link = node('a', label, actions, mode === 'login' ? 'btn ghost' : 'btn');
    link.href = authURL('/menu.html', mode);
  }
  publicMenus();
}
async function load() {
  if (loading) return;
  loading = true;
  content.setAttribute('aria-busy', 'true');
  retry.disabled = true;
  status.textContent = '';
  // Recheck the session on return without leaving a previous role's links visible.
  content.replaceChildren();
  identity.replaceChildren();
  node('p', '내 정보를 확인하고 있어요.', identity);
  try {
    const {client, config} = await memberService();
    const auth = await memberState(client);
    content.replaceChildren();
    retry.hidden = true;
    if (auth.state === MEMBER.anonymous) { guest(); return; }
    const {membership: member, user} = auth;
    const approved = member.member && member.partner_status === 'approved' && member.profession !== 'office';
    const planner = approved && ['planner','tax'].includes(member.profession);
    const results = await Promise.all([
      planner ? client.rpc('expert_optional_profile', {operation: 'get'}) : null,
      approved ? client.rpc('growth_command', {operation: 'capabilities', payload: {}}) : null,
      approved ? client.rpc('planner_catalog', {area: '', wanted: ''}) : null,
    ]);
    const [optional, growth, catalog] = results;
    const own = optional?.error ? null : optional?.data;
    const publicProfile = catalog?.error ? null : catalog?.data?.planners?.find(p => p.id === own?.id && !p.is_sample);
    const name = own?.name || user.user_metadata?.full_name || user.user_metadata?.name || '회원님';
    const role = approved ? '전문가' : member.partner_status ? '전문가 신청 · 심사 현황 확인' : member.member ? '일반 회원' : '가입 마무리가 필요해요';
    profile(name, role, own);
    if (publicProfile) {
      row(node('div', '', identity, 'menu-profile-action'), '내 프로필 보기', '/find.html?' + new URLSearchParams({planner: publicProfile.id, region: publicProfile.region || '', from: 'menu'}) + '#profile-' + encodeURIComponent(publicProfile.id));
    }
    if (approved) {
      group('상담 관리', [
        ['상담 요청', destination('partner-work', 'workflowFilters').replace('?from=menu', '?from=menu&state=requested'), 'support'],
        ['예약 내역', destination('partner-work', 'workflowFilters'), 'calendar'],
        ...(planner ? [['상담 가능 설정', destination('partner', 'consult-settings'), 'clock']] : []),
        ['지금 방문 상담', destination('partner', 'instant-settings'), 'car'],
      ]);
      group('내 활동', [
        ...(planner ? [['프로필 수정', destination('partner', 'profile-editor'), 'person']] : []),
        ['활동 지역', destination('partner', 'activity-area'), 'pin'],
        ['등록·심사 정보', destination('partner', 'partnerState'), 'shield'],
      ]);
      group('업무 자료', [
        ['청구 안내', destination('claim-resources'), 'document'],
        ...(growth?.data?.expert ? [
          ['상담 자료', destination('growth', 'growthLibrary'), 'search'],
          ['실천 기록', destination('growth', 'growthPractice'), 'check'],
        ] : []),
      ]);
      common(true, config.paymentsEnabled !== false);
    } else {
      publicMenus();
      group('내 활동', [[member.partner_status ? '전문가 신청 현황' : '전문가로 활동하기', destination('partner'), 'person']]);
    }
    if(member.office_operator_status)group('보험소 운영', [['거점 신청·심사', '/partner.html?profession=office', 'home']]);
    if (!member.member) row(node('div', '', identity, 'menu-profile-action'), '가입 마무리', account);
    if (member.admin) group('운영 관리', [
      ['관리자 화면', destination('admin'), 'shield'],
      ['예약 관리', destination('admin-requests'), 'calendar'],
    ]);
    if (results.some(result => result?.error)) {
      status.textContent = '일부 내 정보를 불러오지 못했어요. 다시 확인해 주세요.';
      retry.hidden = false;
    }
  } catch {
    identity.replaceChildren();
    node('p', '내 정보를 불러오지 못했어요.', identity);
    content.replaceChildren();
    publicMenus();
    status.textContent = '연결을 확인하고 다시 시도해 주세요.';
    retry.hidden = false;
  } finally {
    content.setAttribute('aria-busy', 'false');
    loading = false;
    retry.disabled = false;
  }
}
retry.addEventListener('click', load);
const nav = document.querySelector('[data-customer-nav]');
new ResizeObserver(() => {
  const gap = Math.max(0, innerHeight - nav.getBoundingClientRect().bottom);
  document.body.style.setProperty('--menu-bottom-space', (nav.offsetHeight + gap) + 'px');
}).observe(nav);
// Back/forward restores the menu at the row the user left, after role menus render.
document.addEventListener('click', event => {
  if (event.target.closest('a[href]')) history.replaceState({...history.state, menuScroll: scrollY}, '');
});
window.addEventListener('pageshow', event => { if (event.persisted) void load(); });
void load().then(() => { if (history.state?.menuScroll) scrollTo(0, history.state.menuScroll); });
