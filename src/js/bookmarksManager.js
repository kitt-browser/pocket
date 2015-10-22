/**
 * Created by tomasnovella on 10/5/15.
 */

/*jslint node: true */
'use strict';
let _ = require('lodash');
let constants = require("./constants");
let common = require('./common');

/**
 * Wrapper around ordinary request. Sends request with prefilled access token.
 * @param url String API endpoint
 * @param data JSON
 * @returns {Promise}
 */
function request(url, data) {
  return new Promise(function(resolve,reject){
    chrome.runtime.sendMessage(null, {
      command: 'sendAuthorizedPostRequest',
      url: url,
      data: data
    }, function(response) {
      if (chrome.runtime.lastError) {
        reject('Request didnt return valid result');
      } else {
        resolve(response);
      }
    });
  });
}

// util and helper functions. All of them static
var moment = require("moment");
class BookmarksTransformer {
  static getBookmarksFromBookmarksList(bookmarksList) {
    return Object.keys(bookmarksList).map(bookmarkId => bookmarksList[bookmarkId]);
  }
  static sortBookmarksByNewest(bookmarks) {
    return _.chain(bookmarks)
      // Sort by name and time.updated. It's a stable sort so we sort it two
      // times to make sure the items won't jump around as they're sorted
      // (which could happen if we were sorting just by time which is not
      // unique).
      .sortBy('item_id')
      .sortBy('time_updated')
      .reverse()
      .value();
  }

  // definitelly going to be refactored, I just want to get the release working ASAP
  static processItem(item) {
    // Real URL is preferably the resolved URL but could be the given URL
    var realURL = item.resolved_url || item.given_url;

    // If neither resolved or given URL the item isn't worthwhile showing
    if ( ! realURL || item.status > 1) {
      return null;
    }

    // Regular expression to parse out the domain name of the URL, or an empty string if something fails
    var domain = realURL.match(/^((http[s]?|ftp):\/)?\/?([^:\/\s]+)(:([^\/]*))?/i)[3] || '';
    // Fetches a icon from a great webservice which provides a default fallback icon
    var icon = 'https://web-image.appspot.com/?url=' + realURL;

    var tags = _.isObject(item.tags) ? Object.keys(item.tags) : [];

    // Create a data object and push it to the items array
    return { // future TODO: Do not create separate object, only edit the fields in |item|.
      item_id: item.item_id,
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
      tags: tags
      //status: parseInt(item.status)
    };
  }

}
class BookmarksManagerInterface {
  constructor() {
    this.getEndpoint = constants.pocket_api_endpoint + '/get';
  }
  getBookmarksList() {
    throw new Error('Not implemented');
  }
  getRefreshUpdates() {
    throw new Error('Not implemented');
  }
}

class BaseBookmarksManager extends BookmarksManagerInterface {
  /**
   * @param baseRequest specification of the API to be sent via /get
   */
  constructor(baseRequest) {
    super();
    if (typeof baseRequest !== 'object') {
      throw new Error('Need to pass original config');
    }
    this.baseRequest = baseRequest;
    this.baseRequest.detailType = 'complete';

    this.offset = 0; // offset at which se send the following request
  }

  request(additionalParams) {
    let requestParams = _.extend( _.clone(this.baseRequest), additionalParams);
    return request(this.getEndpoint, requestParams);
  }

  /**
   * Try to load at least |count| items.
   * @param count try to get |count new bookmarks|
   * @returns {*}
   */
  getBookmarksList(count) {
    return this.request({count: count, offset: this.offset}).then(response => {
      this.offset += _.size(response.list);
      return response.list;
    });
  }

  reset() {
    this.offset = 0;
  }

  getRefreshUpdates(/*since*/) {
    // basic implementation doesn't cache anything, so no need to refresh stuff
    return Promise.reject({});
  }
}

class CachedBookmarksManager extends BookmarksManagerInterface {
  constructor(bookmarksManager, shouldBeDeletedFunction) {
    super();

    this.bookmarksManager = bookmarksManager;

    // takes bookmark, returns boolean
    // status - 0, 1, 2 - 1 if the item is archived - 2 if the item should be deleted
    this.shouldBeDeleted = shouldBeDeletedFunction;



    // FIXME now its cache_BaseBookmarksManager_items ... use lodash->unique number generator
    let cachePrefix = 'cache_'+bookmarksManager.constructor.name.toString();
    this.cacheTimestampKey = cachePrefix + '_timestamp';
    this.cacheItemsKey = cachePrefix + '_items';

    // once it gave the complete list of bookmarks (all the pages)
    // it doesn't have anything. (equivalent of giving the last page of bookmarks)
    // so from now can only refresh for changes
    this.alreadyGivenBookmarks = false;
    this._init();
  }

  _init() {
    common.getFromStorage(this.cacheItemsKey).then(items => {
      if (!items) { // download all items
        return this.bookmarksManager.request({}).then(bookmarks => {
          let bookmarksSince = bookmarks.since;
          let bookmarksList = bookmarks.list;
          return common.saveToStorage(this.cacheItemsKey, bookmarksList)
            .then(() => common.saveToStorage(this.cacheTimestampKey, bookmarksSince));
        });
      } else { // there are some items in the storage, just handle updates...
        return this.refreshCache();
      }
    });
  }

  reset() {
    this.alreadyGivenBookmarks = false;
  }

  // may return a rejected promise!
  refreshCache() {
    return common.getFromStorage(this.cacheTimestampKey).then(timestamp => {
      return this.bookmarksManager.request({since: timestamp});
    }).then(updateResponse => {
      let updatedSince = updateResponse.since;
      let listOfUpdates = updateResponse.list;

      if (_.size(listOfUpdates) === 0) {
        return Promise.reject('No new updates.');
      } else {
        return common.saveToStorage(this.cacheTimestampKey, updatedSince)
          .then(() => common.getFromStorage(this.cacheItemsKey))
          .then(items => this.merger(items, listOfUpdates));
      }
    }).then(mergedBookmarks => common.saveToStorage(this.cacheItemsKey, mergedBookmarks));
  }

  getBookmarksList(/* count */) { // always fetch everything
    if (this.alreadyGivenBookmarks) {
      return Promise.resolve({});
    } else {
      this.alreadyGivenBookmarks = true;
      return common.getFromStorage(this.cacheItemsKey).then(items => {
        return items;
      });
    }
  }


  getRefreshUpdates(/*since*/) {
    // basic implementation doesn't cache anything, so no need to refresh stuff
    return this.refreshCache();
  }

  /**
   * @param bookmarksList object where key=bookmark_id, value=whole bookmark info
   * @param updates
   */
  merger(bookmarksList, updates) {
    if (_.isEmpty(bookmarksList)) {
      return updates;
    }
    if (_.isEmpty(updates)) {
      return bookmarksList;
    }

    let updatedBookmarks = BookmarksTransformer.getBookmarksFromBookmarksList(updates);
    let idsToDelete = updatedBookmarks
      .filter(bookmark => this.shouldBeDeleted(bookmark))
      .map(bookmark => bookmark.item_id);

    idsToDelete.forEach(idToDelete => {
      delete bookmarksList[idToDelete];
      delete updatedBookmarks[idToDelete];
    });

    updatedBookmarks.forEach(updatedBookmark => {
      let itemId = updatedBookmark.item_id;
      bookmarksList[itemId] = updatedBookmark;
    });

    return bookmarksList;
  }

  wipeCache() {
    return common.saveToStorage(this.cacheTimestampKey, null)
      .then(() => common.saveToStorage(this.cacheItemsKey, null));
  }
}

let ArchivedBookmarksManager = new BaseBookmarksManager({state: 'archive'});
let AllItemsBookmarksManager = new BaseBookmarksManager({state: 'unread'});
let FavoriteBookmarksManager= new BaseBookmarksManager({state: 'all', favorite: 1});

let UnreadCachedBookmarksManager = new CachedBookmarksManager(AllItemsBookmarksManager, bookmark => bookmark.status > 0);

let SearchBookmarksManagerFactory = function(searchPhrase) {
  return new BaseBookmarksManager({state: 'unread', search:searchPhrase});
};

window.request = request;

window.bookmarksManager =
module.exports = {
  _,
  BookmarksTransformer,

  UnreadCachedBookmarksManager,

  FavoriteBookmarksManager,
  SearchBookmarksManagerFactory,
  AllItemsBookmarksManager,
  ArchivedBookmarksManager
};
