<?php
session_start();
if (!isset($_SESSION['username'])) {
    header("Location: login.php");
    exit();
}

$violations = [
    ["student" => "Yuki Breboneria", "violation" => "Tardiness", "sanction" => "Verbal Warning", "date" => "2025-08-01"],
    ["student" => "Christian Aguilar", "violation" => "Improper Uniform", "sanction" => "Verbal Warning", "date" => "2025-08-05"],
    ["student" => "Fitzgerald Larido", "violation" => "Cheating", "sanction" => "Suspension", "date" => "2025-08-10"],
];
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SDMS - Violation List</title>
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
    .logout-btn:hover { background-color: #c9302c; }

    .widget {
        background: white;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    .widget h3 {
        margin-top: 0;
        margin-bottom: 15px;
        color: #43699c;
    }

    .search-container {
        margin-bottom: 15px;
        display: flex;
        justify-content: flex-start;
    }

    .search-container input[type="text"] {
        padding: 8px;
        width: 250px;
        border: 1px solid #ccc;
        border-radius: 4px 0 0 4px;
        outline: none;
        box-sizing: border-box;
    }

    .search-container button {
        padding: 8px 15px;
        border: none;
        background-color: #3498db;
        color: white;
        border-radius: 0 4px 4px 0;
        cursor: pointer;
    }

    .search-container button:hover {
        background-color: #2980b9;
    }

    .add-btn {
        background-color: #28a745;
        color: white;
        border: none;
        padding: 8px 15px;
        border-radius: 5px;
        font-size: 14px;
        cursor: pointer;
        margin-bottom: 15px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        text-decoration: none;
    }
    .add-btn:hover {
        background-color: #218838;
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
    table th { background-color: #f2f2f2; }
</style>
</head>
<body>

<div class="sidebar">
    <img src="mpnag_logo.png" alt="MPNAG Logo">

    <a href="dashboard.php"><i class="fa fa-gauge"></i> Dashboard</a>
    <a href="student_list.php"><i class="fa fa-users"></i> Student List</a>
    <a href="violation_list.php" style="background-color:#34517c;"><i class="fa fa-exclamation-triangle"></i> Violation List</a>
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

    <div class="widget">
        <h3>Violation List</h3>

        <a href="add_violation.php" class="add-btn">
            <i class="fa fa-plus"></i> Add Violation
        </a>

        <div class="search-container">
            <input type="text" id="searchInput" placeholder="Search violation..." onkeyup="searchTable()">
            <button>Search</button>
        </div>

        <table id="violationTable">
            <tr>
                <th>Student Name</th>
                <th>Violation</th>
                <th>Sanction</th>
                <th>Date</th>
            </tr>
            <?php foreach ($violations as $v): ?>
            <tr>
                <td><?php echo htmlspecialchars($v['student']); ?></td>
                <td><?php echo htmlspecialchars($v['violation']); ?></td>
                <td><?php echo htmlspecialchars($v['sanction']); ?></td>
                <td><?php echo htmlspecialchars($v['date']); ?></td>
            </tr>
            <?php endforeach; ?>
        </table>
    </div>
</div>

<script>
function searchTable() {
    let input = document.getElementById("searchInput").value.toLowerCase();
    let rows = document.querySelectorAll("#violationTable tr:not(:first-child)");

    rows.forEach(row => {
        let text = row.innerText.toLowerCase();
        row.style.display = text.includes(input) ? "" : "none";
    });
}
</script>

</body>
</html>
