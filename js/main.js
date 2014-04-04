var watchpocket = watchpocket || {};

var log = Minilog('app');
Minilog.enable();

var oauthRequestToken = null;
var oauthAccessToken = null;


watchpocket.consumerKey = '24728-138a886505ed5955209803d6';


watchpocket.post = function (url, data) {
  var defer = Q.defer();

  var xhr = new XMLHttpRequest();
  xhr.onerror = function(err) {
    log.debug('XMLHttpRequest error: ' + err);
    if (this.status === 401) {
      log.debug('HTTP 401 returned');
      watchpocket.getRequestToken();
      defer.reject({code: 401});
    }
  };

  xhr.onreadystatechange = function () {
    //log.debug('ready state change, state:' + xhr.readyState + ' ' + xhr.status);
    if (xhr.readyState === 4 && xhr.status === 200) {
      defer.resolve(JSON.parse(xhr.responseText));
    } else if (this.readyState === 4 && this.status === 401) {
      log.debug('HTTP 401 returned');
      watchpocket.getRequestToken();
      defer.reject({code: 401});
    }
  };

  xhr.open('POST', url, true);
  xhr.setRequestHeader("Content-type", "application/json; charset=utf-8");
  xhr.setRequestHeader("X-Accept", "application/json");
  xhr.send(data || null);

  log.debug('HTTP req sent to', url, data);

  return defer.promise;
};


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


watchpocket.loadBookmarks = function(opts, flags) {
  // Preprocess arguments.
  _.each(opts, function(val, key) {
    if (_.isUndefined(val) || _.isNull(val)) {
      delete opts[key];
    }
  });

  log.debug('opts', opts, flags);

  return getFromStorage('items').then(function(_itemsCache) {
    var itemsCache = _itemsCache || {};
    var bookmarks = _.values(itemsCache);
    log.debug('cached bookmarks', bookmarks.length);

    if ( ! flags.updateCache && ! opts.search && bookmarks.length > 0 && bookmarks.length > opts.offset) {
      log.debug('loading bookmarks from cache', opts, bookmarks.length);
      var bookmarksByUpdateTime = _.sortBy(bookmarks, function(b) {return b.time.updated}).reverse();
      log.debug('bookmarksByUpdateTime', bookmarksByUpdateTime.length, _.pluck(_.pluck(bookmarksByUpdateTime, 'time'), 'updated'));
      var result = bookmarksByUpdateTime.slice(opts.offset, opts.offset + opts.count);
      log.debug('result', result.length, _.pluck(_.pluck(result, 'time'), 'updated'));
      return {items: result};
    }

    log.debug('loading bookmarks from Pocket server.');

    // Either we were requested to update the cache or the offset is set and we
    // haven't cached items at that offset yet.
    return watchpocket.getOauthAccessToken()

      .then(function(token) {
        var params = _.extend({
          consumer_key: watchpocket.consumerKey,
          access_token: token
        }, opts);
        if ( ! opts.offset && bookmarks.length > 0 && ! opts.search) {
          // Only use 'since' timestamp if we're refreshing or when it's the
          // first page load (we wouldn't load the whole list otherwise). Don't
          // use it when we search.
          return getFromStorage('lastUpdateTimestamp').then(function(timestamp) {
            if (timestamp) {
              params.since = timestamp;
            }
            return params;
          });
        } else {
          return params;
        }
      })

      .then(function(params) {
        log.debug('params', params);
        return watchpocket.post('https://getpocket.com/v3/get', JSON.stringify(params));
      })

      .then(function(response) {
        var list = response.list;
        var items = _.compact(_.map(list, processItem));
        var removedIds = _.chain(list)
          .values()
          .filter(function(item) {
            return (item.status > 0)
          })
          .pluck('item_id')
          .value()

        //log.debug('response', response, removedIds);

        console.log("Items to remove: ", removedIds);

        console.log("Items to add: ", items);

        _.each(removedIds, function(id) {
          // Remove items from cache
          delete itemsCache[id];
        });
        _.each(items, function(item) {
          itemsCache[item.id] = item;
        });



        //log.debug('cache', itemsCache);

        // Return a promise to store items in cache.
        return saveToStorage('items', itemsCache)
          .then(function() {
            // Save the timestamp so that we know where to start next time we
            // request items.
            return saveToStorage('lastUpdateTimestamp', response.since)
          })
          .then(function() {
            log.debug('items', _.pluck(items, 'time.updated'));
            return {
              items: items,
              removed: removedIds
            }
          });
        })
      });
  };


watchpocket.add = function(url) {
  var params = {
    consumer_key: watchpocket.consumerKey,
    url: url
  };

  return watchpocket.getOauthAccessToken()
    .then(function(oauthAccessToken) {
      params.access_token = oauthAccessToken;
    })
    .then(function() {
      return watchpocket.post('https://getpocket.com/v3/add', JSON.stringify(params));
    })
    .then(function() {
      return watchpocket.loadBookmarks({}, {updateCache: true});
    })
    .fail(function(error) {
      console.log(error);
    });
};

watchpocket.send = function(method, id) {
  var params = {
    consumer_key: watchpocket.consumerKey,
    access_token: localStorage.oAuthAccessToken,
    actions: [{'action': method, 'item_id': id}]
  };
  return watchpocket.post('https://getpocket.com/v3/send', JSON.stringify(params));
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
            if (err.code === 401) {
              sendResponse(null);
            }
          })
          .done();
        return true;

      case 'getOauthRequestToken':
        sendResponse(null, oauthRequestToken);
        break;

      case 'getOauthAccessToken':
        watchpocket.getAccessToken()
          .then(function(token) {
            sendResponse(null, token);
          })
         .done();
        return true;

      case 'wipeBookmarkCache':
        saveToStorage('items', null).then(function() {
          saveToStorage('lastUpdateTimestamp', null);
        })
        return true;

      default:
        console.warn('unknown command: ' + JSON.stringify(request));
        break;
    }
  });
});
