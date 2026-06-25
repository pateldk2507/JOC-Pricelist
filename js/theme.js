const myNav = document.getElementById('myNav');
const themeToggle = document.getElementById('themeToggle');

// Load theme from localStorage or default to day mode
let isNight = localStorage.getItem('theme') === 'night';

function applyTheme() {
  if (isNight) {
    document.body.classList.remove('day-mode');
    document.body.classList.add('night-mode');
    themeToggle.classList.remove('btn-outline-dark');
    themeToggle.classList.add('btn-outline-light');
    myNav.classList.remove('navbar-light', 'bg-light');
    myNav.classList.add('navbar-dark', 'bg-dark');
    themeToggle.innerHTML = '🌙 Mode';
  } else {
    document.body.classList.remove('night-mode');
    document.body.classList.add('day-mode');
    themeToggle.classList.remove('btn-outline-light');
    themeToggle.classList.add('btn-outline-dark');
    myNav.classList.remove('navbar-dark', 'bg-dark');
    myNav.classList.add('navbar-light', 'bg-light');
    themeToggle.innerHTML = '☀️ Mode';
  }
}

// Apply theme on page load
applyTheme();

themeToggle.addEventListener('click', function () {
  isNight = !isNight;
  localStorage.setItem('theme', isNight ? 'night' : 'day');
  applyTheme();
});