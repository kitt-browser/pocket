var common = require('./common');
var xhr = require("./xhr");
var constants = require("./constants");

var oauthRequestToken;

exports.getRequestToken = function() {
  chrome.tabs.query({active: true}, function(tabs) {
    if (tabs.length === 0) {
      console.error('no active tab found');
      return;
    }

    return xhr.post(
      'https://getpocket.com/v3/oauth/request',
      JSON.stringify({
        'consumer_key' : constants.consumerKey,
        'redirect_uri' : chrome.extension.getURL('html/auth.html') + 
          '?token=MyLittlePinkPony&url=' + 
          window.btoa(encodeURIComponent(tabs[0].url))
      })
    ).then(function(response) {
      oauthRequestToken = response.code;
      getAuthorization(response.code);
    }).done();
  });
};


exports.getOauthAccessToken = function() {
  return common.getFromStorage('oauthAccessToken');
};


var getAuthorization = function(requestToken) {
  chrome.tabs.query({active: true}, function(tabs) {
    if (tabs.length === 0) {
      console.error('no active tab found');
      return;
    }

    var url = [
      'https://getpocket.com/auth/authorize?request_token=',
      requestToken,
      '&redirect_uri=',
      encodeURIComponent(chrome.extension.getURL('html/auth.html') +
        '?token=MyLittlePinkPony&url=' +
        window.btoa(encodeURIComponent(tabs[0].url)))
    ].join('');

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
