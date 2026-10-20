// 관리자 전용 보험사 연락처 운영. 읽기·쓰기는 모두 insurer_contacts_command 를 거친다.
// 소비자 화면과 공유하는 데이터가 없고, 고객정보도 다루지 않는다.
import {el, kst} from './consultation-ui.js';

const CATEGORIES = ['생명', '손해', '공제'];
const URL_FIELDS = [['homepage_url', '홈페이지'], ['portal_url', '전산 접속'], ['terms_url', '약관'], ['claim_form_url', '청구서']];
const TEL_FIELDS = [['tel_customer', '고객센터'], ['tel_incall', '인콜 모니터링'], ['tel_it_help', '전산 헬프'], ['fax_claim', '청구 팩스']];
const COLUMNS = ['name', 'category', ...URL_FIELDS.map(f => f[0]), ...TEL_FIELDS.map(f => f[0]), 'sort_order', 'is_active', 'verified', 'memo'];
const ERRORS = {admin_required: '관리자만 바꿀 수 있습니다.', insurer_access_required: '이 자료를 볼 권한이 없습니다.',
  insurer_not_found: '이미 지워졌거나 찾을 수 없는 보험사입니다.', invalid_import: '한 번에 500개까지만 올릴 수 있습니다.',
  invalid_operation: '처리하지 못했습니다.'};

function message(error) {
  const code = String(error?.message || '');
  if (ERRORS[code]) return ERRORS[code];
  if (/insurer_contacts_(name|category|tel|homepage|portal|terms|claim|fax|sort)/.test(code) || /check constraint/.test(code))
    return '입력 형식을 확인해 주세요. 주소는 https 로 시작하고 전화번호는 숫자와 하이픈만 넣을 수 있습니다.';
  if (/duplicate key/.test(code)) return '같은 이름의 보험사가 이미 있습니다.';
  return '처리하지 못했습니다. 입력과 연결 상태를 확인해 주세요.';
}

// 헤더가 DB 컬럼명인 CSV 를 읽는다. 따옴표 안의 쉼표·줄바꿈을 지킨다.
export function parseCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  const source = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(value); value = ''; }
    else if (c === '\n') { row.push(value); rows.push(row); row = []; value = ''; }
    else value += c;
  }
  if (value !== '' || row.length) { row.push(value); rows.push(row); }
  const header = (rows.shift() || []).map(h => h.trim());
  const known = header.map(h => COLUMNS.includes(h) ? h : null);
  return rows.filter(r => r.some(cell => cell.trim())).map(r => {
    const item = {};
    known.forEach((key, index) => {
      if (!key) return;
      const raw = (r[index] ?? '').trim();
      if (raw === '') return;
      if (key === 'sort_order') item[key] = Number(raw);
      else if (key === 'is_active' || key === 'verified') item[key] = /^(true|1|y|yes)$/i.test(raw);
      else item[key] = raw;
    });
    return item;
  }).filter(item => item.name);
}

export async function mountInsurerAdmin({client, host}) {
  const card = el('section', undefined, host);
  card.className = 'card';
  card.dataset.insurerAdmin = '';
  el('h2', '보험사 연락처', card);
  const note = el('p', '보험사 연락처를 불러오고 있습니다.', card);
  note.setAttribute('role', 'status');
  const tools = el('div', undefined, card);
  tools.className = 'admin-toolbar';
  const body = el('div', undefined, card);
  let contacts = [], filter = '', search = '';

  const command = async (operation, payload = {}) => {
    const {data, error} = await client.rpc('insurer_contacts_command', {operation, payload});
    if (error) throw error;
    contacts = data.contacts || [];
    return data;
  };
  const run = async (fn, done) => {
    try { await fn(); note.textContent = done; render(); }
    catch (e) { note.textContent = message(e); }
  };

  // 도구 모음: 구분 필터 · 이름 검색 · 새 보험사
  const filterLabel = el('label', '구분', tools);
  filterLabel.className = 'field';
  const filterSelect = el('select', undefined, filterLabel);
  for (const [value, text] of [['', '전체'], ...CATEGORIES.map(c => [c, c])]) {
    const option = el('option', text, filterSelect);
    option.value = value;
  }
  filterSelect.onchange = () => { filter = filterSelect.value; render(); };
  const searchLabel = el('label', '이름 검색', tools);
  searchLabel.className = 'field';
  const searchInput = el('input', undefined, searchLabel);
  searchInput.type = 'search';
  searchInput.placeholder = '삼성생명';
  searchInput.oninput = () => { search = searchInput.value.trim(); render(); };
  const add = el('button', '새 보험사', tools);
  add.type = 'button';
  add.className = 'btn';
  add.onclick = () => openForm(null);

  function badges(contact, parent) {
    const line = el('p', undefined, parent);
    line.className = 'review-meta';
    line.textContent = [contact.category, contact.verified ? '검증완료' : '검증 전',
      contact.is_active ? '노출 중' : '숨김', '순서 ' + contact.sort_order,
      contact.updated_at ? kst(contact.updated_at) + ' 기준' : ''].filter(Boolean).join(' · ');
  }

  function openForm(contact) {
    const dialog = el('dialog', undefined, document.body);
    dialog.className = 'card insurer-form';
    el('h3', contact ? contact.name + ' 수정' : '새 보험사 등록', dialog);
    const form = el('form', undefined, dialog);
    const status = el('p', undefined, form);
    status.setAttribute('role', 'alert');
    const fields = {};
    const field = (key, label, setup) => {
      const wrap = el('label', label, form);
      wrap.className = 'field';
      const input = el(key === 'memo' ? 'textarea' : key === 'category' ? 'select' : 'input', undefined, wrap);
      setup?.(input);
      input.value = contact?.[key] ?? (key === 'sort_order' ? 100 : key === 'category' ? CATEGORIES[0] : '');
      fields[key] = input;
      return input;
    };
    field('name', '보험사 이름', i => { i.required = true; i.maxLength = 60; });
    field('category', '구분', i => { for (const c of CATEGORIES) { const o = el('option', c, i); o.value = c; } });
    for (const [key, label] of URL_FIELDS) field(key, label + ' 주소', i => {
      i.type = 'url'; i.placeholder = 'https://'; i.pattern = 'https://.+';
      i.title = 'https:// 로 시작하는 주소만 넣을 수 있습니다.';
    });
    for (const [key, label] of TEL_FIELDS) field(key, label, i => {
      i.inputMode = 'tel'; i.pattern = '[0-9-]{3,20}'; i.placeholder = '1588-0000';
      i.title = '숫자와 하이픈만 넣을 수 있습니다.';
    });
    field('sort_order', '정렬 순서(작을수록 먼저)', i => { i.type = 'number'; i.min = 0; i.max = 100000; i.required = true; });
    const flags = el('div', undefined, form);
    const toggle = (key, label) => {
      const wrap = el('label', label, flags);
      wrap.className = 'consent-row';
      const input = el('input', undefined, wrap);
      input.type = 'checkbox';
      input.checked = key === 'is_active' ? contact?.is_active ?? true : !!contact?.[key];
      fields[key] = input;
    };
    toggle('is_active', '지도·목록에 노출');
    toggle('verified', '검증 완료');
    field('memo', '관리자 메모(전문가에게 보이지 않음)', i => { i.maxLength = 1000; i.rows = 2; });

    const save = el('button', '저장', form);
    save.type = 'submit';
    save.className = 'btn';
    const close = el('button', '닫기', form);
    close.type = 'button';
    close.className = 'btn ghost';
    close.onclick = () => { dialog.close(); dialog.remove(); };
    dialog.addEventListener('cancel', () => dialog.remove());

    form.onsubmit = async event => {
      event.preventDefault();
      if (save.disabled) return;
      save.disabled = true;
      const payload = {id: contact?.id};
      for (const key of COLUMNS) {
        const input = fields[key];
        payload[key] = input.type === 'checkbox' ? input.checked : input.value.trim();
      }
      payload.sort_order = Number(payload.sort_order);
      try {
        await command('save', payload);
        dialog.close(); dialog.remove();
        note.textContent = (contact ? '수정' : '등록') + '했습니다.';
        render();
      } catch (e) { status.textContent = message(e); save.disabled = false; }
    };
    dialog.showModal();
    fields.name.focus();
  }

  function importBox() {
    const box = el('details', undefined, body);
    el('summary', 'CSV 일괄 등록', box);
    el('p', '머리글은 DB 컬럼명과 같아야 합니다: ' + COLUMNS.join(', '), box).className = 'review-meta';
    const file = el('input', undefined, el('label', 'CSV 파일', box));
    file.type = 'file';
    file.accept = '.csv,text/csv';
    const overwriteWrap = el('label', '이름이 같으면 덮어쓰기', box);
    overwriteWrap.className = 'consent-row';
    const overwrite = el('input', undefined, overwriteWrap);
    overwrite.type = 'checkbox';
    const result = el('p', undefined, box);
    result.setAttribute('role', 'status');
    const upload = el('button', '올리기', box);
    upload.type = 'button';
    upload.className = 'btn';
    upload.onclick = async () => {
      const chosen = file.files?.[0];
      if (!chosen) { result.textContent = 'CSV 파일을 선택해 주세요.'; return; }
      upload.disabled = true;
      try {
        const rows = parseCsv(await chosen.text());
        if (!rows.length) { result.textContent = '읽을 수 있는 줄이 없습니다. 머리글을 확인해 주세요.'; return; }
        if (!confirm(rows.length + '개 보험사를 올립니다. 이름이 같은 자료는 '
          + (overwrite.checked ? '덮어씁니다' : '건너뜁니다') + '. 계속할까요?')) return;
        const done = await command('import', {rows, overwrite: overwrite.checked});
        result.textContent = `${done.written}개 반영, ${done.skipped}개 건너뜀.`;
        render();
      } catch (e) { result.textContent = message(e); }
      finally { upload.disabled = false; }
    };
    return box;
  }

  function render() {
    body.replaceChildren();
    const shown = contacts.filter(c => (!filter || c.category === filter)
      && (!search || c.name.includes(search)));
    el('p', `전체 ${contacts.length}개 · 보이는 항목 ${shown.length}개`, body).className = 'review-meta';
    if (!shown.length) el('p', contacts.length ? '조건에 맞는 보험사가 없습니다.' : '등록된 보험사가 없습니다. CSV로 한 번에 올릴 수 있습니다.', body);
    for (const contact of shown) {
      const row = el('div', undefined, body);
      row.className = 'management-task-row';
      row.dataset.insurerRow = contact.id;
      const text = el('div', undefined, row);
      el('strong', contact.name, text);
      badges(contact, text);
      if (contact.memo) el('p', contact.memo, text).className = 'review-meta';
      const actions = el('div', undefined, row);
      const edit = el('button', '수정', actions);
      edit.type = 'button'; edit.className = 'btn ghost';
      edit.onclick = () => openForm(contact);
      const visibility = el('button', contact.is_active ? '숨기기' : '노출하기', actions);
      visibility.type = 'button'; visibility.className = 'btn ghost';
      visibility.onclick = () => run(() => command('set_active', {id: contact.id, is_active: !contact.is_active}),
        contact.is_active ? '숨겼습니다.' : '노출했습니다.');
      const remove = el('button', '삭제', actions);
      remove.type = 'button'; remove.className = 'btn ghost';
      remove.onclick = () => {
        if (!confirm(contact.name + ' 연락처를 지웁니다. 되돌릴 수 없습니다. 계속할까요?')) return;
        return run(() => command('delete', {id: contact.id}), '삭제했습니다.');
      };
    }
    importBox();
  }

  try { await command('list'); note.textContent = ''; render(); }
  catch (e) {
    if (['PGRST202', '42883'].includes(e.code)) { card.remove(); return; }
    note.textContent = message(e);
  }
}
