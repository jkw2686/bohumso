import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';

// ROADMAP §1 문구 규칙과 3-3 상태 한글화를 화면·상수 파일에서 자동 검사한다.
// 검사 대상은 사용자에게 보이는 문구를 담는 곳: public 의 화면·스크립트와 src 의 렌더링 모듈.
const SKIP_DIRS = new Set(['vendor', 'policy-archive', 'assets', 'brand', 'test-flow']);
const SKIP_FILES = new Set(['claim-resources-data.js', 'coverage-data.js']);

async function collect(dir, out = []) {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) await collect(path.join(dir, entry.name), out); continue; }
    if (!/\.(html|js|mjs)$/.test(entry.name) || SKIP_FILES.has(entry.name)) continue;
    out.push(path.join(dir, entry.name));
  }
  return out;
}

const files = [...await collect('public'), ...await collect('src')];

// 한국어 문구 안에서만 찾는다. 코드 식별자나 영문 주석에 걸리지 않게 한글을 함께 요구한다.
const TIME_PROMISES = [
  /\d+\s*시간\s*(안|내)에\s*(답|안내|연락|회신)/,
  /\d+\s*분\s*(안|내)에\s*(답|안내|연락|회신)/,
  /당일\s*(답|안내|연락|회신)/,
  /영업일\s*기준/,
  /(곧|빠르게|신속히|즉시)\s*(답변|안내|연락|회신)(드|해)/,
];

test('답변 시간·기한을 약속하는 문구가 없다', async () => {
  const hits = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const line of text.split('\n')) {
      for (const rule of TIME_PROMISES) if (rule.test(line)) hits.push(`${file}: ${line.trim().slice(0, 120)}`);
    }
  }
  assert.deepEqual(hits, [], '시간 약속 문구:\n' + hits.join('\n'));
});

// 3-3: 문의 상태를 화면에 영문 그대로 내보내지 않는다. 값 비교·RPC 인자는 괜찮고,
// 문자열을 그대로 textContent 로 흘리는 꼴만 잡는다.
test('문의 상태를 영문 그대로 화면에 쓰지 않는다', async () => {
  const hits = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const line of text.split('\n')) {
      // textContent/innerText 에 상태 값을 직접 붙이는 경우
      if (/(textContent|innerText)\s*=[^\n]*\b(RECEIVED|IN_PROGRESS|COMPLETED|DECLINED)\b/.test(line))
        hits.push(`${file}: ${line.trim().slice(0, 120)}`);
      // el('p', ... + row.status + ...) 처럼 상태를 라벨 없이 이어 붙이는 경우
      if (/\+\s*(row|r)\.status\b/.test(line)) hits.push(`${file}: ${line.trim().slice(0, 120)}`);
    }
  }
  assert.deepEqual(hits, [], '영문 상태 노출:\n' + hits.join('\n'));
});

test('상태 라벨은 support-status 한 곳에서만 정의한다', async () => {
  const shared = await readFile('src/support-status.js', 'utf8');
  for (const [key, label] of [['RECEIVED', '접수'], ['IN_PROGRESS', '처리 중'], ['COMPLETED', '완료'], ['DECLINED', '처리 불가']])
    assert.ok(shared.includes(`${key}:'${label}'`), `${key} → ${label}`);
  const others = [];
  for (const file of files) {
    if (file.endsWith('support-status.js')) continue;
    const text = await readFile(file, 'utf8');
    if (/IN_PROGRESS\s*:\s*['"]/.test(text)) others.push(file);
  }
  assert.deepEqual(others, [], '상태 라벨을 따로 정의한 파일:\n' + others.join('\n'));
});

test('문의 접수 문구는 지정된 문장을 쓴다', async () => {
  const text = await readFile('src/member-rights.js', 'utf8');
  assert.ok(text.includes('문의가 접수됐어요. 내용을 검토한 뒤 답변드릴게요.'), '접수 문구');
  assert.ok(text.includes('답변은 아래 문의 내역에서 확인하실 수 있어요.'), '문의 내역 안내');
  assert.ok(text.includes('검토 후 문의 내역으로 알려드릴게요'), '탈퇴 문구');
  assert.ok(!text.includes('처리 결과는 운영자가 안내합니다'), '옛 접수 문구 제거');
  assert.ok(!text.includes('자료 삭제 처리 결과는 운영자가 안내합니다'), '옛 탈퇴 문구 제거');
});

test('문의 이메일은 설정값 한 곳에서만 쓴다', async () => {
  const hits = [];
  for (const file of files) {
    if (file.endsWith('company-info.js')) continue;
    const text = await readFile(file, 'utf8');
    if (/mailto:[^'"\s)]*@/.test(text)) hits.push(file);
  }
  assert.deepEqual(hits, [], '이메일 주소를 직접 적은 파일:\n' + hits.join('\n'));
});
