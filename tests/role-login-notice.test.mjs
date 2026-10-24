import test from 'node:test';
import assert from 'node:assert/strict';
import {roleMismatch} from '../src/role-routing.js';

// 실제 계정을 쓰지 않고 4가지 조합 + 관리자 조합을 확인한다.
const customer = {member: true, state: 'MEMBER'};
const expert = {member: true, partner_status: 'approved'};
const adminOnly = {member: true, admin: true, state: 'ADMIN'};
const adminExpert = {member: true, admin: true, partner_status: 'approved'};

test('일반 계정 + 일반회원 로그인: 안내 없이 기존 이동', () => {
  assert.equal(roleMismatch('customer', customer), '');
});

test('전문가 계정 + 전문가 로그인: 안내 없이 기존 이동', () => {
  assert.equal(roleMismatch('expert', expert), '');
});

test('전문가 계정 + 일반회원 로그인: 전문가 안내', () => {
  assert.equal(roleMismatch('customer', expert), 'expert_account');
});

test('일반 계정 + 전문가 로그인: 일반회원 안내', () => {
  assert.equal(roleMismatch('expert', customer), 'customer_account');
});

test('관리자(전문가 아님)는 전문가 로그인으로 들어와도 안내 없이 기존 이동', () => {
  assert.equal(roleMismatch('expert', adminOnly), '');
  assert.equal(roleMismatch('customer', adminOnly), '');
});

test('관리자이면서 전문가면 전문가 규칙을 그대로 따른다', () => {
  assert.equal(roleMismatch('customer', adminExpert), 'expert_account');
  assert.equal(roleMismatch('expert', adminExpert), '');
});

test('as 값이 없으면(상담 요청 중 로그인 등) 지금과 똑같이 바로 이동', () => {
  for (const m of [customer, expert, adminOnly, adminExpert]) {
    assert.equal(roleMismatch('', m), '');
    assert.equal(roleMismatch(null, m), '');
    assert.equal(roleMismatch(undefined, m), '');
  }
});

test('알 수 없는 as 값은 무시한다', () => {
  assert.equal(roleMismatch('admin', expert), '');
  assert.equal(roleMismatch('EXPERT', customer), '');
});
