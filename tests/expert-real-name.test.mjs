import test from 'node:test';
import assert from 'node:assert/strict';
import {validRealName, NAME_RULE_HINT} from '../src/expert-shared.js';

// 3-5 실명 규칙. 대표 확정 2026-10-11: 한글 2~4자·공백 없음 / 영문 2~40자·공백 허용.
const ALLOW = ['홍길동', '김가상', '남궁민수', '이도', 'Kim Minsu', 'Lee', "O'Brien", 'Smith-Jones',
  'A'.repeat(40)];
const REJECT = ['', ' ', '김', '남궁민수철', '홍 길동', '홍길동123', 'ABC보험', '설계사 홍길동',
  '김보험', '박팀장', '이지점장', '최본부장', 'john fc', 'GA 김철수', 'Kim@Lee', 'Kim--Lee',
  'Kim  Minsu', 'A'.repeat(41), '홍길동!', '１２３'];

test('허용되는 실명', () => {
  for (const name of ALLOW) assert.equal(validRealName(name), true, `허용이어야 함: ${JSON.stringify(name)}`);
});

test('거부되는 실명 — 닉네임·회사명·직함·숫자·특수문자', () => {
  for (const name of REJECT) assert.equal(validRealName(name), false, `거부여야 함: ${JSON.stringify(name)}`);
});

test('앞뒤 공백은 다듬어 판정한다', () => {
  assert.equal(validRealName('  홍길동  '), true);
  assert.equal(validRealName('  Kim Minsu  '), true);
});

test('안내 문구에 닉네임·회사명·직함 금지가 들어 있다', () => {
  for (const word of ['닉네임', '회사명', '직함']) assert.ok(NAME_RULE_HINT.includes(word), word);
});

test('null·undefined·숫자를 넣어도 던지지 않는다', () => {
  for (const value of [null, undefined, 0, 12345, {}, []]) assert.equal(validRealName(value), false);
});
