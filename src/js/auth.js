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
    if (window.location.search == '?secret=MyLittlePinkPony') {
      chrome.runtime.sendMessage({command: 'getOauthRequestToken'}, function(err, reqToken) {
        chrome.runtime.sendMessage({command: 'getOauthAccessToken'}, function(err, accessToken) {
          if (err) {
            console.warn('Could not authenticate with pocket: ' + JSON.stringify(err));
            return;
          }
          console.log('Authentication to pocket successfull.');
        });
      });
    }
  });
});
