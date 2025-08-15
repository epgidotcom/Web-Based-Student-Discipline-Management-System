<?php
session_start();

if (!isset($_SESSION['username'])) {
    header("Location: login.php");
    exit();
}

$students = [
    ["name" => "Yuki Breboneria", "grade" => 10, "section" => "A"],
    ["name" => "Christian Aguilar", "grade" => 9, "section" => "B"],
    ["name" => "Fitzgerald Larido", "grade" => 11, "section" => "C"],
    ["name" => "Gemarie Merino", "grade" => 8, "section" => "D"],
];

$violations = [
    ["student" => "Yuki Breboneria", "violation" => "Tardiness", "date" => "2025-08-10"],
    ["student" => "Christian Aguilar", "violation" => "Improper Uniform", "date" => "2025-08-11"],
    ["student" => "Fitzgerald Larido", "violation" => "Cheating", "date" => "2025-08-12"],
];

$totalStudents = count($students);
$totalViolations = count($violations);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SDMS - Dashboard</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
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

    .sidebar a:hover {
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

    .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin-bottom: 20px;
    }

    .card {
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        text-align: center;
    }

    .calendar {
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        height: 300px;
        margin-bottom: 20px;
    }

    .widgets {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
    }

    .widget {
        background: white;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }

    .widget h3 {
        margin-top: 0;
        margin-bottom: 10px;
        color: #43699c;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
    }

    table th, table td {
        padding: 8px;
        border-bottom: 1px solid #ddd;
        text-align: left;
    }

    table th {
        background-color: #f2f2f2;
    }
</style>
</head>
<body>

<div class="sidebar">
    <img src="mpnag_logo.png" alt="MPNAG Logo">
    <a href="dashboard.php"><i class="fa fa-gauge"></i> Dashboard</a>
    <a href="student_list.php"><i class="fa fa-users"></i> Student List</a>
    <a href="violation_list.php"><i class="fa fa-exclamation-triangle"></i> Violation List</a>
    <a href="calendar.php"><i class="fa fa-calendar"></i> Calendar</a>
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

    <div class="cards">
        <div class="card">
            <h3>Students</h3>
            <p><?php echo $totalStudents; ?> Registered</p>
        </div>
        <div class="card">
            <h3>Violations</h3>
            <p><?php echo $totalViolations; ?> Recorded</p>
        </div>
    </div>

    <div class="calendar-widget">
        <h2>Calendar</h2>
        <iframe src="https://calendar.google.com/calendar/embed?src=en.philippines%23holiday%40group.v.calendar.google.com&ctz=Asia%2FManila"
                style="border: 0" width="100%" height="400" frameborder="0" scrolling="no"></iframe>
    </div>

    <div class="widgets">

        <div class="widget">
            <h3>Student List</h3>
            <table>
                <tr>
                    <th>Name</th>
                    <th>Grade</th>
                    <th>Section</th>
                </tr>
                <?php foreach ($students as $student): ?>
                <tr>
                    <td><?php echo htmlspecialchars($student['name']); ?></td>
                    <td><?php echo htmlspecialchars($student['grade']); ?></td>
                    <td><?php echo htmlspecialchars($student['section']); ?></td>
                </tr>
                <?php endforeach; ?>
            </table>
        </div>

        <div class="widget">
            <h3>Violation List</h3>
            <table>
                <tr>
                    <th>Student</th>
                    <th>Violation</th>
                    <th>Date</th>
                </tr>
                <?php foreach ($violations as $violation): ?>
                <tr>
                    <td><?php echo htmlspecialchars($violation['student']); ?></td>
                    <td><?php echo htmlspecialchars($violation['violation']); ?></td>
                    <td><?php echo htmlspecialchars($violation['date']); ?></td>
                </tr>
                <?php endforeach; ?>
            </table>
        </div>
    </div>
</div>

</body>
</html>
