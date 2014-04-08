var common = require('./common');
var xhr = require("./xhr");
var constants = require("./constants");

exports.getRequestToken = function() {
  return xhr.post(
    'https://getpocket.com/v3/oauth/request',
    JSON.stringify({
      'consumer_key' : constants.consumerKey,
      'redirect_uri' : chrome.extension.getURL('html/auth.html') + '?secret=MyLittlePinkPony'
    })
  ).then(function(response) {
    oauthRequestToken = response.code;
    getAuthorization(response.code);
  });
};


exports.getOauthAccessToken = function() {
  return common.getFromStorage('oauthAccessToken');
};

var getAuthorization = function(requestToken) {
  var url = [
    'https://getpocket.com/auth/authorize?request_token=',
    requestToken,
    '&redirect_uri=',
    chrome.extension.getURL('html/auth.html') + '?secret=MyLittlePinkPony'
  ].join('');

  chrome.tabs.query({active: true}, function(tabs) {
    if (tabs.length === 0) {
      console.error('no active tab found');
      return;
    }
    chrome.tabs.update(tabs[0].id, {url:url}, function(){
      console.log('updated tab');
      // TODO(Tom): Close the popup.
    });
  });
};

exports.getAccessToken = function() {
  return xhr.post(
    'https://getpocket.com/v3/oauth/authorize',
    JSON.stringify({
      'consumer_key' : constants.consumerKey,
      'code'         : oauthRequestToken
    })
  )

  .then(function(response) {
    var oauthAccessToken = response.access_token;
    return common.saveToStorage('oauthAccessToken', oauthAccessToken)
      .then(function() {
        return oauthAccessToken;
      });
  });
};
