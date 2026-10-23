// 전문가 전용 보험사 연락처. 승인된 전문가와 관리자만 열람하고, 쓰기는 관리자 화면에서만 한다.
// 고객 정보를 다루지 않으며 외부로 보내는 요청도 없다.
import {memberService, authURL} from './member-access.js';
import {el} from './consultation-ui.js';

const TABS = [['all', '전체'], ['favorite', '즐겨찾기'], ['생명', '생명'], ['손해', '손해'], ['공제', '공제']];
const TELS = [['tel_customer', '고객센터'], ['tel_incall', '인콜 모니터링'], ['tel_it_help', '전산 헬프'], ['fax_claim', '청구 팩스']];
const LINKS = [['terms_url', '약관'], ['claim_form_url', '청구서']];

const asOf = value => {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'})
    .formatToParts(new Date(value));
  const pick = type => parts.find(p => p.type === type)?.value || '';
  return `${pick('year')}.${pick('month')}.${pick('day')} 기준`;
};

function anchor(parent, text, href, className) {
  const node = el(href ? 'a' : 'span', text, parent);
  node.className = className + (href ? '' : ' is-empty');
  if (href) { node.href = href; if (/^https:/.test(href)) { node.target = '_blank'; node.rel = 'noopener noreferrer'; } }
  else { node.setAttribute('aria-disabled', 'true'); node.title = '등록된 주소가 없습니다.'; }
  return node;
}

export function renderInsurerContacts({host, contacts, onFavorite}) {
  let tab = 'all', search = '';
  const tools = el('div', undefined, host);
  tools.className = 'insurer-tools';
  const tabs = el('div', undefined, tools);
  tabs.className = 'insurer-tabs';
  tabs.setAttribute('role', 'tablist');
  const searchLabel = el('label', '이름 검색', tools);
  searchLabel.className = 'field insurer-search';
  const searchInput = el('input', undefined, searchLabel);
  searchInput.type = 'search';
  searchInput.placeholder = '삼성생명';
  searchInput.oninput = () => { search = searchInput.value.trim(); draw(); };
  const grid = el('div', undefined, host);
  grid.className = 'insurer-grid';
  const empty = el('p', undefined, host);
  empty.className = 'insurer-empty';

  const buttons = TABS.map(([value, label]) => {
    const button = el('button', label, tabs);
    button.type = 'button';
    button.className = 'insurer-tab';
    button.setAttribute('role', 'tab');
    button.onclick = () => { tab = value; draw(); };
    button.dataset.tab = value;
    return button;
  });

  function card(contact) {
    const box = el('article', undefined, grid);
    box.className = 'insurer-card';
    box.dataset.insurerCard = contact.id;
    const head = el('div', undefined, box);
    head.className = 'insurer-card-head';
    const title = el('div', undefined, head);
    el('h2', contact.name, title);
    const badge = el('span', contact.category, title);
    badge.className = 'insurer-badge';
    badge.dataset.category = contact.category;
    const star = el('button', contact.favorite ? '★' : '☆', head);
    star.type = 'button';
    star.className = 'insurer-star';
    star.setAttribute('aria-pressed', String(!!contact.favorite));
    star.setAttribute('aria-label', contact.name + (contact.favorite ? ' 즐겨찾기 해제' : ' 즐겨찾기'));
    star.onclick = async () => {
      if (star.disabled) return;
      star.disabled = true;
      try { await onFavorite(contact, !contact.favorite); } finally { star.disabled = false; }
    };

    anchor(box, '전산 접속', contact.portal_url, 'btn insurer-portal');
    const small = el('div', undefined, box);
    small.className = 'insurer-links';
    for (const [key, label] of LINKS) anchor(small, label, contact[key], 'btn ghost insurer-link');

    const list = el('dl', undefined, box);
    list.className = 'insurer-tels';
    for (const [key, label] of TELS) {
      el('dt', label, list);
      const value = el('dd', undefined, list);
      if (contact[key]) {
        if(key==='fax_claim'){const copy=el('button',contact[key]+' 복사',value);copy.type='button';copy.className='text-button';const status=el('span','',value);status.setAttribute('role','status');copy.onclick=async()=>{try{await navigator.clipboard.writeText(contact[key]);status.textContent=' 복사했어요';}catch{status.textContent=' 복사하지 못했어요. 번호를 길게 눌러 복사해 주세요.';}};}else{const link = el('a', contact[key], value);link.href = 'tel:' + contact[key].replace(/-/g, '');}
      } else { el('span', '정보 없음', value).className = 'insurer-none'; }
    }
    if (contact.homepage_url) anchor(box, '홈페이지 →', contact.homepage_url, 'insurer-home');
    el('p', asOf(contact.updated_at), box).className = 'insurer-asof';
  }

  function draw() {
    for (const button of buttons) button.setAttribute('aria-selected', String(button.dataset.tab === tab));
    grid.replaceChildren();
    const shown = contacts.filter(c => (tab === 'all' || (tab === 'favorite' ? c.favorite : c.category === tab))
      && (!search || c.name.includes(search)));
    for (const contact of shown) card(contact);
    empty.textContent = shown.length ? ''
      : tab === 'favorite' ? '즐겨찾기한 보험사가 없습니다. 카드의 별을 눌러 자주 쓰는 곳을 모아 두세요.'
      : search ? '검색과 맞는 보험사가 없습니다.' : '등록된 보험사가 없습니다.';
  }

  draw();
  return {refresh(next) { contacts = next; draw(); }};
}

async function start() {
  const host = document.getElementById('insurerContent');
  if (!host) return;
  const blocked = (text, link, href) => {
    host.replaceChildren();
    el('p', text, host);
    if (link) { const a = el('a', link, host); a.href = href; a.className = 'btn ghost'; }
  };
  try {
    const {client} = await memberService();
    // 로그인하지 않은 상태는 오류가 아니다. getUser 는 세션이 없으면 오류를 던지므로 세션부터 본다.
    const {data: sessionData} = await client.auth.getSession();
    if (!sessionData?.session?.user) return blocked('로그인 후 보험사 연락처를 확인할 수 있습니다.', '전문가 로그인',
      authURL('/insurer-contacts.html', 'login'));

    const command = async (operation, payload = {}) => {
      const {data: result, error: failure} = await client.rpc('insurer_contacts_command', {operation, payload});
      if (failure) throw failure;
      return result;
    };
    const first = await command('list');
    host.replaceChildren();
    const view = renderInsurerContacts({
      host, contacts: first.contacts || [],
      onFavorite: async (contact, on) => {
        try { view.refresh((await command('favorite', {id: contact.id, on})).contacts || []); }
        catch { notice.textContent = '즐겨찾기를 저장하지 못했습니다. 잠시 후 다시 눌러 주세요.'; }
      },
    });
    const notice = el('p', '', host);
    notice.setAttribute('role', 'status');
    notice.className = 'insurer-notice';
  } catch (e) {
    if (e.message === 'insurer_access_required')
      return blocked('승인된 전문가만 볼 수 있는 자료입니다. 전문가 등록과 승인 상태를 확인해 주세요.', '전문가 화면', '/partner.html');
    if (['42883', 'PGRST202'].includes(e.code))
      return blocked('보험사 연락처를 준비하고 있습니다. 잠시 후 다시 방문해 주세요.');
    blocked('보험사 연락처를 불러오지 못했습니다. 연결 상태를 확인하고 새로고침해 주세요.');
  }
}
start();
