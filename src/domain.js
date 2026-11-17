(function (root) {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const ACTIVE_MEMBERSHIP_STATUSES = ["active"];
  const CLOSED_CASE_STATUSES = ["resolved", "cancelled"];

  function parseDate(value) {
    return value instanceof Date ? value : new Date(value);
  }

  function dateKey(value) {
    return parseDate(value).toISOString().slice(0, 10);
  }

  function addDays(value, days) {
    const date = parseDate(value);
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function daysBetween(from, to) {
    const start = new Date(dateKey(from));
    const end = new Date(dateKey(to));
    return Math.floor((end - start) / DAY_MS);
  }

  function formatINR(amount) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function findCurrentMembership(state, memberId) {
    const memberships = state.memberships
      .filter((membership) => membership.memberId === memberId)
      .sort((a, b) => parseDate(b.endDate) - parseDate(a.endDate));
    return memberships[0] || null;
  }

  function getMemberStatus(state, memberId, now) {
    const membership = findCurrentMembership(state, memberId);
    if (!membership) return { status: "none", membership: null, canCheckIn: false };

    const today = dateKey(now);
    const expired = dateKey(membership.endDate) < today;
    const canCheckIn = membership.status === "active" && !expired;
    const status = expired ? "expired" : membership.status;
    return { status, membership, canCheckIn };
  }

  function hasCheckedInToday(state, memberId, now) {
    const today = dateKey(now);
    return state.attendance.some((visit) => visit.memberId === memberId && dateKey(visit.checkedInAt) === today);
  }

  function getMemberVisits(state, memberId) {
    return state.attendance
      .filter((visit) => visit.memberId === memberId)
      .sort((a, b) => parseDate(b.checkedInAt) - parseDate(a.checkedInAt));
  }

  function getLastVisit(state, memberId) {
    return getMemberVisits(state, memberId)[0] || null;
  }

  function calculateStreak(state, memberId, now) {
    const visitDays = new Set(getMemberVisits(state, memberId).map((visit) => dateKey(visit.checkedInAt)));
    let streak = 0;
    let cursor = new Date(dateKey(now));
    while (visitDays.has(dateKey(cursor))) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function checkInMember(state, memberId, now, source) {
    const member = state.members.find((item) => item.id === memberId);
    if (!member) return { ok: false, reason: "Member not found" };

    const memberStatus = getMemberStatus(state, memberId, now);
    if (!memberStatus.canCheckIn) {
      return { ok: false, reason: `Membership is ${memberStatus.status}` };
    }

    if (hasCheckedInToday(state, memberId, now)) {
      return { ok: false, reason: "Already checked in today" };
    }

    const visit = {
      id: `att-${state.attendance.length + 1}`,
      memberId,
      checkedInAt: parseDate(now).toISOString(),
      source: source || "qr",
    };
    state.attendance.push(visit);

    const openCase = state.noShowCases.find(
      (item) => item.memberId === memberId && !CLOSED_CASE_STATUSES.includes(item.status)
    );
    if (openCase) {
      openCase.status = "resolved";
      openCase.resolvedAt = parseDate(now).toISOString();
      openCase.resolution = "Member returned";
      state.auditLogs.push(makeAudit("no_show_resolved", memberId, `Resolved after ${member.name} checked in`));
    }

    state.streaks[memberId] = calculateStreak(state, memberId, now);
    state.auditLogs.push(makeAudit("attendance_check_in", memberId, `${member.name} checked in via ${visit.source}`));
    return { ok: true, visit };
  }

  function eligibleForNoShow(state, memberId, now) {
    const status = getMemberStatus(state, memberId, now);
    if (!status.membership || !status.canCheckIn) return false;
    return ACTIVE_MEMBERSHIP_STATUSES.includes(status.membership.status);
  }

  function scanNoShows(state, now) {
    const created = [];
    state.members.forEach((member) => {
      if (!eligibleForNoShow(state, member.id, now)) return;

      const lastVisit = getLastVisit(state, member.id);
      const absentDays = lastVisit ? daysBetween(lastVisit.checkedInAt, now) : 999;
      if (absentDays < state.settings.noShowThresholdDays) return;

      const existing = state.noShowCases.find(
        (item) => item.memberId === member.id && !CLOSED_CASE_STATUSES.includes(item.status)
      );
      if (existing) {
        existing.absentDays = absentDays;
        existing.lastVisitDate = lastVisit ? dateKey(lastVisit.checkedInAt) : null;
        return;
      }

      const membership = findCurrentMembership(state, member.id);
      const noShowCase = {
        id: `case-${state.noShowCases.length + 1}`,
        memberId: member.id,
        status: "open",
        createdAt: parseDate(now).toISOString(),
        lastVisitDate: lastVisit ? dateKey(lastVisit.checkedInAt) : null,
        absentDays,
        membershipId: membership.id,
        assignedTrainerId: member.trainerId,
        nextFollowUpAt: dateKey(addDays(now, 1)),
      };
      state.noShowCases.push(noShowCase);
      created.push(noShowCase);
    });
    return created;
  }

  function addFollowUp(state, caseId, outcome, notes, nextFollowUpAt, now) {
    const noShowCase = state.noShowCases.find((item) => item.id === caseId);
    if (!noShowCase) return { ok: false, reason: "No-show case not found" };
    const followUp = {
      id: `fu-${state.followUps.length + 1}`,
      caseId,
      memberId: noShowCase.memberId,
      outcome,
      notes,
      nextFollowUpAt,
      createdAt: parseDate(now).toISOString(),
    };
    state.followUps.push(followUp);
    noShowCase.lastOutcome = outcome;
    noShowCase.lastNotes = notes;
    noShowCase.nextFollowUpAt = nextFollowUpAt;
    if (outcome === "Cancelled") noShowCase.status = "cancelled";
    state.auditLogs.push(makeAudit("follow_up_added", noShowCase.memberId, `${outcome}: ${notes}`));
    return { ok: true, followUp };
  }

  function createRenewalOrder(state, memberId, planId, now) {
    const plan = state.plans.find((item) => item.id === planId);
    const member = state.members.find((item) => item.id === memberId);
    if (!plan || !member) return { ok: false, reason: "Plan or member not found" };
    const discountAmount = Math.round(plan.price * (plan.discountPercent / 100));
    const payableAmount = plan.price - discountAmount;
    const order = {
      id: `ren-${state.renewalOrders.length + 1}`,
      memberId,
      planId,
      status: "created",
      baseAmount: plan.price,
      discountAmount,
      payableAmount,
      createdAt: parseDate(now).toISOString(),
    };
    state.renewalOrders.push(order);
    const payment = createPayment(state, memberId, "renewal", order.id, payableAmount, now);
    order.paymentId = payment.id;
    return { ok: true, order, payment };
  }

  function createPayment(state, memberId, purpose, referenceId, amount, now) {
    const payment = {
      id: `pay-${state.payments.length + 1}`,
      memberId,
      purpose,
      referenceId,
      amount,
      status: "created",
      provider: "simulated",
      createdAt: parseDate(now).toISOString(),
      verifiedAt: null,
      receiptNo: null,
    };
    state.payments.push(payment);
    return payment;
  }

  function markPaymentPending(state, paymentId) {
    const payment = state.payments.find((item) => item.id === paymentId);
    if (!payment) return { ok: false, reason: "Payment not found" };
    if (payment.status !== "created") return { ok: false, reason: `Payment is already ${payment.status}` };
    payment.status = "pending";
    return { ok: true, payment };
  }

  function failPayment(state, paymentId, now) {
    const payment = state.payments.find((item) => item.id === paymentId);
    if (!payment) return { ok: false, reason: "Payment not found" };
    if (payment.status === "paid") return { ok: false, reason: "Verified payment cannot be failed" };
    payment.status = "failed";
    payment.failedAt = parseDate(now).toISOString();
    return { ok: true, payment };
  }

  function verifyPayment(state, paymentId, now) {
    const payment = state.payments.find((item) => item.id === paymentId);
    if (!payment) return { ok: false, reason: "Payment not found" };
    if (payment.status === "paid") return { ok: false, reason: "Payment already verified" };
    if (["refunded", "reversed"].includes(payment.status)) return { ok: false, reason: `Payment is ${payment.status}` };

    payment.status = "paid";
    payment.verifiedAt = parseDate(now).toISOString();
    payment.receiptNo = `RCP-${dateKey(now).replaceAll("-", "")}-${String(state.payments.indexOf(payment) + 1).padStart(4, "0")}`;

    if (payment.purpose === "renewal") {
      activateRenewal(state, payment.referenceId, now);
    }

    if (payment.purpose === "addon") {
      const order = state.addOnOrders.find((item) => item.id === payment.referenceId);
      if (order) order.status = "paid";
    }

    state.auditLogs.push(makeAudit("payment_verified", payment.memberId, `${payment.receiptNo} for ${formatINR(payment.amount)}`));
    return { ok: true, payment };
  }

  function activateRenewal(state, orderId, now) {
    const order = state.renewalOrders.find((item) => item.id === orderId);
    if (!order || order.status === "paid") return order;
    const plan = state.plans.find((item) => item.id === order.planId);
    const current = findCurrentMembership(state, order.memberId);
    const startBase = current && dateKey(current.endDate) >= dateKey(now) ? addDays(current.endDate, 1) : now;
    const startDate = dateKey(startBase);
    const endDate = dateKey(addDays(startBase, plan.durationDays - 1));
    const membership = {
      id: `memship-${state.memberships.length + 1}`,
      memberId: order.memberId,
      planId: order.planId,
      status: "active",
      startDate,
      endDate,
      sourceOrderId: order.id,
    };
    state.memberships.push(membership);
    order.status = "paid";
    order.activatedMembershipId = membership.id;
    return order;
  }

  function purchaseAddOn(state, memberId, addOnId, now) {
    const addOn = state.addOns.find((item) => item.id === addOnId);
    const member = state.members.find((item) => item.id === memberId);
    if (!addOn || !member) return { ok: false, reason: "Add-on or member not found" };
    if (addOn.category === "Protein and Supplements" && addOn.stock <= 0) return { ok: false, reason: "Product is out of stock" };
    if (addOn.category === "Personal Training" && addOn.availableSlots <= 0) return { ok: false, reason: "Trainer unavailable" };

    if (addOn.category === "Protein and Supplements") addOn.stock -= 1;
    if (addOn.category === "Personal Training") addOn.availableSlots -= 1;

    const order = {
      id: `addon-order-${state.addOnOrders.length + 1}`,
      memberId,
      addOnId,
      status: "created",
      amount: addOn.price,
      createdAt: parseDate(now).toISOString(),
    };
    state.addOnOrders.push(order);
    const payment = createPayment(state, memberId, "addon", order.id, addOn.price, now);
    order.paymentId = payment.id;
    return { ok: true, order, payment };
  }

  function remindersDue(state, now) {
    const offsets = [14, 7, 3, 0];
    const due = [];
    state.members.forEach((member) => {
      if (member.notificationOptOut) return;
      const membership = findCurrentMembership(state, member.id);
      if (!membership || membership.status !== "active") return;
      const daysToExpiry = daysBetween(now, membership.endDate);
      if (offsets.includes(daysToExpiry)) {
        due.push({ memberId: member.id, membershipId: membership.id, daysToExpiry });
      }
    });
    return due;
  }

  function dashboardMetrics(state, now) {
    const today = dateKey(now);
    const sevenDaysAgo = addDays(now, -7);
    const activeMembers = state.members.filter((member) => getMemberStatus(state, member.id, now).canCheckIn);
    const todaysCheckIns = state.attendance.filter((visit) => dateKey(visit.checkedInAt) === today);
    const activeLastSeven = new Set(
      state.attendance
        .filter((visit) => parseDate(visit.checkedInAt) >= parseDate(sevenDaysAgo))
        .map((visit) => visit.memberId)
    );
    const expiringWithinSeven = activeMembers.filter((member) => {
      const membership = findCurrentMembership(state, member.id);
      const days = daysBetween(now, membership.endDate);
      return days >= 0 && days <= 7;
    });
    const renewalCollection = state.payments
      .filter((payment) => payment.purpose === "renewal" && payment.status === "paid")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const monthKey = dateKey(now).slice(0, 7);
    const monthlyAddOnRevenue = state.payments
      .filter((payment) => payment.purpose === "addon" && payment.status === "paid" && dateKey(payment.verifiedAt).startsWith(monthKey))
      .reduce((sum, payment) => sum + payment.amount, 0);

    return {
      activeMembers: activeMembers.length,
      todaysCheckIns: todaysCheckIns.length,
      activeLastSeven: activeLastSeven.size,
      inactiveMembers: state.noShowCases.filter((item) => item.status === "open").length,
      returnedAfterFollowUp: state.noShowCases.filter((item) => item.status === "resolved").length,
      expiringWithinSeven: expiringWithinSeven.length,
      renewalCollection,
      monthlyAddOnRevenue,
    };
  }

  function weeklyAttendance(state, memberId, now) {
    const start = addDays(now, -6);
    return Array.from({ length: 7 }, (_, index) => {
      const day = dateKey(addDays(start, index));
      const count = state.attendance.filter((visit) => visit.memberId === memberId && dateKey(visit.checkedInAt) === day).length;
      return { day, count };
    });
  }

  function makeAudit(action, entityId, details) {
    return {
      id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      action,
      entityId,
      details,
      createdAt: new Date().toISOString(),
    };
  }

  const api = {
    addDays,
    addFollowUp,
    calculateStreak,
    checkInMember,
    createRenewalOrder,
    dashboardMetrics,
    dateKey,
    daysBetween,
    failPayment,
    findCurrentMembership,
    formatINR,
    getLastVisit,
    getMemberStatus,
    getMemberVisits,
    hasCheckedInToday,
    markPaymentPending,
    purchaseAddOn,
    remindersDue,
    scanNoShows,
    verifyPayment,
    weeklyAttendance,
  };

  root.GymDomain = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
