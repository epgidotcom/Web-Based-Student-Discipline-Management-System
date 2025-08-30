document.addEventListener("DOMContentLoaded", () => {
  // counts (can replace with real data)
  const studentCount = document.querySelectorAll("#studentTable tr").length - 1; // exclude header
  const violationCount = document.querySelectorAll("#violationTable tr").length - 1;

  // update counters
  document.getElementById("totalStudents").textContent = `${studentCount} Registered`;
  document.getElementById("totalViolations").textContent = `${violationCount} Recorded`;

  // chart.js bar chart
  const ctx = document.getElementById("analyticsChart").getContext("2d");
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Students", "Violations"],
      datasets: [{
        label: "Total Records",
        data: [studentCount, violationCount],
        backgroundColor: ["#43699c", "#d9534f"]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
});

// logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});