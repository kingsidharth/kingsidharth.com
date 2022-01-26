
var dlSwitch = document.querySelector('#js-dl-switch');
var dlSwitchContent = document.querySelector('#js-dl-switch .switch--control');

var switchDarkMode = function() {
  document.body.className += ' dark';
  document.body.classList.remove('light');
  document.body.setAttribute('data-theme', 'dark');
  dlSwitch.setAttribute('data-theme', 'dark');
  dlSwitchContent.innerHTML = '🌞';
}

var switchLightMode = function() {
  document.body.className += ' light';
  document.body.classList.remove('dark');
  document.body.setAttribute('data-theme', 'light');
  dlSwitch.setAttribute('data-theme', 'light');
}


/*
  Detetec browser/device setting
*/

if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  switchDarkMode();
} else {
  switchLightMode();
}

/*
  Watch for changes to mode
*/
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
    const colorScheme = event.matches ? "dark" : "light";
    if (colorScheme == 'dark') {
      switchDarkMode();
    } else {
      switchLightMode();
    }
});

/*
  Custom Swtich
*/

dlSwitch.addEventListener('click', function(e) {
  if (e.target.getAttribute('data-theme') == 'dark') {
    switchLightMode();
  } else {
    switchDarkMode();
  }
})
