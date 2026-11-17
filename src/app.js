(function () {
  "use strict";

  const D = window.GymDomain;
  const STORAGE_KEY = "ironledger-gym-state-v1";
  const app = document.getElementById("app");

  let state = loadState();
  let session = null;
  let route = "dashboard";
  let toast = "";

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return window.createGymDemoState();
    try {
      return JSON.parse(saved);
    } catch (_error) {
      return window.createGymDemoState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function resetDemo() {
    state = window.createGymDemoState();
    saveState();
    showToast("Demo data reset");
  }

  function now() {
    return state.settings.today;
  }

  function showToast(message) {
    toast = message;
    render();
  }

  function memberById(id) {
    return state.members.find((member) => member.id === id);
  }

  function planById(id) {
    return state.plans.find((plan) => plan.id === id);
  }

  function trainerById(id) {
    return state.trainers.find((trainer) => trainer.id === id);
  }

  function membershipFor(memberId) {
    return D.findCurrentMembership(state, memberId);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  }

  function fmtDateTime(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function activeUserMember() {
    if (!session || session.role !== "member") return null;
    return memberById(session.memberId);
  }

  function routesForRole(role) {
    if (role === "member") {
      return [
        ["dashboard", "Dashboard"],
        ["checkin", "QR Check-in"],
        ["history", "Attendance"],
        ["renew", "Renewal"],
        ["marketplace", "Add-ons"],
      ];
    }
    if (role === "staff") {
      return [
        ["dashboard", "Desk"],
        ["checkin", "Assisted Check-in"],
        ["redlist", "Red List"],
        ["payments", "Payments"],
        ["notifications", "Summary"],
      ];
    }
    return [
      ["dashboard", "Dashboard"],
      ["redlist", "Red List"],
      ["members", "Members"],
      ["payments", "Payments"],
      ["addons", "Add-ons"],
      ["notifications", "Notifications"],
    ];
  }

  function render() {
    if (!session) {
      app.innerHTML = renderLogin();
      bindLogin();
      return;
    }

    app.innerHTML = `
      <div class="shell">
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-mark">IL</div>
            <div>
              <strong>${escapeHtml(state.settings.gymName)}</strong>
              <span>${session.role === "admin" ? "Owner Console" : session.role === "staff" ? "Front Desk" : "Member App"}</span>
            </div>
          </div>
          <nav class="nav">${routesForRole(session.role).map(([key, label]) => `
            <button class="${route === key ? "active" : ""}" data-route="${key}">${label}</button>
          `).join("")}</nav>
          <div class="session-card">
            <span>Logged in</span>
            <strong>${escapeHtml(session.name)}</strong>
            <button class="ghost" data-action="logout">Sign out</button>
          </div>
        </aside>
        <main class="main">
          <header class="topbar">
            <div>
              <p class="eyebrow">Today, ${fmtDate(now())}</p>
              <h1>${pageTitle()}</h1>
            </div>
            <div class="topbar-actions">
              <button class="ghost" data-action="scanNoShows">Daily scan</button>
              <button class="ghost" data-action="resetDemo">Reset demo</button>
            </div>
          </header>
          ${toast ? `<div class="toast">${escapeHtml(toast)}</div>` : ""}
          ${renderRoute()}
        </main>
      </div>
    `;
    bindShell();
  }

  function pageTitle() {
    const found = routesForRole(session.role).find(([key]) => key === route);
    return found ? found[1] : "Dashboard";
  }

  function renderLogin() {
    return `
      <main class="login-screen">
        <section class="login-visual">
          <div class="brand large"><div class="brand-mark">IL</div><div><strong>IronLedger Fitness</strong><span>Retention-first gym management</span></div></div>
          <div class="metric-strip">
            <div><strong>30</strong><span>Demo members</span></div>
            <div><strong>6</strong><span>No-show cases</span></div>
            <div><strong>₹</strong><span>Simulated payments</span></div>
          </div>
        </section>
        <section class="login-panel">
          <h1>Sign in</h1>
          <form id="loginForm" class="form">
            <label>Email<input name="email" type="email" value="admin@gym.local" required /></label>
            <label>Password<input name="password" type="password" value="demo123" required /></label>
            <button class="primary" type="submit">Login</button>
          </form>
          <div class="quick-logins">
            <button data-login="admin@gym.local">Admin</button>
            <button data-login="frontdesk@gym.local">Front Desk</button>
            <button data-login="aarav@gym.local">Member</button>
          </div>
        </section>
      </main>
    `;
  }

  function renderRoute() {
    if (route === "checkin") return renderCheckIn();
    if (route === "history") return renderAttendanceHistory();
    if (route === "renew") return renderRenewal();
    if (route === "marketplace") return renderMarketplace();
    if (route === "redlist") return renderRedList();
    if (route === "members") return renderMembers();
    if (route === "payments") return renderPayments();
    if (route === "addons") return renderAddOnManagement();
    if (route === "notifications") return renderNotifications();
    return session.role === "member" ? renderMemberDashboard() : renderAdminDashboard();
  }

  function renderMemberDashboard() {
    const member = activeUserMember();
    const membership = membershipFor(member.id);
    const plan = planById(membership.planId);
    const status = D.getMemberStatus(state, member.id, now());
    const visits = D.getMemberVisits(state, member.id).slice(0, 5);
    const weekly = D.weeklyAttendance(state, member.id, now());
    const weeklyCount = weekly.reduce((sum, day) => sum + day.count, 0);

    return `
      <section class="grid two">
        <article class="panel profile-panel">
          <div class="avatar xl">${member.avatar}</div>
          <div>
            <p class="eyebrow">Namaste, ${escapeHtml(member.name.split(" ")[0])}</p>
            <h2>${escapeHtml(member.name)}</h2>
            <p>${escapeHtml(plan.name)} plan · ${status.status}</p>
          </div>
        </article>
        <article class="panel hero-stat">
          <span>Current streak</span>
          <strong>${D.calculateStreak(state, member.id, now())} days</strong>
          <p>Weekly goal: ${weeklyCount}/${member.weeklyGoal} visits</p>
        </article>
      </section>
      <section class="grid four">
        ${statCard("Plan expiry", fmtDate(membership.endDate), "Renew before expiry")}
        ${statCard("Status", status.status, status.canCheckIn ? "Check-in allowed" : "Action needed")}
        ${statCard("Trainer", trainerById(member.trainerId).name, "Assigned coach")}
        ${statCard("Visits this week", weeklyCount, `${member.weeklyGoal} target`)}
      </section>
      <section class="grid two">
        <article class="panel">
          <h2>Weekly Attendance</h2>
          ${barChart(weekly.map((item) => ({ label: item.day.slice(5), value: item.count })), 1)}
        </article>
        <article class="panel">
          <h2>Recent Visits</h2>
          ${visits.map((visit) => row("Check-in", fmtDateTime(visit.checkedInAt), visit.source)).join("")}
        </article>
      </section>
    `;
  }

  function renderAdminDashboard() {
    const metrics = D.dashboardMetrics(state, now());
    const attendanceTrend = Array.from({ length: 7 }, (_, index) => {
      const day = D.dateKey(D.addDays(now(), index - 6));
      return {
        label: day.slice(5),
        value: state.attendance.filter((visit) => D.dateKey(visit.checkedInAt) === day).length,
      };
    });
    const paymentsByStatus = ["created", "pending", "paid", "failed", "refunded", "reversed"].map((status) => ({
      label: status,
      value: state.payments.filter((payment) => payment.status === status).length,
    }));
    const daily = dailySummary();

    return `
      <section class="grid four">
        ${statCard("Active Members", metrics.activeMembers, "Valid memberships")}
        ${statCard("Today's Check-ins", metrics.todaysCheckIns, "QR + assisted")}
        ${statCard("Active Last 7 Days", metrics.activeLastSeven, "Unique members")}
        ${statCard("Inactive Members", metrics.inactiveMembers, "Open red-list cases")}
        ${statCard("Returned After Follow-up", metrics.returnedAfterFollowUp, "Resolved cases")}
        ${statCard("Expiring in 7 Days", metrics.expiringWithinSeven, "Renewal priority")}
        ${statCard("Renewal Collection", D.formatINR(metrics.renewalCollection), "Verified only")}
        ${statCard("Add-on Revenue", D.formatINR(metrics.monthlyAddOnRevenue), "This month")}
      </section>
      <section class="grid two">
        <article class="panel">
          <h2>Attendance Trend</h2>
          ${barChart(attendanceTrend, Math.max(...attendanceTrend.map((item) => item.value), 1))}
        </article>
        <article class="panel">
          <h2>Payment Health</h2>
          ${barChart(paymentsByStatus, Math.max(...paymentsByStatus.map((item) => item.value), 1))}
        </article>
      </section>
      <section class="panel">
        <h2>Daily Admin Summary</h2>
        <div class="summary-grid">
          ${Object.entries(daily).map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}
        </div>
      </section>
    `;
  }

  function renderCheckIn() {
    const isMember = session.role === "member";
    const options = state.members.map((member) => `<option value="${member.id}">${escapeHtml(member.name)} · ${escapeHtml(member.mobile)}</option>`).join("");
    const member = activeUserMember();
    return `
      <section class="grid two">
        <article class="panel qr-panel">
          <div class="qr-box">${state.settings.gymQrCode}</div>
          <h2>${isMember ? "QR Attendance" : "Assisted Check-in"}</h2>
          <p class="muted">${isMember ? "Scan confirmation uses your logged-in membership." : "Front desk can check in a member after verifying identity."}</p>
          <form id="checkInForm" class="form">
            ${isMember ? `<input type="hidden" name="memberId" value="${member.id}" />` : `<label>Member<select name="memberId">${options}</select></label>`}
            <button class="primary" type="submit">${isMember ? "Confirm Check-in" : "Check in Member"}</button>
          </form>
        </article>
        <article class="panel">
          <h2>Check-in Rules</h2>
          ${row("Membership", "Must be active", "paused, frozen, expired and cancelled blocked")}
          ${row("Duplicate scan", "One check-in per day", "same member cannot be counted twice")}
          ${row("Return case", "Auto-resolved", "open no-show case closes on visit")}
        </article>
      </section>
    `;
  }

  function renderAttendanceHistory() {
    const member = activeUserMember();
    const visits = D.getMemberVisits(state, member.id);
    const weekly = D.weeklyAttendance(state, member.id, now());
    return `
      <section class="grid two">
        <article class="panel">
          <h2>Weekly Goal</h2>
          ${barChart(weekly.map((item) => ({ label: item.day.slice(5), value: item.count })), 1)}
        </article>
        <article class="panel">
          <h2>Visit History</h2>
          ${visits.map((visit) => row(fmtDateTime(visit.checkedInAt), visit.source, "Recorded attendance")).join("")}
        </article>
      </section>
    `;
  }

  function renderRenewal() {
    const member = activeUserMember();
    const membership = membershipFor(member.id);
    const currentPlan = planById(membership.planId);
    const orders = state.renewalOrders.filter((order) => order.memberId === member.id).slice(-4).reverse();
    return `
      <section class="grid two">
        <article class="panel">
          <h2>Current Membership</h2>
          ${row("Plan", currentPlan.name, `Expires ${fmtDate(membership.endDate)}`)}
          ${row("Status", membership.status, D.getMemberStatus(state, member.id, now()).canCheckIn ? "Active for check-in" : "Check-in blocked")}
          <form id="renewalForm" class="form compact">
            <label>Choose plan<select name="planId">
              ${state.plans.map((plan) => `<option value="${plan.id}">${plan.name} · ${D.formatINR(plan.price)} · ${plan.discountPercent}% off</option>`).join("")}
            </select></label>
            <button class="primary" type="submit">Create Renewal Order</button>
          </form>
        </article>
        <article class="panel">
          <h2>Renewal Orders</h2>
          ${orders.length ? orders.map(renderRenewalOrder).join("") : `<p class="muted">No renewal orders yet.</p>`}
        </article>
      </section>
    `;
  }

  function renderRenewalOrder(order) {
    const payment = state.payments.find((item) => item.id === order.paymentId);
    return `
      <div class="list-row">
        <div>
          <strong>${planById(order.planId).name}</strong>
          <span>${D.formatINR(order.payableAmount)} after ${D.formatINR(order.discountAmount)} discount</span>
        </div>
        <div class="row-actions">
          <span class="pill ${payment.status}">${payment.status}</span>
          ${payment.status !== "paid" ? `<button data-action="verifyPayment" data-payment-id="${payment.id}">Simulate success</button><button class="ghost" data-action="failPayment" data-payment-id="${payment.id}">Fail</button>` : `<button class="ghost" data-action="receipt" data-payment-id="${payment.id}">Receipt</button>`}
        </div>
      </div>
    `;
  }

  function renderMarketplace() {
    const member = activeUserMember();
    const categories = ["Personal Training", "Diet Plans", "Protein and Supplements"];
    return categories.map((category) => `
      <section class="panel marketplace-section">
        <h2>${category}</h2>
        <div class="grid three">
          ${state.addOns.filter((item) => item.category === category).map((item) => renderAddOnCard(item, member.id)).join("")}
        </div>
      </section>
    `).join("");
  }

  function renderAddOnCard(item, memberId) {
    const availability = item.category === "Protein and Supplements"
      ? `${item.stock} in stock`
      : item.category === "Personal Training"
        ? `${item.availableSlots} trainer slots`
        : `${item.availableSlots} consultations`;
    return `
      <article class="item-card">
        <span class="pill">${item.category}</span>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <div class="meta"><span>${D.formatINR(item.price)}</span><span>${item.validityDays ? `${item.validityDays} days` : "Counter pickup"}</span></div>
        <div class="muted">${escapeHtml(item.qualification)} · ${availability}</div>
        <div class="row-actions">
          <button class="ghost" data-action="askAddOn" data-addon-id="${item.id}" data-member-id="${memberId}">Ask</button>
          <button data-action="buyAddOn" data-addon-id="${item.id}" data-member-id="${memberId}">Buy</button>
        </div>
      </article>
    `;
  }

  function renderRedList() {
    const openCases = state.noShowCases.filter((item) => item.status === "open").sort((a, b) => b.absentDays - a.absentDays);
    return `
      <section class="panel">
        <div class="section-head">
          <div><h2>No-Show Red List</h2><p class="muted">Active members absent for ${state.settings.noShowThresholdDays}+ days.</p></div>
          <button class="primary" data-action="scanNoShows">Run Scan</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Member</th><th>Mobile</th><th>Plan</th><th>Last Visit</th><th>Absent</th><th>Expiry</th><th>Trainer</th><th>Follow-up</th></tr></thead>
            <tbody>
              ${openCases.map(renderNoShowRow).join("") || `<tr><td colspan="8">No active no-show cases.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderNoShowRow(item) {
    const member = memberById(item.memberId);
    const membership = membershipFor(member.id);
    const plan = planById(membership.planId);
    const trainer = trainerById(member.trainerId);
    const followUp = state.followUps.filter((entry) => entry.caseId === item.id).slice(-1)[0];
    return `
      <tr>
        <td><strong>${escapeHtml(member.name)}</strong></td>
        <td><a href="tel:${escapeHtml(member.mobile)}">${escapeHtml(member.mobile)}</a><br><a href="https://wa.me/${member.mobile.replace(/\D/g, "")}" target="_blank">WhatsApp</a></td>
        <td>${escapeHtml(plan.name)}</td>
        <td>${fmtDate(item.lastVisitDate)}</td>
        <td><span class="danger-text">${item.absentDays} days</span></td>
        <td>${fmtDate(membership.endDate)}</td>
        <td>${escapeHtml(trainer.name)}</td>
        <td>
          <form class="followup-form" data-case-id="${item.id}">
            <select name="outcome">
              ${["Will Return", "Injured", "Travelling", "Timing Issue", "Unhappy", "No Response", "Cancelled"].map((outcome) => `<option>${outcome}</option>`).join("")}
            </select>
            <input name="notes" placeholder="${followUp ? escapeHtml(followUp.notes) : "Add note"}" />
            <input name="nextFollowUpAt" type="date" value="${D.dateKey(D.addDays(now(), 1))}" />
            <button type="submit">Save</button>
          </form>
        </td>
      </tr>
    `;
  }

  function renderMembers() {
    return `
      <section class="panel">
        <div class="section-head">
          <div><h2>Membership Management</h2><p class="muted">Add, edit, pause, freeze, activate and renew member plans.</p></div>
        </div>
        <form id="memberForm" class="inline-form">
          <input name="name" placeholder="Member name" required />
          <input name="mobile" placeholder="+91 mobile" required />
          <select name="planId">${state.plans.map((plan) => `<option value="${plan.id}">${plan.name}</option>`).join("")}</select>
          <button class="primary" type="submit">Add Member</button>
        </form>
        <div class="member-grid">
          ${state.members.map(renderMemberCard).join("")}
        </div>
      </section>
    `;
  }

  function renderMemberCard(member) {
    const membership = membershipFor(member.id);
    const plan = planById(membership.planId);
    return `
      <article class="member-card">
        <div class="avatar">${member.avatar}</div>
        <div>
          <strong>${escapeHtml(member.name)}</strong>
          <span>${escapeHtml(member.mobile)}</span>
          <span>${plan.name} · ${membership.status} · expires ${fmtDate(membership.endDate)}</span>
        </div>
        <div class="row-actions">
          ${["active", "paused", "frozen", "cancelled"].map((status) => `<button class="ghost" data-action="setMembershipStatus" data-member-id="${member.id}" data-status="${status}">${status}</button>`).join("")}
        </div>
      </article>
    `;
  }

  function renderPayments() {
    return `
      <section class="panel">
        <h2>Payment Management</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Payment</th><th>Member</th><th>Purpose</th><th>Amount</th><th>Status</th><th>Receipt</th><th>Actions</th></tr></thead>
            <tbody>${state.payments.slice().reverse().map((payment) => `
              <tr>
                <td>${payment.id}</td>
                <td>${escapeHtml(memberById(payment.memberId)?.name || "-")}</td>
                <td>${payment.purpose}</td>
                <td>${D.formatINR(payment.amount)}</td>
                <td><span class="pill ${payment.status}">${payment.status}</span></td>
                <td>${payment.receiptNo || "-"}</td>
                <td class="row-actions">
                  ${payment.status === "created" ? `<button data-action="markPending" data-payment-id="${payment.id}">Pending</button>` : ""}
                  ${payment.status !== "paid" ? `<button data-action="verifyPayment" data-payment-id="${payment.id}">Verify</button><button class="ghost" data-action="failPayment" data-payment-id="${payment.id}">Fail</button>` : `<button class="ghost" data-action="receipt" data-payment-id="${payment.id}">Receipt</button>`}
                </td>
              </tr>
            `).join("")}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderAddOnManagement() {
    return `
      <section class="panel">
        <h2>Add-on Management</h2>
        <form id="addOnForm" class="inline-form">
          <select name="category"><option>Personal Training</option><option>Diet Plans</option><option>Protein and Supplements</option></select>
          <input name="name" placeholder="Package or product" required />
          <input name="price" type="number" min="1" placeholder="Price" required />
          <input name="available" type="number" min="0" placeholder="Slots/stock" required />
          <button class="primary" type="submit">Add</button>
        </form>
        <div class="grid three">${state.addOns.map((item) => renderManagedAddOn(item)).join("")}</div>
      </section>
    `;
  }

  function renderManagedAddOn(item) {
    return `
      <article class="item-card">
        <span class="pill">${item.category}</span>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <div class="meta"><span>${D.formatINR(item.price)}</span><span>${item.category === "Protein and Supplements" ? `${item.stock} stock` : `${item.availableSlots} slots`}</span></div>
      </article>
    `;
  }

  function renderNotifications() {
    const reminders = D.remindersDue(state, now());
    const daily = dailySummary();
    return `
      <section class="grid two">
        <article class="panel">
          <h2>Renewal Reminders</h2>
          ${reminders.map((item) => {
            const member = memberById(item.memberId);
            return row(member.name, item.daysToExpiry === 0 ? "Expires today" : `${item.daysToExpiry} days left`, member.notificationOptOut ? "Opted out" : "Scheduled");
          }).join("") || `<p class="muted">No reminders due today.</p>`}
        </article>
        <article class="panel">
          <h2>Daily Summary</h2>
          <div class="summary-grid">
            ${Object.entries(daily).map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}
          </div>
        </article>
      </section>
    `;
  }

  function dailySummary() {
    const today = D.dateKey(now());
    return {
      "Today check-ins": state.attendance.filter((visit) => D.dateKey(visit.checkedInAt) === today).length,
      "New inactive": state.noShowCases.filter((item) => D.dateKey(item.createdAt) === today).length,
      "Follow-ups done": state.followUps.filter((item) => D.dateKey(item.createdAt) === today).length,
      "Follow-ups pending": state.noShowCases.filter((item) => item.status === "open").length,
      "Renewals collected": D.formatINR(state.payments.filter((item) => item.purpose === "renewal" && item.status === "paid").reduce((sum, item) => sum + item.amount, 0)),
      "Pending payments": state.payments.filter((item) => item.status === "pending" || item.status === "created").length,
      "Add-on orders": state.addOnOrders.length,
    };
  }

  function statCard(label, value, hint) {
    return `<article class="stat-card"><span>${label}</span><strong>${value}</strong><p>${hint}</p></article>`;
  }

  function row(label, value, hint) {
    return `<div class="list-row"><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(hint)}</span></div><b>${escapeHtml(value)}</b></div>`;
  }

  function barChart(items, max) {
    return `<div class="bar-chart">${items.map((item) => `
      <div class="bar-row">
        <span>${escapeHtml(item.label)}</span>
        <div class="bar-track"><i style="width:${Math.max(6, (item.value / max) * 100)}%"></i></div>
        <b>${item.value}</b>
      </div>
    `).join("")}</div>`;
  }

  function bindLogin() {
    document.getElementById("loginForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      login(form.get("email"), form.get("password"));
    });
    document.querySelectorAll("[data-login]").forEach((button) => {
      button.addEventListener("click", () => login(button.dataset.login, "demo123"));
    });
  }

  function login(email, password) {
    const user = state.users.find((item) => item.email === email && item.password === password);
    if (!user) {
      app.innerHTML = renderLogin().replace("</section>", `<p class="error">Invalid login.</p></section>`);
      bindLogin();
      return;
    }
    session = user;
    route = "dashboard";
    toast = "";
    render();
  }

  function bindShell() {
    document.querySelectorAll("[data-route]").forEach((button) => {
      button.addEventListener("click", () => {
        route = button.dataset.route;
        toast = "";
        render();
      });
    });
    document.querySelectorAll("[data-action]").forEach((element) => {
      element.addEventListener("click", handleAction);
    });
    const checkInForm = document.getElementById("checkInForm");
    if (checkInForm) checkInForm.addEventListener("submit", handleCheckIn);
    const renewalForm = document.getElementById("renewalForm");
    if (renewalForm) renewalForm.addEventListener("submit", handleRenewal);
    const memberForm = document.getElementById("memberForm");
    if (memberForm) memberForm.addEventListener("submit", handleAddMember);
    const addOnForm = document.getElementById("addOnForm");
    if (addOnForm) addOnForm.addEventListener("submit", handleAddOn);
    document.querySelectorAll(".followup-form").forEach((form) => form.addEventListener("submit", handleFollowUp));
  }

  function handleAction(event) {
    const target = event.currentTarget;
    const action = target.dataset.action;
    if (action === "logout") {
      session = null;
      render();
      return;
    }
    if (action === "resetDemo") return resetDemo();
    if (action === "scanNoShows") {
      const created = D.scanNoShows(state, now());
      saveState();
      return showToast(`${created.length} new no-show cases found`);
    }
    if (action === "verifyPayment") {
      const result = D.verifyPayment(state, target.dataset.paymentId, now());
      saveState();
      return showToast(result.ok ? "Payment verified and receipt generated" : result.reason);
    }
    if (action === "failPayment") {
      const result = D.failPayment(state, target.dataset.paymentId, now());
      saveState();
      return showToast(result.ok ? "Payment marked failed" : result.reason);
    }
    if (action === "markPending") {
      const result = D.markPaymentPending(state, target.dataset.paymentId);
      saveState();
      return showToast(result.ok ? "Payment marked pending" : result.reason);
    }
    if (action === "receipt") {
      const payment = state.payments.find((item) => item.id === target.dataset.paymentId);
      return showToast(`${payment.receiptNo}: ${D.formatINR(payment.amount)} paid by ${memberById(payment.memberId).name}`);
    }
    if (action === "askAddOn") {
      state.notifications.push({ id: `notif-${state.notifications.length + 1}`, memberId: target.dataset.memberId, type: "addon-question", title: `Question about ${target.dataset.addonId}`, status: "open", createdAt: now() });
      saveState();
      return showToast("Question sent to front desk");
    }
    if (action === "buyAddOn") {
      const result = D.purchaseAddOn(state, target.dataset.memberId, target.dataset.addonId, now());
      saveState();
      return showToast(result.ok ? "Add-on order created. Verify payment to complete." : result.reason);
    }
    if (action === "setMembershipStatus") {
      const membership = membershipFor(target.dataset.memberId);
      membership.status = target.dataset.status;
      saveState();
      return showToast(`Membership set to ${target.dataset.status}`);
    }
  }

  function handleCheckIn(event) {
    event.preventDefault();
    const memberId = new FormData(event.currentTarget).get("memberId");
    const result = D.checkInMember(state, memberId, now(), session.role === "staff" ? "staff-assisted" : "qr");
    saveState();
    showToast(result.ok ? `Check-in successful at ${fmtDateTime(result.visit.checkedInAt)}` : result.reason);
  }

  function handleRenewal(event) {
    event.preventDefault();
    const member = activeUserMember();
    const result = D.createRenewalOrder(state, member.id, new FormData(event.currentTarget).get("planId"), now());
    saveState();
    showToast(result.ok ? "Renewal order created" : result.reason);
  }

  function handleFollowUp(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = D.addFollowUp(state, event.currentTarget.dataset.caseId, form.get("outcome"), form.get("notes"), form.get("nextFollowUpAt"), now());
    saveState();
    showToast(result.ok ? "Follow-up saved" : result.reason);
  }

  function handleAddMember(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = `member-${state.members.length + 1}`;
    const name = form.get("name");
    const member = {
      id,
      name,
      email: `${String(name).toLowerCase().replace(/\s+/g, ".")}@gym.local`,
      mobile: form.get("mobile"),
      avatar: String(name).split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      role: "member",
      trainerId: "trainer-1",
      weeklyGoal: 3,
      joinedAt: D.dateKey(now()),
      notificationOptOut: false,
      notes: "New member",
    };
    state.members.push(member);
    state.memberships.push({
      id: `memship-${state.memberships.length + 1}`,
      memberId: id,
      planId: form.get("planId"),
      status: "active",
      startDate: D.dateKey(now()),
      endDate: D.dateKey(D.addDays(now(), planById(form.get("planId")).durationDays - 1)),
      sourceOrderId: null,
    });
    state.streaks[id] = 0;
    saveState();
    showToast("Member added and membership activated");
  }

  function handleAddOn(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const category = form.get("category");
    const available = Number(form.get("available"));
    state.addOns.push({
      id: `addon-${state.addOns.length + 1}`,
      category,
      name: form.get("name"),
      description: "Custom add-on configured by admin",
      price: Number(form.get("price")),
      validityDays: category === "Protein and Supplements" ? 0 : 30,
      availableSlots: category === "Protein and Supplements" ? null : available,
      qualification: category === "Protein and Supplements" ? "Counter stock" : "Admin configured",
      stock: category === "Protein and Supplements" ? available : null,
    });
    saveState();
    showToast("Add-on created");
  }

  render();
})();
