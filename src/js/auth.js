var $ = require('../vendor/jquery/jquery');

require('../css/auth.css');


var waitForChrome = function(callback) {
  if ( typeof(chrome) === 'undefined') {
    window.setTimeout(function() {
      waitForChrome(callback);
    }, 250);
    return;
  } else {
    callback();
  }
};

$(function() {
  waitForChrome(function() {

    var token = null;
    var url = null;

    var search = window.location.search;

    console.log('Search is' + search);

    if(search.length > 1 && search.charAt(0) == '?') {
      search = search.substr(1);
    }
    if (search.length > 0) {
      var terms = search.split("&");
      for(var i = 0; i < terms.length; i++) {
        var key = terms[i].split('=')[0];
        var value = terms[i].split('=')[1];

        if (key === 'token') {
          token = value;
        }
        if (key === 'url') {
          // This is only way, which I managed to get URL with symbols like (=,?,...) through login process
          url = decodeURIComponent(window.atob(value));
        }
      }
    }

    console.log('Response with ' + token + ' and ' + url);

    if (token === 'MyLittlePinkPony' && url) {
      chrome.runtime.sendMessage({command: 'getOauthRequestToken'}, function(err, reqToken) {
        chrome.runtime.sendMessage({command: 'getOauthAccessToken'}, function(err, accessToken) {
          if (err) {
            console.warn('Could not authenticate with pocket: ' + JSON.stringify(err));
            return;
          }
          console.log('Authentication to pocket successfull.');
          window.location.href = url;
        });
      });
    }
  });
});
