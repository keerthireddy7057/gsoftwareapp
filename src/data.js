(function (root) {
  "use strict";

  const D = root.GymDomain;
  const TODAY = "2026-11-16T08:30:00+05:30";

  const firstNames = [
    "Aarav", "Meera", "Kabir", "Ananya", "Vihaan", "Isha", "Arjun", "Riya", "Reyansh", "Diya",
    "Aditya", "Tara", "Kunal", "Nisha", "Rohan", "Pooja", "Yash", "Sana", "Dev", "Aisha",
    "Nikhil", "Priya", "Harsh", "Neha", "Varun", "Maya", "Siddharth", "Kavya", "Rahul", "Simran"
  ];
  const lastNames = [
    "Sharma", "Patel", "Iyer", "Kapoor", "Mehta", "Nair", "Singh", "Rao", "Gupta", "Khan",
    "Jain", "Bose", "Malhotra", "Reddy", "Joshi", "Chopra", "Bhat", "Das", "Menon", "Verma",
    "Saxena", "Pillai", "Ahuja", "Shetty", "Kulkarni", "Sethi", "Mishra", "Ghosh", "Bajaj", "Gill"
  ];

  function isoDaysAgo(days, hour) {
    const date = D.addDays(TODAY, -days);
    date.setHours(hour || 7, 30, 0, 0);
    return date.toISOString();
  }

  function buildMembers() {
    return firstNames.map((name, index) => {
      const id = `member-${index + 1}`;
      return {
        id,
        name: `${name} ${lastNames[index]}`,
        email: index === 0 ? "aarav@gym.local" : `${name.toLowerCase()}@gym.local`,
        mobile: `+91 98${String(41000000 + index * 13729).slice(0, 8)}`,
        avatar: name.slice(0, 1) + lastNames[index].slice(0, 1),
        role: "member",
        trainerId: `trainer-${(index % 3) + 1}`,
        weeklyGoal: [3, 4, 5][index % 3],
        joinedAt: D.dateKey(D.addDays(TODAY, -220 + index)),
        notificationOptOut: [21, 28].includes(index + 1),
        notes: index % 5 === 0 ? "Prefers morning batch" : "Regular member",
      };
    });
  }

  function buildMemberships(members) {
    const planIds = ["plan-monthly", "plan-quarterly", "plan-half-yearly", "plan-yearly"];
    const paused = new Set(["member-12"]);
    const frozen = new Set(["member-18"]);
    const expired = new Set(["member-22"]);
    const cancelled = new Set(["member-27"]);
    const expiringOffsets = {
      "member-2": 1,
      "member-5": 3,
      "member-9": 5,
      "member-14": 7,
      "member-20": 2,
    };

    return members.map((member, index) => {
      let status = "active";
      if (paused.has(member.id)) status = "paused";
      if (frozen.has(member.id)) status = "frozen";
      if (expired.has(member.id)) status = "expired";
      if (cancelled.has(member.id)) status = "cancelled";

      const endOffset = expiringOffsets[member.id] ?? (status === "expired" ? -5 : 24 + (index % 18));
      return {
        id: `memship-${index + 1}`,
        memberId: member.id,
        planId: planIds[index % planIds.length],
        status,
        startDate: D.dateKey(D.addDays(TODAY, -70 - (index % 30))),
        endDate: D.dateKey(D.addDays(TODAY, endOffset)),
        sourceOrderId: null,
      };
    });
  }

  function buildAttendance(members) {
    const attendance = [];
    const inactiveMembers = new Set(["member-3", "member-6", "member-8", "member-11", "member-15", "member-19"]);
    members.forEach((member, index) => {
      const lastVisitDaysAgo = inactiveMembers.has(member.id) ? 10 + (index % 11) : index % 4;
      [lastVisitDaysAgo, lastVisitDaysAgo + 2, lastVisitDaysAgo + 5, lastVisitDaysAgo + 8].forEach((days, visitIndex) => {
        if (days > 35) return;
        attendance.push({
          id: `att-${attendance.length + 1}`,
          memberId: member.id,
          checkedInAt: isoDaysAgo(days, 6 + (visitIndex % 3)),
          source: visitIndex === 0 ? "qr" : "staff-assisted",
        });
      });
    });

    ["member-1", "member-2", "member-4", "member-5", "member-7", "member-10"].forEach((memberId, index) => {
      attendance.push({
        id: `att-${attendance.length + 1}`,
        memberId,
        checkedInAt: isoDaysAgo(0, 6 + index),
        source: "qr",
      });
    });

    return attendance;
  }

  function createGymDemoState() {
    const members = buildMembers();
    const state = {
      settings: {
        gymName: "IronLedger Fitness",
        gymQrCode: "IRONLEDGER-CHECKIN-2026",
        noShowThresholdDays: 10,
        today: TODAY,
      },
      users: [
        { id: "user-admin", name: "Karan Owner", email: "admin@gym.local", password: "demo123", role: "admin", memberId: null },
        { id: "user-frontdesk", name: "Sneha Desk", email: "frontdesk@gym.local", password: "demo123", role: "staff", memberId: null },
        { id: "user-member-1", name: "Aarav Sharma", email: "aarav@gym.local", password: "demo123", role: "member", memberId: "member-1" },
      ],
      trainers: [
        { id: "trainer-1", name: "Rajat Saini", qualification: "ACE CPT, Strength Coach", availableSlots: 4 },
        { id: "trainer-2", name: "Fatima Khan", qualification: "Nutrition + Mobility Specialist", availableSlots: 2 },
        { id: "trainer-3", name: "Pranav Rao", qualification: "CrossFit L1, Hypertrophy Coach", availableSlots: 0 },
      ],
      members,
      plans: [
        { id: "plan-monthly", name: "Monthly", durationDays: 30, price: 2499, discountPercent: 0, perks: "Gym floor access" },
        { id: "plan-quarterly", name: "Quarterly", durationDays: 90, price: 6999, discountPercent: 8, perks: "Gym floor + body check-in" },
        { id: "plan-half-yearly", name: "Half-Yearly", durationDays: 180, price: 12999, discountPercent: 12, perks: "Priority batch support" },
        { id: "plan-yearly", name: "Yearly", durationDays: 365, price: 22999, discountPercent: 18, perks: "Annual progress review" },
      ],
      memberships: [],
      attendance: [],
      streaks: {},
      noShowCases: [],
      followUps: [],
      payments: [
        { id: "pay-1", memberId: "member-2", purpose: "renewal", referenceId: "legacy-ren-1", amount: 6440, status: "paid", provider: "simulated", createdAt: isoDaysAgo(5, 12), verifiedAt: isoDaysAgo(5, 12), receiptNo: "RCP-20261111-0001" },
        { id: "pay-2", memberId: "member-9", purpose: "addon", referenceId: "addon-order-legacy", amount: 2999, status: "paid", provider: "simulated", createdAt: isoDaysAgo(3, 16), verifiedAt: isoDaysAgo(3, 16), receiptNo: "RCP-20261113-0002" },
        { id: "pay-3", memberId: "member-17", purpose: "renewal", referenceId: "legacy-ren-2", amount: 2499, status: "failed", provider: "simulated", createdAt: isoDaysAgo(1, 18), verifiedAt: null, receiptNo: null },
      ],
      renewalOrders: [
        { id: "legacy-ren-1", memberId: "member-2", planId: "plan-quarterly", status: "paid", baseAmount: 6999, discountAmount: 559, payableAmount: 6440, paymentId: "pay-1", createdAt: isoDaysAgo(5, 12), activatedMembershipId: "memship-2" },
        { id: "legacy-ren-2", memberId: "member-17", planId: "plan-monthly", status: "created", baseAmount: 2499, discountAmount: 0, payableAmount: 2499, paymentId: "pay-3", createdAt: isoDaysAgo(1, 18) },
      ],
      addOns: [
        { id: "addon-pt-1", category: "Personal Training", name: "PT Starter Pack", description: "8 one-on-one strength sessions", price: 7999, validityDays: 30, availableSlots: 2, qualification: "ACE trainer assigned", stock: null },
        { id: "addon-pt-2", category: "Personal Training", name: "Elite Transformation", description: "24 sessions with weekly measurements", price: 19999, validityDays: 90, availableSlots: 0, qualification: "Senior coach only", stock: null },
        { id: "addon-diet-1", category: "Diet Plans", name: "Fat Loss Diet Plan", description: "Custom Indian meal plan with two reviews", price: 2499, validityDays: 30, availableSlots: 8, qualification: "Nutrition consultant", stock: null },
        { id: "addon-diet-2", category: "Diet Plans", name: "Muscle Gain Nutrition", description: "Protein target and weekly adjustment", price: 2999, validityDays: 45, availableSlots: 5, qualification: "Sports nutrition certified", stock: null },
        { id: "addon-supp-1", category: "Protein and Supplements", name: "Whey Protein 1kg", description: "Chocolate whey protein, lab-tested batch", price: 2799, validityDays: 0, availableSlots: null, qualification: "Batch QA available", stock: 12 },
        { id: "addon-supp-2", category: "Protein and Supplements", name: "Creatine Monohydrate", description: "100 servings, micronized creatine", price: 999, validityDays: 0, availableSlots: null, qualification: "In stock at counter", stock: 0 },
      ],
      addOnOrders: [
        { id: "addon-order-legacy", memberId: "member-9", addOnId: "addon-diet-2", status: "paid", amount: 2999, paymentId: "pay-2", createdAt: isoDaysAgo(3, 16) },
      ],
      notifications: [],
      auditLogs: [],
    };

    state.memberships = buildMemberships(members);
    state.attendance = buildAttendance(members);
    members.forEach((member) => {
      state.streaks[member.id] = D.calculateStreak(state, member.id, TODAY);
    });
    D.scanNoShows(state, TODAY);
    state.noShowCases.slice(0, 3).forEach((item, index) => {
      D.addFollowUp(
        state,
        item.id,
        ["Will Return", "No Response", "Timing Issue"][index],
        ["Coming back from Monday", "Phone not reachable", "Asked for evening batch"][index],
        D.dateKey(D.addDays(TODAY, index + 1)),
        TODAY
      );
    });
    state.notifications = D.remindersDue(state, TODAY).map((item, index) => ({
      id: `notif-${index + 1}`,
      memberId: item.memberId,
      type: "renewal",
      title: item.daysToExpiry === 0 ? "Membership expires today" : `${item.daysToExpiry} day renewal reminder`,
      status: "scheduled",
      createdAt: TODAY,
    }));
    return state;
  }

  root.createGymDemoState = createGymDemoState;
  if (typeof module !== "undefined") module.exports = { createGymDemoState };
})(typeof window !== "undefined" ? window : globalThis);
