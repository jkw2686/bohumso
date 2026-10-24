import {isExpertMember} from './role-routing.js';
import {expertNavigation} from './expert-navigation.js';
import {MEMBER, memberService, memberState, invalidateMemberState, authURL} from './member-access.js';
import '../public/expert-profile-card.js';

const identity = document.getElementById('menuIdentity');
const content = document.getElementById('menuContent');
const status = document.getElementById('menuStatus');
const retry = document.getElementById('menuRetry');
const destination = (page, hash = '') => `/${page}.html?from=menu${hash ? '#' + hash : ''}`;
const account = destination('account');
let revision = 0, observedClient;
function clearIdentity() {
  ++revision;
  identity.replaceChildren();
  content.replaceChildren();
  status.textContent = '';
  content.setAttribute('aria-busy', 'true');
  retry.disabled = true;
}
function recheck() {
  clearIdentity();
  if (observedClient) invalidateMemberState(observedClient);
  const pending = revision;
  // Supabase auth callbacks must return before another auth request acquires its lock.
  setTimeout(() => { if (pending === revision) void load(); }, 0);
}
function observeAuth(client) {
  if (observedClient === client) return;
  observedClient = client;
  client.auth.onAuthStateChange(event => {
    if (event !== 'INITIAL_SESSION') recheck();
  });
}

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
  return section;
}
function common(expert, billing, tax=false) {
  group('이용 안내', [
    ['고객센터', destination('support'), 'support'],
    ...(tax?[]:[['이용·결제 정보', billing && expert ? destination('partner-work', 'workflowSummary') : '/payment-policy.html', 'card']]),
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
  for (const [label, mode] of [['일반회원 로그인', 'login'], ['전문가 로그인', 'expert'], ['회원가입', 'signup']]) {
    const link = node('a', label, actions, mode === 'signup' ? 'btn' : 'btn ghost');
    link.href = authURL(mode==='expert'?'/partner.html?roleIntent=expert':'/map.html?view=experts&profession=planner&help=claim&purpose=claim',mode==='expert'?'login':mode);
  }
  publicMenus();
}
async function load() {
  clearIdentity();
  const current = revision;
  content.setAttribute('aria-busy', 'true');
  retry.disabled = true;
  status.textContent = '';
  // Recheck the session on return without leaving a previous role's links visible.
  content.replaceChildren();
  identity.replaceChildren();
  node('p', '내 정보를 확인하고 있어요.', identity);
  try {
    const {client, config} = await memberService();
    if (current !== revision) return;
    observeAuth(client);
    const auth = await memberState(client);
    if (current !== revision) return;
    content.replaceChildren();
    retry.hidden = true;
    if (auth.state === MEMBER.anonymous) { guest(); return; }
    const {membership: member, user} = auth;
    const approved = member.member && member.partner_status === 'approved' && member.profession !== 'office';
    const planner = approved && ['planner','tax'].includes(member.profession);
    let resources;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || '회원님';
    const role = approved ? '전문가' : member.partner_status ? '전문가 신청 · 심사 현황 확인' : member.member ? '일반 회원' : '가입 마무리가 필요해요';
    profile(name, role);
    if(isExpertMember(member)){
      group('전문가 메뉴',[['전문가 홈','/partner.html','home'],['상담 요청',approved?'/partner-work.html':'/partner.html','calendar'],['내 정보','/partner.html?screen=settings','person']]);
    }else{publicMenus();}
    if(member.member)group('예약 알림', [['알림 내역·설정','/notifications.html','calendar']]);
    if(member.office_operator_status)group('보험소 운영', [['거점 신청·심사', '/partner.html?profession=office', 'home']]);
    if (!member.member) row(node('div', '', identity, 'menu-profile-action'), '가입 마무리', account);
    if (member.admin) group('운영 관리', [
      ['관리자 화면', destination('admin'), 'shield'],
      ['예약 관리', destination('admin-requests'), 'calendar'],
    ]);
    // Role menus are usable before optional profile/catalog/library lookups finish.
    const lookupResults = await Promise.allSettled([
      planner ? client.rpc('expert_optional_profile', {operation: 'get'}) : null,
      approved&&member.profession==='planner' ? client.rpc('growth_command', {operation: 'capabilities', payload: {}}) : null,
      approved ? client.rpc('planner_catalog', {area: '', wanted: ''}) : null,
    ]);
    if (current !== revision) return;
    const results = lookupResults.map(result => result.status === 'fulfilled' ? result.value : {error: result.reason});
    const [optional, growthResult, catalog] = results;
    const extra = optional?.error ? null : optional?.data;
    if (extra) {
      if (extra.name) identity.querySelector('.menu-name').textContent = extra.name;
      const head = identity.querySelector('.menu-profile-row');
      const oldAvatar = head.querySelector('.expert-avatar');
      const updatedAvatar = window.BohumsoProfile.avatar(head, extra);
      if (oldAvatar) oldAvatar.replaceWith(updatedAvatar);
      const published = catalog?.error ? null : catalog?.data?.planners?.find(p => p.id === extra.id && !p.is_sample);
      if (published) row(node('div', '', identity, 'menu-profile-action'), '내 프로필 보기', '/map.html?' + new URLSearchParams({preview:'profile',planner: published.id, region: published.region || '', from: 'menu'}) + '#profile-' + encodeURIComponent(published.id));
    }
    if (growthResult?.data?.expert && resources) {
      const list = resources.querySelector('ul');
      row(node('li', '', list), '상담 자료', destination('growth', 'growthLibrary'), 'search');
      row(node('li', '', list), '실천 기록', destination('growth', 'growthPractice'), 'check');
    }
    if (results.some(result => result?.error)) {
      status.textContent = '일부 내 정보를 불러오지 못했어요. 다시 확인해 주세요.';
      retry.hidden = false;
    }
  } catch {
    if (current !== revision) return;
    identity.replaceChildren();
    node('p', '내 정보를 불러오지 못했어요.', identity);
    content.replaceChildren();
    status.textContent = '연결을 확인하고 다시 시도해 주세요.';
    retry.hidden = false;
  } finally {
    if (current === revision) {
      content.setAttribute('aria-busy', 'false');
      retry.disabled = false;
    }
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
window.addEventListener('pagehide', clearIdentity);
window.addEventListener('pageshow', event => { if (event.persisted) recheck(); });
window.addEventListener('storage', event => {
  if (event.key === 'woori-account' || event.key === null) recheck();
});
void load().then(() => { if (history.state?.menuScroll) scrollTo(0, history.state.menuScroll); });
