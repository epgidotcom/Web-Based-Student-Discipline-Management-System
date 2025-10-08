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
    
      /* ===== Shared user chip + logout ===== */
      const userChipName   = document.getElementById("userName");
      const userChipAvatar = document.getElementById("userAvatar");
      const logoutBtn      = document.getElementById("logoutBtn");
    
      if (logoutBtn && !logoutBtn.dataset.bound) {
        logoutBtn.addEventListener("click", (event) => {
          event.preventDefault();
          if (window.SDMSAuth?.logout) {
            window.SDMSAuth.logout();
          } else {
            try { localStorage.removeItem("sdms_auth_v1"); } catch (_) {}
            window.location.href = "index.html";
          }
        });
        logoutBtn.dataset.bound = "1";
      }
    
      const authUser = window.SDMSAuth?.getUser?.();
      const nameCandidates = [
        authUser?.fullName,
        authUser?.name,
        [authUser?.firstName, authUser?.lastName].filter(Boolean).join(" "),
        authUser?.username,
        (function(){
          try { return localStorage.getItem("sdms_user"); } catch (_) { return null; }
        })()
      ].map(v => (v || "").trim()).filter(Boolean);
    
      if (nameCandidates.length && userChipName) {
        userChipName.textContent = nameCandidates[0];
      }
    
      const initial = (nameCandidates[0] || "A").trim().charAt(0).toUpperCase() || "A";
      if (userChipAvatar) {
        userChipAvatar.textContent = initial;
      }
  });
})();

