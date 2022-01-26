import anime from 'animejs/lib/anime.es.js';
import emebed_youtube from './youtube.js';
import barba from '@barba/core';
import _ from 'lodash';



var elements = document.querySelectorAll('.js-animate-scroll');

/*
  Screen Entry Animation
*/
var screenEntry = function(element) {

  const dom_element = document.querySelector(element);

  if (dom_element && dom_element.getAttribute('data-animation-status') != 'done') {
    anime({
      targets: element,
      translateY: 140,
      opacity: 0,
      duration: 800,
      easing: 'easeInOutExpo',
      direction: 'reverse',
      endDelay: 500,
    });

    dom_element.setAttribute('data-animation-status', 'done');
  }

}

/*
  Is Visisble Observer
*/
var observer = new IntersectionObserver(function(entries) {
	// isIntersecting is true when element and viewport are overlapping
	// isIntersecting is false when element and viewport don't overlap
	if(entries[0].isIntersecting === true) {
    screenEntry('#'+entries[0].target.id);
  }
}, { threshold: [0] });


/*
  Animate Title
*/

var titleEntry = function(selector) {
  var title = document.querySelector(selector);

  if (!!title) {
    title.innerHTML = title.textContent.replace(/\S/g, "<span class='js-animate-letter'>$&</span>");

    return anime.timeline({loop: false}).add({
      targets: '#js-page-title .js-animate-letter',
      opacity: [0,1],
      easing: "easeInOutQuad",
      duration: 200,
      delay: (el, i) => 120 * (i+1)
    });
  }

}


/*
  Scene
*/
var animationSequence = function() {
  // Starts at every page transition

  screenEntry('#intro_area');
  emebed_youtube();
  _.map(elements, (element)=>{
    observer.observe(element);
    if (element.offsetTop < window.innerHeight) {
      screenEntry('#' + element.id)
    }
  })

  titleEntry('#js-page-title');

}

animationSequence();


/*
  Plug-in Barba for page change
*/
barba.init({
  transitions: [{
    name: 'default-transition',
    leave(data) {
      return anime({
        targets: '[data-barba="container"]',
        direction: 'reverse',
        opacity: 0,
        translateY: 140,
        during: 400,
        easing: 'easeInOutExpo',
      })

    },
    enter(data) {

      document.body.classList.remove(data.current.namespace);
      document.body.classList.add(data.next.namespace);
      animationSequence();
      close_navigation();

      return anime({
        targets: '[data-barba="container"]',
        direction: 'reverse',
        opacity: 0,
        translateY: 140,
        duration: 400,
        easing: 'easeInOutExpo',
      })
    }
  }]

});
