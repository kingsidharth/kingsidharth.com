
var emebed_youtube = function() {
  var youtube = document.querySelectorAll( ".youtube" );
  for (var i = 0; i < youtube.length; i++) {

  let source = "https://img.youtube.com/vi/"+ youtube[i].dataset.embed;
  let image = new Image();
    image.src = source + "/sddefault.jpg";
    image.addEventListener( "load", function() {
      youtube[ i ].appendChild( image );
      if( image.naturalWidth < 220 ) {
        image.setAttribute("src", source + "/hqdefault.jpg");
      }
    }( i ) );

    youtube[i].addEventListener( "click", function() {

      let iframe = document.createElement( "iframe" );
      iframe.setAttribute( "frameborder", "0" );
      iframe.setAttribute( "allowfullscreen", "" );
      iframe.setAttribute( "src", "https://www.youtube.com/embed/"+ this.dataset.embed +"?rel=0&showinfo=0&autoplay=1" );
      this.innerHTML = "";
      this.appendChild( iframe );

      _trackEvent('Video', 'Play', youtube[i].dataset.embed);
      fbq('track', 'Video', {
        content_category: 'Video',
        content_ids: [youtube[i].dataset.embed],
        content_type: 'video',
      });
    } );
  };
}

module.exports = emebed_youtube;
