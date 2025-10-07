// Main JS (shared across all pages)
// can put common features like dark mode, nav menu, etc.
console.log("Main JS loaded");


/* ========== SDMS: Mobile drawer toggle (global) ========== */
(function initSDMSDrawer(){
  document.addEventListener("DOMContentLoaded", () => {
    const sidebar  = document.getElementById("sidebar") || document.querySelector(".sidebar");
    const menuBtn  = document.querySelector(".menu-btn");
    let   backdrop = document.getElementById("backdrop");

    // If page has no sidebar or button, bail quietly
    if (!sidebar || !menuBtn) return;

    // Create a backdrop if missing
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "backdrop";
      backdrop.className = "backdrop";
      document.body.appendChild(backdrop);
    }

    function setOpen(open){
      sidebar.classList.toggle("open", open);
      backdrop.classList.toggle("show", open);
      document.body.style.overflow = open ? "hidden" : "";
      menuBtn.setAttribute("aria-expanded", String(open));
    }
    const toggle = () => setOpen(!sidebar.classList.contains("open"));

    // Avoid double-binding
    if (!menuBtn.dataset.bound) {
      menuBtn.addEventListener("click", toggle);
      menuBtn.dataset.bound = "1";
    }
    if (!backdrop.dataset.bound) {
      backdrop.addEventListener("click", () => setOpen(false));
      backdrop.dataset.bound = "1";
    }

    window.addEventListener("keydown", (e)=>{ if (e.key === "Escape") setOpen(false); });
    window.addEventListener("resize", ()=>{ if (window.innerWidth >= 769) setOpen(false); });

    // Optional global helpers
    window.SDMSMenu = {
      open:  () => setOpen(true),
      close: () => setOpen(false),
      toggle
    };
  });
})();

