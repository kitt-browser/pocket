
var waitForChrome = function(callback) {
  if ( typeof(chrome) === 'undefined') {
    setTimeout(function() {
      waitForChrome(callback);
    }, 250);
    return;
  } else {
    callback();
  }
}
$(function() {
  waitForChrome(function() {
    if (location.search == '?secret=MyLittlePinkPony') {
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
