let $ = require("jquery");
let Q = require("q");
let _ = require("lodash");

var moment = require("moment");
var Minilog = require("minilog");
var oauth = require("./oauth");
var constants = require("./constants");

var watchpocket = watchpocket || {};

var log = Minilog('app');
Minilog.enable();

var oauthRequestToken = null;
var oauthAccessToken = null;

$.support.cors = true;

function post(url, data) {
  return makeRequest(url, 'POST', data);
}



function makeRequest(url, method, data) {
  if (_.isString(data)) {
    data = JSON.parse(data);
  }

  log.debug('makeRequest', url, method, data);

  return Q($.ajax({
    type: method,
    url: url,
    crossDomain: true,
    data: data,
    dataType: 'json'
  })).fail(function(err) {
    if (err.status === 401) {
      log.debug('authenticating...');
      oauth.getRequestToken();
    } else {
      log.error(err);
    }
    return Q.reject(err);
  }).then(response => {
    log.debug('makeRequest response',response);
    return response;
  });
}

watchpocket.add = function(url) {
  var params = {
    consumer_key: constants.consumerKey,
    url: url
  };

  return oauth.getOauthAccessToken()
    .then(function(oauthAccessToken) {
      params.access_token = oauthAccessToken;
    })
    .then(function() {
      return post(constants.pocket_api_endpoint + '/add', JSON.stringify(params));
    });
};
watchpocket.sendApiRequest = function (actions) {
  return oauth.getOauthAccessToken()
    .then(function(oauthAccessToken) {
      return makeRequest(constants.pocket_api_endpoint + '/send?actions=' +
        encodeURIComponent(JSON.stringify(actions)) +
        '&access_token=' + oauthAccessToken + '&consumer_key=' +
        constants.consumerKey, 'POST', null);
    });
};


watchpocket.articleView = function(url) {
  return makeRequest(constants.article_view_endpoint + '?consumer_key=' + constants.consumerKey +
    '&images=1&url=' + url + '&output=json', 'GET', null);
};

$(function() {
  var addToPocketMenuId = chrome.contextMenus.create({
    id: "pocketContextMenu",
    title: 'Add to Pocket',
    // 'all' would include 'selection' which is a text-only selection in Kitt
    // Doesn't make sense for Pocket URL-oriented function
    contexts : ['link', 'page'],
    enabled: true
  });

  chrome.contextMenus.onClicked.addListener(function(info) {
    if (info.menuItemId !== addToPocketMenuId) {
      return;
    }
    // linkUrl by chrome spec is applicable "when the element is a link"
    // therefore when the context menu is the sharing menu (context is the
    // whole webpage), linkUrl is not set and pageUrl holds the URL
    watchpocket.add(info.linkUrl || info.pageUrl);
  });

  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {

    log.debug('main: command received ' + request.command);

    switch (request.command) {

      case 'addBookmark':
        watchpocket.add(request.url).then(function() {
          sendResponse();
        }).done();
        return true;

      // used within articleViewToolbar
      case 'updateBookmarks':
        watchpocket.loadBookmarks({}, {updateCache: true}).then(function() {
          sendResponse();
        });
        return true;
      case 'modifyBookmark':
        var actions = [request.action]; // API requires an array of actions
        watchpocket.sendApiRequest(actions).then(function(response) {
          sendResponse(response);
        }).done();
        return true;

      case 'requestArticleView':
        watchpocket.articleView(request.url)
          .then(function(response) {
            sendResponse(response);
          })
          .done();
        return true;

      case 'getOauthRequestToken':
        sendResponse(null, oauthRequestToken);
        break;

      case 'getOauthAccessToken':
        oauth.getAccessToken()
          .then(function(token) {
            sendResponse(null, token);
          })
         .done();
        return true;

//      case 'wipeBookmarkCache':
//        watchpocket.wipeBookmarkCache();
//        sendResponse({text: 'cache wiped'});
//        return true;

      case 'archiveBookmark':
        console.log('THIS IS ARCHIVED', request.item_id);
        watchpocket.sendApiRequest([{action: 'archive', item_id: request.item_id}])
          .then(() => sendResponse(null))
          .fail((err)  => { log.error('archive error', err); sendResponse({error: err}); }).done();
        return true;

      case 'echo':
        var message = request.message;
        log.debug('echoed message: ', message);
        sendResponse({rest_response: JSON.stringify(message)});
        return true;

      // low-level cornerstone of the app -> the only function, used by bookmark class
      case 'sendAuthorizedPostRequest':
        oauth.getOauthAccessToken().then(function(token) {
          var params = _.extend({
            consumer_key: constants.consumerKey,
            access_token: token
          }, request.data);
          return post(request.url, params)
            .then(response => sendResponse(response), err => sendResponse({error: err}));
        }).done();
        return true;

      default:
        console.warn('unknown command: ' + JSON.stringify(request));
        break;
    }
  });
});

// debugging purposes only
window.post = post;
window.makeRequest = makeRequest;
