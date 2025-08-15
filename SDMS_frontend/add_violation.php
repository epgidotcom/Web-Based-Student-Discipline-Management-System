<?php
session_start();
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Add Violation</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
        }

        .container {
            width: 100%;
            max-width: 700px;
            margin: 40px auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }

        h2 {
            text-align: center;
            margin-bottom: 25px;
            color: #333;
        }

        label {
            font-weight: bold;
            display: block;
            margin-bottom: 5px;
            margin-top: 15px;
        }

        input, select, textarea {
            width: 100%;
            padding: 10px;
            border-radius: 5px;
            border: 1px solid #ccc;
            margin-bottom: 15px;
            font-size: 14px;
        }

        button {
            width: 100%;
            background-color: #2c3e50;
            color: white;
            padding: 12px;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
        }

        button:hover {
            background-color: #1a242f;
        }

        .back-link {
            display: block;
            text-align: center;
            margin-top: 15px;
            color: #2c3e50;
            text-decoration: none;
        }

        .back-link:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>

<div class="container">
    <h2>Add New Violation</h2>

    <form action="process_add_violation.php" method="POST">
        <label for="student_name">Student Name:</label>
        <input type="text" id="student_name" name="student_name" placeholder="Enter student name" required>

        <label for="violation_type">Violation Type:</label>
        <select id="violation_type" name="violation_type" required>
            <option value="">-- Select Type --</option>
            <option value="Tardiness">Tardiness</option>
            <option value="Cutting Classes">Cheating</option>
            <option value="Bullying">Bullying</option>
            <option value="Disrespect">Improper Uniform</option>
            <option value="Others">Others</option>
        </select>

                <label for="sanction_type">Sanction Type:</label>
        <select id="violation_type" name="violation_type" required>
            <option value="">-- Select Type --</option>
            <option value="Tardiness">Verbal Warning</option>
            <option value="Cutting Classes">Detention</option>
            <option value="Bullying">Reprimand</option>
            <option value="Disrespect">Extra Homework</option>
            <option value="Disrespect">Suspension</option>
            <option value="Others">Others</option>
        </select>

        <label for="description">Violation Description:</label>
        <textarea id="description" name="description" rows="4" placeholder="Describe the violation" required></textarea>

        <label for="date">Date of Violation:</label>
        <input type="date" id="date" name="date" required>

        <button type="submit">Submit Violation</button>
    </form>

    <a href="violation_list.php" class="back-link">← Back to Violation List</a>
</div>

</body>
</html>
