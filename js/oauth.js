var watchpocket = watchpocket || {};

watchpocket.getRequestToken = function() {
  chrome.tabs.query({active: true}, function(tabs) {
    if (tabs.length === 0) {
      console.error('no active tab found');
      return;
    }

    watchpocket.post(
      'https://getpocket.com/v3/oauth/request',
      JSON.stringify({
        'consumer_key' : watchpocket.consumerKey,
        'redirect_uri' : chrome.extension.getURL('auth.html') + '?token=MyLittlePinkPony&url=' + window.btoa(encodeURIComponent(tabs[0].url))
        })
      ).then(function(response) {
        oauthRequestToken = response.code;
        watchpocket.getAuthorization(response.code);
      }).done();
  });
};


watchpocket.getOauthAccessToken = function() {
  return getFromStorage('oauthAccessToken');
};

watchpocket.getAuthorization = function(requestToken) {
  chrome.tabs.query({active: true}, function(tabs) {
    if (tabs.length === 0) {
      console.error('no active tab found');
      return;
    }

    var url = [
      'https://getpocket.com/auth/authorize?request_token=',
      requestToken,
      '&redirect_uri=',
      encodeURIComponent(chrome.extension.getURL('auth.html') + '?token=MyLittlePinkPony&url=' + window.btoa(encodeURIComponent(tabs[0].url)))
    ].join('');

    chrome.tabs.update(tabs[0].id, {url:url}, function(){
      console.log('updated tab');
      // TODO(Tom): Close the popup.
    });
  });
};

watchpocket.getAccessToken = function() {
  return watchpocket.post(
    'https://getpocket.com/v3/oauth/authorize',
    JSON.stringify({
      'consumer_key' : watchpocket.consumerKey,
      'code'         : oauthRequestToken
    })
  )

  .then(function(response) {
    var oauthAccessToken = response.access_token;
    return saveToStorage('oauthAccessToken', oauthAccessToken)
      .then(function() {
        return oauthAccessToken;
      });
  });
};
