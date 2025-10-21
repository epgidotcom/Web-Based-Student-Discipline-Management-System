const sidebar = document.querySelector(".sidebar");
const toggleBtn = document.getElementById("sidebarToggle");

if (sidebar && toggleBtn) {
  toggleBtn.addEventListener("click", () => {
    sidebar.classList.toggle("closed");
  });
}