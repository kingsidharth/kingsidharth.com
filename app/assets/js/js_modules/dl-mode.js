import anime from 'animejs/lib/anime.es.js';
var dlSwitch = document.querySelector('a#js-dl-switch');
var dlSwitchContent = document.querySelector('#js-dl-switch .switch--control');

/*
  Emoji Definitions
*/

var modeEmoji = function(mode) {
  if (mode === 'dark') {
    return '🌚';
  } else {
    return '🌞';
  }
}


/* Reverse UNO */
var switchModeEmoji = function(emoji) {
  if (emoji === '🌞') {
    return '🌚';
  } else {
    return '🌞';
  }
}


var switchDarkMode = function() {
  document.body.className += ' dark';
  document.body.classList.remove('light');
  document.body.setAttribute('data-theme', 'dark');
  dlSwitch.setAttribute('data-theme', 'dark');
  dlSwitchContent.innerHTML = switchModeEmoji(modeEmoji('dark'));
}

var switchLightMode = function() {
  document.body.className += ' light';
  document.body.classList.remove('dark');
  document.body.setAttribute('data-theme', 'light');
  dlSwitch.setAttribute('data-theme', 'light');
  dlSwitchContent.innerHTML = switchModeEmoji(modeEmoji('light'));
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

var switchMode = function() {
  if (document.body.getAttribute('data-theme') == 'dark') {
    switchLightMode();
  } else {
    switchDarkMode();
  }
  return false
}

dlSwitch.addEventListener('click', function(e) {
  e.preventDefault();
  switchMode();
  return false
});

dlSwitch.addEventListener('mouseenter', e=> {
  var is_mode = document.body.getAttribute('data-theme');
  anime({
    target: '#js-dl-switch .switch--control',
    opacity: [0,1],
    translateY: [
      { value: 240, duration: 600 },
      { value: 120, duration: 600 },
      { value: 0, duration: 600 },
      { value: 120, duration: 600 },
      { value: 240, duration: 600 },
    ],
    easing: "easeInOutQuad",
    loop: true,
  });
});

dlSwitch.addEventListener('mouseleave', e=> {
  anime({
    target: '#js-dl-switch .switch--control',
    opacity: [1, 0],
    duration: 800,
    easing: "easeInOutQuad",
  });
});
