document.addEventListener('DOMContentLoaded', function () {
    var calendarEl = document.getElementById('calendar');
    var calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        height: 'auto',
        events: [
            { title: 'Tardiness Violation', start: '2025-08-01', color: 'red' },
            { title: 'Improper Uniform Violation', start: '2025-08-05', color: 'red' },
            { title: 'Cheating Violation', start: '2025-08-10', color: 'red' },
            { title: 'School Sports Event', start: '2025-08-15', color: 'blue' },
            { title: 'Holiday - No Classes', start: '2025-08-20', color: 'green' }
        ]
    });
    calendar.render();
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});
