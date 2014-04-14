var $ = require("../vendor/jquery/jquery");
var Q = require("../vendor/q/q");
var _ = require("../vendor/underscore/underscore");
var moment = require("../vendor/moment/moment");
var Minilog = require("../../node_modules/minilog");
var common = require("./common");
var xhr = require("./xhr");
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
      console.log('authenticating...');
      oauth.getRequestToken();
    } else {
      log.error(err);
    }
    return Q.reject(err);
  });
}


function processItem(item) {
  // Real URL is preferably the resolved URL but could be the given URL
  var realURL = item.resolved_url || item.given_url;

  // If neither resolved or given URL the item isn't worthwhile showing
  if ( ! realURL || item.status > 0) {
    return null;
  }

  var id = item.item_id;
  // Regular expression to parse out the domain name of the URL, or an empty string if something fails
  var domain = realURL.match(/^((http[s]?|ftp):\/)?\/?([^:\/\s]+)(:([^\/]*))?/i)[3] || '';
  // Fetches a icon from a great webservice which provides a default fallback icon
  var icon = 'https://web-image.appspot.com/?url=' + realURL;

  // Create a data object and push it to the items array
  return {
    id: id,
    url: realURL,
    title: item.resolved_title || item.given_title,
    excerpt: item.excerpt,
    icon: icon,
    domain: domain,
    time: {
      added: moment.unix(item.time_added),
      updated: moment.unix(item.time_updated),
      read: moment.unix(item.time_read),
      favorited: moment.unix(item.time_favorited)
    },
    favorite: (parseInt(item.favorite) === 1),
    //status: parseInt(item.status)
  };
}


function loadCache(flags, opts) {

  log.debug("Loading cache...");

  return common.getFromStorage('items')

    .then(function(_itemsCache) {
      var itemsCache = _itemsCache || {};
      var bookmarks = _.values(itemsCache);

      log.debug('Cache loaded');

      if ( ! flags.updateCache && ! opts.search && ! _.isEmpty(bookmarks) &&
          bookmarks.length > opts.offset) {
        // Load bookmarks from cache.
        var bookmarksByUpdateTime = _.sortBy(bookmarks, function(b) {
          return b.time.updated;
        });
        bookmarksByUpdateTime = bookmarksByUpdateTime.reverse();
        var result = bookmarksByUpdateTime.slice(opts.offset, opts.offset + opts.count);

        log.debug("Loaded bookmarks from cache");

        return {cache: itemsCache, items: result};
      }

      log.debug("Will load bookmarks from server...");

      return {cache: itemsCache, items: null};
    });
}


function loadBookmarksFromServer(opts, cache) {
  log.debug('loading bookmarks from Pocket server.');

  return oauth.getOauthAccessToken().then(function(token) {
    var params = _.extend({
      consumer_key: constants.consumerKey,
      access_token: token
    }, opts);

    if ( ( opts.search && ! opts.offset) ) {
      // Don't use `since` parameter, we're not interested only in changes.
      return params;
    }

    return common.getFromStorage('lastUpdateTimestamp')

      .then(function(timestamp) {
        log.debug("last timestamp", timestamp);
        if (timestamp) {
          params.since = timestamp;
        }
        return params;
      });
  })

  .then(function(params) {
    return post('https://getpocket.com/v3/get', JSON.stringify(params));
  })

  .then(function(response) {
    var list = response.list;
    var items = _.compact(_.map(list, processItem));

    var removedIds = _.chain(list)
      .values()
      .filter(function(item) {
        // Only return archived and read items.
        return (item.status > 0);
      })
      .pluck('item_id')
      .value();

    console.log('removed ids', removedIds);

    _.each(removedIds, function(id) {
      // Remove archived/read items from cache.
      delete cache[id];
    });

    _.each(items, function(item) {
      // Save new/updated items to cache.
      cache[item.id] = item;
    });

    // Return a promise to store items and timestamp in the cache.
    var allSaved = Q.all([
      common.saveToStorage('items', cache), 
      common.saveToStorage('lastUpdateTimestamp', response.since)
    ]);

    return allSaved.then(function() {
      return {
        items: items,
        removed: removedIds
      };
    });
  });
}


watchpocket.loadBookmarks = function(opts, flags) {
  // Preprocess arguments.
  _.each(opts, function(val, key) {
    if (_.isUndefined(val) || _.isNull(val)) {
      delete opts[key];
    }
  });

  log.debug('opts', opts, flags);

  return loadCache(flags, opts)
    
    .then(function(res) {
      var cache = res.cache;
      var bookmarks = res.items;

      log.debug('cache loaded');

      if (bookmarks) {
        // Bookmarks were loaded from cache. Return them.
        return {items: bookmarks};
      } else {
        // Either we were requested to update the cache or the offset is set and we
        // haven't cached items starting at that offset yet.
        return loadBookmarksFromServer(opts, cache);
      }
    });
};


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
      return post('https://getpocket.com/v3/add', JSON.stringify(params));
    })
    .then(function() {
      return watchpocket.loadBookmarks({}, {updateCache: true});
    });
};


watchpocket.archive = function(itemId) {
  return oauth.getOauthAccessToken()
    
    .then(function(oauthAccessToken) {
      return makeRequest('https://getpocket.com/v3/send?actions=' + 
        encodeURIComponent(JSON.stringify([{action: 'archive', item_id: itemId}])) +
        '&access_token=' + oauthAccessToken + '&consumer_key=' + 
        constants.consumerKey, 'POST', null);
    })

    .then(function() {
      return common.getFromStorage('items');
    })

    .then(function(items) {
      delete items[itemId];
      return items;
    })

    .then(function(items) {
      return common.saveToStorage('items', items);
    });
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

      case 'loadBookmarks':
        watchpocket.loadBookmarks(request.opts, request.flags)
          .then(function(items) {
            sendResponse(items);
          }, function(err) {
            sendResponse(null);
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

      case 'wipeBookmarkCache': 
        common.saveToStorage('items', null).then(function() {
          common.saveToStorage('lastUpdateTimestamp', null);
        });
        return true;

      case 'archiveBookmark':
        watchpocket.archive(request.id).then(function() {
          console.log('successfully archived');
          sendResponse(null);
        }).fail(function(err) {
          log.error('archive error', err);
          sendResponse({error: err});
        }).done();
        return true;

      default:
        console.warn('unknown command: ' + JSON.stringify(request));
        break;
    }
  });
});

module.exports = {
  watchpocket: watchpocket
};
