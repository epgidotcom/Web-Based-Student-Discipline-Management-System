/* Mock student + violation data (replace with real API later) */
const student = {
  name: "Juan Dela Cruz",
  grade: "Grade 9",
  section: "Emerald",
  violations: [
    { date: "2025-06-18", type: "Tardiness", remarks: "Arrived 15 minutes late", status: "Resolved" },
    { date: "2025-07-02", type: "Dress Code", remarks: "No ID worn in campus", status: "Resolved" },
    { date: "2025-07-29", type: "Disrespect", remarks: "Interrupting during class", status: "Pending" },
    { date: "2025-08-15", type: "Tardiness", remarks: "Late to homeroom", status: "Pending" },
    { date: "2025-08-28", type: "Cheating", remarks: "Phone visible during quiz", status: "Pending" },
  ],
  notices: [
    { text: "Please see the Guidance Office on Sept 8, 10:00 AM.", date: "2025-09-05" },
    { text: "Submit your written apology for the Aug 28 incident.", date: "2025-09-03" },
    { text: "Homeroom reminder: wear ID at all times.", date: "2025-08-20" },
  ]
};

/* ---------- Helper + UI bindings ---------- */
const $ = sel => document.querySelector(sel);

function initHeader() {
  $("#studentName").textContent = student.name;
  $("#studentMeta").textContent = `${student.grade} • Section ${student.section}`;

  const total = student.violations.length;
  const open = student.violations.filter(v => v.status === "Pending").length;
  const last = student.violations[student.violations.length - 1]?.date ?? "—";

  $("#totalViolations").textContent = total;
  $("#openCases").textContent = open;
  $("#lastViolation").textContent = last;

  const standing = open >= 3 ? "Under Monitoring" : "Good Standing";
  const badge = $("#standingBadge");
  badge.textContent = standing;
  badge.style.background = open >= 3 ? "#fff1f2" : "#e8f5ee";
  badge.style.color = open >= 3 ? "#e53935" : "#14a44d";
}

function fillTable(rows) {
  const tbody = $("#violationRows");
  if (!tbody) return;
  tbody.innerHTML = "";
  rows.forEach(v => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${v.date}</td>
      <td>${v.type}</td>
      <td>${v.remarks}</td>
      <td><span class="status ${v.status === "Pending" ? "pending" : "resolved"}">${v.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function fillAppealSelect(rows) {
  const sel = $("#appealViolation");
  if (!sel) return;
  sel.innerHTML = "";
  rows
    .filter(v => v.status === "Pending")
    .forEach((v, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = `${v.date} — ${v.type}`;
      sel.appendChild(opt);
    });
}

function fillNotices() {
  const list = $("#noticeList");
  if (!list) return;
  list.innerHTML = "";
  student.notices.forEach(n => {
    const li = document.createElement("li");
    li.className = "notice";
    li.innerHTML = `
      <div>${n.text}</div>
      <small>${n.date}</small>
    `;
    list.appendChild(li);
  });
}

/* ---------- Filters ---------- */
function applyFilters() {
  const from = $("#fromDate").value ? new Date($("#fromDate").value) : null;
  const to   = $("#toDate").value ? new Date($("#toDate").value) : null;
  const type = $("#typeFilter").value;

  let filtered = student.violations.slice();

  if (from) filtered = filtered.filter(v => new Date(v.date) >= from);
  if (to)   filtered = filtered.filter(v => new Date(v.date) <= to);
  if (type && type !== "All") filtered = filtered.filter(v => v.type === type);

  fillTable(filtered);
  fillAppealSelect(filtered);
  drawCharts(filtered);

  $("#breakdownScope").textContent = type === "All" ? "All types" : type;
}

function resetFilters() {
  $("#fromDate").value = "";
  $("#toDate").value = "";
  $("#typeFilter").value = "All";
  applyFilters();
}

/* ---------- Charts ---------- */
let lineChart, barChart;

function drawCharts(rows) {
  const byDate = {};
  rows.forEach(v => { byDate[v.date] = (byDate[v.date] || 0) + 1; });

  const labels = Object.keys(byDate).sort();
  const counts = labels.map(d => byDate[d]);

  const byType = {};
  rows.forEach(v => { byType[v.type] = (byType[v.type] || 0) + 1; });
  const typeLabels = Object.keys(byType);
  const typeCounts = typeLabels.map(k => byType[k]);

  if (lineChart) lineChart.destroy();
  if (barChart) barChart.destroy();

  const lineCtx = $("#lineChart");
  const barCtx = $("#barChart");
  if (!lineCtx || !barCtx || typeof Chart === "undefined") return;

  lineChart = new Chart(lineCtx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Violations",
        data: counts,
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  barChart = new Chart(barCtx, {
    type: "bar",
    data: {
      labels: typeLabels,
      datasets: [{ label: "Count", data: typeCounts }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

/* ---------- Messaging + Appeals (demo only) ---------- */
$("#sendBtn")?.addEventListener("click", () => {
  const text = $("#messageText").value.trim();
  if (!text) return alert("Please write a message.");
  student.notices.unshift({ text: `You: ${text}`, date: new Date().toISOString().slice(0,10) });
  $("#messageText").value = "";
  fillNotices();
  alert("Message sent.");
});

$("#appealForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const idx = +$("#appealViolation").value;
  const reason = $("#appealReason").value.trim();
  if (Number.isNaN(idx)) return alert("Select a violation to appeal.");
  if (!reason) return alert("Please add your explanation.");
  alert("Appeal submitted. You will be notified after review.");
  $("#appealReason").value = "";
});

/* ---------- Init ---------- */
function bootstrap() {
  initHeader();
  fillTable(student.violations);
  fillAppealSelect(student.violations);
  fillNotices();
  drawCharts(student.violations);

  $("#applyBtn")?.addEventListener("click", applyFilters);
  $("#resetBtn")?.addEventListener("click", resetFilters);
}

document.addEventListener("DOMContentLoaded", bootstrap);
