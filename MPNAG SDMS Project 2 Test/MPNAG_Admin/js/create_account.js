document.addEventListener("DOMContentLoaded", () => {
  const roleSelect = document.getElementById("role");
  const gradeGroup = document.getElementById("gradeGroup");
  const form = document.getElementById("accountForm");

  // Logout
  document.getElementById("logoutBtn").addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // Toggle grade field based on role
  roleSelect.addEventListener("change", () => {
    if (roleSelect.value === "Student") {
      gradeGroup.style.display = "block";
      document.getElementById("grade").setAttribute("required", "true");
    } else {
      gradeGroup.style.display = "none";
      document.getElementById("grade").removeAttribute("required");
    }
  });

  // Handle form submission
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const fullName = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const role = document.getElementById("role").value;
    const grade = document.getElementById("grade").value;

    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    const newUser = {
      fullName,
      email,
      username,
      password,
      role,
      ...(role === "Student" && { grade }),
    };

    console.log("Account Created:", newUser);
    alert(`${role} account created successfully!`);

    form.reset();
    gradeGroup.style.display = "none";
  });
});

  // Logout 
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });
