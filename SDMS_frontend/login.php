<?php
session_start();

$valid_username = "admin";
$valid_email    = "admin@gmail.com";
$valid_password = "adminpw123";

$message = "";

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $username_or_email = trim($_POST['username']);
    $password = trim($_POST['password']);

    if (
        ($username_or_email === $valid_username || $username_or_email === $valid_email) &&
        $password === $valid_password
    ) {
        $_SESSION['username'] = $username_or_email;
        header("Location: dashboard.php"); 
        exit;
    } else {
        $message = "Invalid username/email or password!";
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MPNAG - Student Discipline Management System</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
    body {
        margin: 0;
        font-family: Arial, sans-serif;
        background-color: #2c2f33;
        color: white;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
    }
    .login-container {
        background-color: #23272a;
        padding: 40px;
        border-radius: 10px;
        text-align: center;
        width: 100%;
        max-width: 400px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }
    .logo {
        width: 70px;
        margin-bottom: 15px;
    }
    h2 {
        margin-bottom: 30px;
        font-weight: normal;
        font-size: 18px;
        color: #ccc;
    }
    .input-group {
        position: relative;
        margin-bottom: 20px;
    }
    .input-group input {
        width: 100%;
        padding: 12px 40px;
        border: none;
        border-radius: 5px;
        background-color: #40444b;
        color: white;
        font-size: 14px;
        box-sizing: border-box; 
    }
    .input-group input:focus {
        outline: none;
        background-color: #50555c; 
    }
    .input-group .icon {
        position: absolute;
        top: 50%;
        left: 12px;
        transform: translateY(-50%);
        color: #999;
    }
    .btn-login {
        background-color: #e74c3c;
        border: none;
        padding: 12px;
        width: 100%;
        color: white;
        font-size: 14px;
        border-radius: 5px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
    }
    .btn-login:hover {
        background-color: #c0392b;
    }
    .forgot-password {
        display: block;
        margin-top: 15px;
        font-size: 12px;
        color: #bbb;
        text-decoration: none;
    }
    .forgot-password:hover {
        text-decoration: underline;
    }
    .error-message {
        color: #ff6b6b;
        font-size: 13px;
        margin-bottom: 15px;
    }
</style>
</head>
<body>

<div class="login-container">
    <img src="mpnag_logo.png" alt="School Logo" class="logo">
    <h2>MPNAG - Student Discipline Management System</h2>

    <?php if (!empty($message)): ?>
        <p class="error-message"><?php echo $message; ?></p>
    <?php endif; ?>

    <form action="" method="POST">
        <div class="input-group">
            <i class="fa fa-user icon"></i>
            <input type="text" name="username" placeholder="Username or Email" required>
        </div>
        <div class="input-group">
            <i class="fa fa-lock icon"></i>
            <input type="password" name="password" placeholder="Password" required>
        </div>
        <button type="submit" class="btn-login">
            Login Now <i class="fa fa-sign-in-alt"></i>
        </button>
        <a href="#" class="forgot-password">Forgot Your Password?</a>
    </form>
</div>

</body>
</html>
