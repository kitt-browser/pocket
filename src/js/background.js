var $ = require("jquery");
var Q = require("q");
var _ = require("underscore");
var moment = require("moment");
var Minilog = require("minilog");
var common = require("./common");
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
  });
}


//function processItem(item) {
//  // Real URL is preferably the resolved URL but could be the given URL
//  var realURL = item.resolved_url || item.given_url;
//
//  // If neither resolved or given URL the item isn't worthwhile showing
//  if ( ! realURL || item.status > 1) {
//    return null;
//  }
//
//  var id = item.item_id;
//  // Regular expression to parse out the domain name of the URL, or an empty string if something fails
//  var domain = realURL.match(/^((http[s]?|ftp):\/)?\/?([^:\/\s]+)(:([^\/]*))?/i)[3] || '';
//  // Fetches a icon from a great webservice which provides a default fallback icon
//  var icon = 'https://web-image.appspot.com/?url=' + realURL;
//
//  var tags = _.isObject(item.tags) ? Object.keys(item.tags) : [];
//
//  // Create a data object and push it to the items array
//  return { // future TODO: Do not create separate object, only edit the fields in |item|.
//    id: id,
//    url: realURL,
//    title: item.resolved_title || item.given_title,
//    excerpt: item.excerpt,
//    icon: icon,
//    domain: domain,
//    time: {
//      added: moment.unix(item.time_added),
//      updated: moment.unix(item.time_updated),
//      read: moment.unix(item.time_read),
//      favorited: moment.unix(item.time_favorited)
//    },
//    favorite: (parseInt(item.favorite) === 1),
//    tags: tags
//    //status: parseInt(item.status)
//  };
//}
//
//
//function loadCache(flags, opts) {
//
//  log.debug("Loading cache...");
//
//  return common.getFromStorage('items')
//
//    .then(function(_itemsCache) {
//      var itemsCache = _itemsCache || {};
//      var bookmarks = _.values(itemsCache);
//
//      log.debug('Cache loaded');
//
//      var shouldUpdateCache = flags.updateCache || opts.search || _.isEmpty(bookmarks) ||
//        bookmarks.length <= opts.offset;
//
//      if (shouldUpdateCache) {
//        log.debug("Will load bookmarks from server...");
//        return {cache: itemsCache, items: null};
//      } else {
//        var bookmarksByUpdateTime = _.chain(bookmarks)
//          // Sort by something unique first to ensure stability.
//          .sortBy('id')
//          // Sort by last update time.
//          .sortBy(function(b) {
//            return b.time.updated;
//          })
//          .reverse()
//          .value();
//
//        var result = bookmarksByUpdateTime.slice(opts.offset, opts.offset + opts.count);
//        log.debug("Loaded bookmarks from cache");
//        return {cache: itemsCache, items: result};
//      }
//    });
//}
//
//
//function loadBookmarksFromServer(opts, cache) {
//  log.debug('loading bookmarks from Pocket server.');
//  // TODO copied this whole chunk
//  return oauth.getOauthAccessToken().then(function(token) {
//    var params = _.extend({
//      consumer_key: constants.consumerKey,
//      access_token: token,
//      detailType: 'complete'
//    }, opts);
//
//    if ( opts.search || opts.hasOwnProperty('offset')) {
//      // Don't use `since` parameter, we're not interested only in changes.
//      return params;
//    }
//
//    return common.getFromStorage('lastUpdateTimestamp')
//
//      .then(function(timestamp) {
//        log.debug("last timestamp", timestamp);
//        if (timestamp) {
//          params.since = timestamp;
//        }
//        return params;
//      });
//  })
//
//  .then(function(params) {
//    var url = constants.pocket_api_endpoint + '/get';
//    log.debug('******request url and params', url, params);
//    return post(url, JSON.stringify(params));
//  })
//
//  .then(function(response) {
//    var list = response.list;
//      log.debug('***all retrieved items(1)', list);
//
//    var items = _.compact(_.map(list, processItem));
//
//    var removedIds = _.chain(list)
//      .values()
//      .filter(function(item) {
//        // Only return archived and read items.
//        var status = parseInt(item.status);
//        log.debug('**', status, typeof status);
//        return  status > 0; // TODO from zero originally
//      })
//      .pluck('item_id')
//      .value();
//
//    log.debug('removed ids', removedIds);
//
//    _.each(removedIds, function(id) {
//      // Remove archived/read items from cache.
//      delete cache[id];
//    });
//
//    _.each(items, function(item) {
//      // Save new/updated items to cache.
//      cache[item.id] = item;
//    });
//
//    log.debug('***all retrieved ITEMS(2)', items);
//
//      // Return a promise to store items and timestamp in the cache.
//    var allSaved = [
//      common.saveToStorage('items', cache)
//    ];
//    if ( ! opts.search) {
//      // Only store timestamp if we're not searching (otherwise we would miss
//      // updates because the filter filters them by the search string).
//      allSaved.push(
//        common.saveToStorage('lastUpdateTimestamp', response.since));
//    }
//
//    return Q.all(allSaved).then(function() {
//      return {
//        items: items,
//        removed: removedIds
//      };
//    });
//  });
//}
//
//
//watchpocket.loadBookmarks = function(opts, flags) {
//  // Preprocess arguments.
//  _.each(opts, function(val, key) {
//    if (_.isUndefined(val) || _.isNull(val)) {
//      delete opts[key];
//    }
//  });
//
//  log.debug('opts', opts, flags);
//
//  return loadCache(flags, opts)
//
//    .then(function(res) {
//      var cache = res.cache;
//      var bookmarks = res.items;
//
//      log.debug('cache loaded');
//
//      if (bookmarks) {
//        // Bookmarks were loaded from cache. Return them.
//        return {items: bookmarks};
//      } else {
//        // Either we were requested to update the cache or the offset is set and we
//        // haven't cached items starting at that offset yet.
//        return loadBookmarksFromServer(opts, cache);
//      }
//    });
//};

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

watchpocket.archive = function(itemId) {
  return watchpocket.sendApiRequest([{action: 'archive', item_id: itemId}])
    .then(function() {
      return common.getFromStorage('items');
    })
    .then(function(items) {
      delete items[itemId];
      return common.saveToStorage('items', items);
    });
};

watchpocket.articleView = function(url) {
  return makeRequest(constants.article_view_endpoint + '?consumer_key=' + constants.consumerKey +
    '&images=1&url=' + url + '&output=json', 'GET', null);
};

//watchpocket.wipeBookmarkCache = function() {
//  return common.saveToStorage('items', null).then(function() {
//    return common.saveToStorage('lastUpdateTimestamp', null);
//  }).then(function() {
//    log.debug('wiping cache');
//    return true;
//  });
//};

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



      case 'getBookmark':
        common.getFromStorage('items').then(function(items) { //TODO
          console.log('!found in storage', items[request.id]);
          sendResponse(items[request.id]);
        });
        return true;

//      case 'loadBookmarks':
//        watchpocket.loadBookmarks(request.opts, request.flags)
//          .then(function(items) {
//            sendResponse(items);
//          }, function(err) {
//            sendResponse(null);
//          })
//          .done();
//        return true;

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
        watchpocket.archive(request.id).then(function() {
          sendResponse(null);
        }).fail(function(err) {
          log.error('archive error', err);
          sendResponse({error: err});
        }).done();
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
            access_token: token,
          }, request.data);
          return post(request.url, params).then(response => sendResponse(response));
        }).done();
        return true;

      default:
        console.warn('unknown command: ' + JSON.stringify(request));
        break;
    }
  });
});
