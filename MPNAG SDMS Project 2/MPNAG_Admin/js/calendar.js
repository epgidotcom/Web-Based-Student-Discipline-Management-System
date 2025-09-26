// Local storage helpers
const STORAGE_KEY = 'sdmsEvents';
const loadEvents = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};
const saveEvents = (arr) => localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));

// Elements
const addBtn = document.getElementById('addEventBtn');
const viewPicker = document.getElementById('viewPicker');
const typeFilter = document.getElementById('typeFilter');
const yearPicker = document.getElementById('yearPicker'); // ✅ Added Year Picker
const logoutBtn = document.getElementById('logoutBtn');

const modal = document.getElementById('eventModal');
const closeModalBtn = document.getElementById('closeEventModal');
const form = document.getElementById('eventForm');
const modalTitle = document.getElementById('eventModalTitle');
const deleteBtn = document.getElementById('deleteEventBtn');

const fId = document.getElementById('eventId');
const fTitle = document.getElementById('eventTitle');
const fType = document.getElementById('eventType');
const fStart = document.getElementById('eventStart');
const fEnd = document.getElementById('eventEnd');
const fDesc = document.getElementById('eventDesc');

let events = loadEvents();
let currentFilter = 'all';
let calendar;

// Seed some examples first time only so it’s never empty
if (events.length === 0) {
  events = [
    { id: crypto.randomUUID(), title: 'Tardiness Violation', type: 'violation', start: '2025-08-01T08:00', desc: '' },
    { id: crypto.randomUUID(), title: 'Improper Uniform Violation', type: 'violation', start: '2025-08-05T08:00', desc: '' },
    { id: crypto.randomUUID(), title: 'Cheating Violation', type: 'violation', start: '2025-08-10T08:00', desc: '' },
    { id: crypto.randomUUID(), title: 'School Sports Event', type: 'event', start: '2025-08-15T13:00', desc: '' },
    { id: crypto.randomUUID(), title: 'Quarterly Exams', type: 'exam', start: '2025-08-20T09:00', end: '2025-08-20T11:00', desc: '' }
  ];
  saveEvents(events);
}

document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('calendar');

  calendar = new FullCalendar.Calendar(el, {
    initialView: 'dayGridMonth',
    headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
    height: 'auto',
    selectable: true,
    selectMirror: true,
    navLinks: true,
    nowIndicator: true,
    eventDisplay: 'block',
    dayMaxEventRows: true,

    events: (info, success) => {
      const out = events
        .filter(e => currentFilter === 'all' || e.type === currentFilter)
        .map(e => ({
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end || null,
          extendedProps: { type: e.type, desc: e.desc || '' }
        }));
      success(out);
    },

    eventDidMount: (info) => {
      const t = info.event.extendedProps.type;
      info.el.style.borderRadius = '6px';
      info.el.style.border = 'none';
      if (t === 'exam') info.el.style.background = '#f59e0b';       // amber
      else if (t === 'violation') info.el.style.background = '#ef4444'; // red
      else info.el.style.background = '#43699c';                     // blue
    },

    select: (arg) => openModal({ start: toLocalDT(arg.start), end: arg.end ? toLocalDT(arg.end) : '' }),
    eventClick: (arg) => {
      const e = events.find(v => v.id === arg.event.id);
      if (!e) return;
      openModal(e, true);
    }
  });

  calendar.render();

  // ✅ Populate year picker (range: current year ±10)
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 10; y <= currentYear + 10; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currentYear) opt.selected = true;
    yearPicker.appendChild(opt);
  }

  // ✅ On year change, keep month & day
  yearPicker.addEventListener('change', () => {
    const selectedYear = parseInt(yearPicker.value, 10);
    const calendarDate = calendar.getDate();
    const newDate = new Date(calendarDate);
    newDate.setFullYear(selectedYear);
    calendar.gotoDate(newDate);
  });

  // Controls
  addBtn?.addEventListener('click', () => openModal());
  closeModalBtn?.addEventListener('click', () => toggleModal(false));
  viewPicker?.addEventListener('change', (e) => calendar.changeView(e.target.value));
  typeFilter?.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    calendar.refetchEvents();
  });

  // Save / Delete
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = {
      id: fId.value || crypto.randomUUID(),
      title: fTitle.value.trim(),
      type: fType.value,
      start: fStart.value,
      end: fEnd.value || null,
      desc: fDesc.value.trim()
    };
    if (!payload.title || !payload.start) return;

    const idx = events.findIndex(v => v.id === payload.id);
    if (idx === -1) events.push(payload); else events[idx] = payload;

    saveEvents(events);
    calendar.refetchEvents();
    toggleModal(false);
    window.dispatchEvent(new Event('sdms:data-changed'));
  });

  deleteBtn.addEventListener('click', () => {
    if (!fId.value) return;
    if (!confirm('Delete this event?')) return;
    events = events.filter(v => v.id !== fId.value);
    saveEvents(events);
    calendar.refetchEvents();
    toggleModal(false);
  });

  // Logout
  logoutBtn?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
});

// Helpers
function toLocalDT(dateObj) {
  const d = new Date(dateObj);
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getFullYear(), m = pad(d.getMonth() + 1), da = pad(d.getDate());
  const h = pad(d.getHours()), mi = pad(d.getMinutes());
  return `${y}-${m}-${da}T${h}:${mi}`;
}

function toggleModal(show) {
  modal.classList.toggle('open', !!show);
}

function openModal(data = {}, isEdit = false) {
  modalTitle.textContent = isEdit ? 'Edit Event' : 'Add Event';
  deleteBtn.classList.toggle('is-hidden', !isEdit);

  fId.value = data.id || '';
  fTitle.value = data.title || '';
  fType.value = data.type || 'event';
  fStart.value = data.start ? (data.start.includes('T') ? data.start : `${data.start}T08:00`) : '';
  fEnd.value = data.end || '';
  fDesc.value = data.desc || '';

  toggleModal(true);
}
