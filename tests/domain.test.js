const assert = require("node:assert/strict");
const D = require("../src/domain.js");
globalThis.GymDomain = D;
const { createGymDemoState } = require("../src/data.js");

const NOW = "2026-11-16T08:30:00+05:30";

function freshState() {
  return createGymDemoState();
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("valid QR check-in records attendance", () => {
  const state = freshState();
  const result = D.checkInMember(state, "member-16", NOW, "qr");
  assert.equal(result.ok, true);
  assert.equal(D.hasCheckedInToday(state, "member-16", NOW), true);
});

test("duplicate QR scan is blocked", () => {
  const state = freshState();
  const result = D.checkInMember(state, "member-1", NOW, "qr");
  assert.equal(result.ok, false);
  assert.match(result.reason, /Already checked in/);
});

test("expired and paused memberships cannot check in", () => {
  const state = freshState();
  assert.equal(D.checkInMember(state, "member-22", NOW, "qr").ok, false);
  assert.equal(D.checkInMember(state, "member-12", NOW, "qr").ok, false);
});

test("member returning after inactivity resolves no-show case", () => {
  const state = freshState();
  const openCase = state.noShowCases.find((item) => item.memberId === "member-3");
  assert.equal(openCase.status, "open");
  const result = D.checkInMember(state, "member-3", NOW, "staff-assisted");
  assert.equal(result.ok, true);
  assert.equal(openCase.status, "resolved");
});

test("verified renewal payment extends membership", () => {
  const state = freshState();
  const beforeCount = state.memberships.length;
  const orderResult = D.createRenewalOrder(state, "member-4", "plan-quarterly", NOW);
  assert.equal(orderResult.ok, true);
  const paid = D.verifyPayment(state, orderResult.payment.id, NOW);
  assert.equal(paid.ok, true);
  assert.equal(state.memberships.length, beforeCount + 1);
  assert.equal(orderResult.order.status, "paid");
  assert.ok(paid.payment.receiptNo);
});

test("duplicate payment confirmation is rejected", () => {
  const state = freshState();
  const orderResult = D.createRenewalOrder(state, "member-4", "plan-monthly", NOW);
  assert.equal(D.verifyPayment(state, orderResult.payment.id, NOW).ok, true);
  const second = D.verifyPayment(state, orderResult.payment.id, NOW);
  assert.equal(second.ok, false);
  assert.match(second.reason, /already verified/);
});

test("failed payment does not extend membership", () => {
  const state = freshState();
  const beforeCount = state.memberships.length;
  const orderResult = D.createRenewalOrder(state, "member-4", "plan-monthly", NOW);
  const failed = D.failPayment(state, orderResult.payment.id, NOW);
  assert.equal(failed.ok, true);
  assert.equal(state.memberships.length, beforeCount);
});

test("out-of-stock supplements and unavailable trainers are blocked", () => {
  const state = freshState();
  assert.equal(D.purchaseAddOn(state, "member-1", "addon-supp-2", NOW).ok, false);
  assert.equal(D.purchaseAddOn(state, "member-1", "addon-pt-2", NOW).ok, false);
});

test("notification opt-out suppresses renewal reminders", () => {
  const state = freshState();
  const due = D.remindersDue(state, NOW);
  assert.equal(due.some((item) => item.memberId === "member-22"), false);
  assert.equal(due.some((item) => item.memberId === "member-28"), false);
});

test("scan excludes frozen, paused, expired and cancelled memberships", () => {
  const state = freshState();
  D.scanNoShows(state, NOW);
  const caseMemberIds = new Set(state.noShowCases.map((item) => item.memberId));
  assert.equal(caseMemberIds.has("member-12"), false);
  assert.equal(caseMemberIds.has("member-18"), false);
  assert.equal(caseMemberIds.has("member-22"), false);
  assert.equal(caseMemberIds.has("member-27"), false);
});
