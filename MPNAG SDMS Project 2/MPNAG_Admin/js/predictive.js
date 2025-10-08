document.addEventListener("DOMContentLoaded", () => {
  const ctx = document.getElementById("chartPredictive").getContext("2d");

  const weeks = ["Jul 7", "Jul 14", "Jul 21", "Jul 28", "Aug 4", "Aug 11"];
  const strands = ["STEM", "ABM", "GAS", "HUMSS", "TVL"];
  const violations = ["Tardiness", "Cheating", "Dress Code", "Disrespect"];

  // Simulated 7-day forecast data for each strand & violation
  const simulated = {};
  strands.forEach((s) => {
    simulated[s] = {};
    violations.forEach((v) => {
      simulated[s][v] = weeks.map((_, i) =>
        Math.floor(
          Math.random() * 10 +
          i * 2 +
          (s === "STEM"
            ? 6
            : s === "ABM"
            ? 4
            : s === "GAS"
            ? 3
            : s === "HUMSS"
            ? 2
            : 1)
        )
      );
    });
  });

  let chartInstance;

  function updateChart() {
    const strandVal = document.getElementById("filterStrand").value;
    const violationVal = document.getElementById("filterViolation").value;

    const shownStrands = strandVal === "All" ? strands : [strandVal];
    const datasets = [];

    shownStrands.forEach((s, i) => {
      const chosenViolations = violationVal === "All" ? violations : [violationVal];
      const avgValues = weeks.map((_, idx) => {
        let sum = 0;
        chosenViolations.forEach((v) => (sum += simulated[s][v][idx]));
        return Math.round(sum / chosenViolations.length);
      });

      const colors = ["#1e88e5", "#43a047", "#ffb300", "#8e24aa", "#e53935"]; // STEM, ABM, GAS, HUMSS, TVL

      datasets.push({
        label: s,
        data: avgValues,
        borderColor: colors[i],
        backgroundColor: colors[i] + "33",
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      });
    });

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
      type: "line",
      data: { labels: weeks, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { usePointStyle: true, padding: 15 },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Predicted Repeat Offenders" },
          },
          x: {
            title: { display: true, text: "7-Day Intervals" },
          },
        },
      },
    });
  }

  // Initial render
  updateChart();

  // Update on dropdown change
  document.getElementById("filterStrand").addEventListener("change", updateChart);
  document.getElementById("filterViolation").addEventListener("change", updateChart);
});


  // nag add ako logout here kasi hindi ma-logout from dashboard.js -gem
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    window.location.href = "index.html";
});
