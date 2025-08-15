<?php
session_start();

if (!isset($_SESSION['username'])) {
    header("Location: login.php");
    exit();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SDMS - Calendar</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.css" rel="stylesheet">
<style>
    body {
        margin: 0;
        font-family: Arial, sans-serif;
        background-color: #f4f4f4;
        display: flex;
        height: 100vh;
    }

    .sidebar {
        background-color: #43699c;
        color: white;
        width: 220px;
        padding-top: 20px;
        display: flex;
        flex-direction: column;
    }

    .sidebar img {
        width: 80px;
        margin-bottom: 15px;
        display: inline;
        margin-left: auto;
        margin-right: auto;
    }

    .sidebar a {
        padding: 12px 20px;
        text-decoration: none;
        color: white;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: background 0.3s;
    }

    .sidebar a:hover,
    .sidebar a.active {
        background-color: #34517c;
    }

    .main {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
    }

    .topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: white;
        padding: 10px 20px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        margin-bottom: 20px;
    }

    .topbar h1 {
        font-size: 20px;
        margin: 0;
        color: #43699c;
    }

    .logout-btn {
        background-color: #d9534f;
        color: white;
        border: none;
        padding: 8px 15px;
        border-radius: 5px;
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: background 0.3s;
    }

    .logout-btn:hover {
        background-color: #c9302c;
    }

    #calendar {
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
</style>
</head>
<body>

<div class="sidebar">
    <img src="mpnag_logo.png" alt="MPNAG Logo">
    <a href="dashboard.php"><i class="fa fa-gauge"></i> Dashboard</a>
    <a href="student_list.php"><i class="fa fa-users"></i> Student List</a>
    <a href="violation_list.php"><i class="fa fa-exclamation-triangle"></i> Violation List</a>
    <a href="calendar.php" class="active"><i class="fa fa-calendar"></i> Calendar</a>
</div>

<div class="main">

    <div class="topbar">
        <h1>Student Discipline Management System</h1>
        <form action="logout.php" method="POST" style="margin:0;">
            <button type="submit" class="logout-btn">
                <i class="fa fa-sign-out-alt"></i> Logout
            </button>
        </form>
    </div>

    <h2>School Calendar</h2>
    <div id="calendar"></div>

</div>

<script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.js"></script>
<script>
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
</script>

</body>
</html>
