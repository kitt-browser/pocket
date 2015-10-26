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
      if (response.error) {
        reject(response.error);
      } else if (chrome.runtime.lastError) {
        reject('Request didn\'t return valid result');
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
      tags: tags,
      status: parseInt(item.status)
    };
  }

}

// their main responsibility is to handle pagination
class BookmarksManagerInterface {
  constructor() {
    this.getEndpoint = constants.pocket_api_endpoint + '/get';
  }

  basicRequest(params) {
    return request(this.getEndpoint, params);
  }

  getNextBookmarks(/* count */) {
    throw new Error('Not implemented');
  }

  update() {
    throw new Error('Not implemented');
  }

  reset() {
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
    common.logging('request in bookmarksmanager and params', requestParams);
    return this.basicRequest(requestParams);
  }

  /**
   * Try to load at least |count| items.
   * @param count try to get |count new bookmarks|
   * @returns {*}
   */
  getNextBookmarks(count) {
    return this.request({count: count, offset: this.offset}).then(response => {
      this.offset += _.size(response.list);
      return response.list;
    });
  }

  reset() {
    this.offset = 0;
  }

  update() { }

  getRefreshUpdates(/*since*/) {
    // basic implementation doesn't cache anything, so no need to refresh stuff
    return Promise.reject({});
  }
}

class Cache {
  constructor(cacheName, shouldBeDeletedFunction, bookmarksManager) {
    // takes bookmark, returns boolean
    // status - 0, 1, 2 - 1 if the item is archived - 2 if the item should be deleted
    this.shouldBeDeleted = shouldBeDeletedFunction;
    this.bookmarksManager = bookmarksManager;

    this.cacheTimestampKey = cacheName + '_timestamp';
    this.cacheItemsKey = cacheName + '_items';
  }

  /**
   * Ensure, we have most up-to-date cache available.
   */
  update() {
    return common.getFromStorage(this.cacheItemsKey).then(items => {
      if (!items) { // download all items
        return this._loadBookmarksFromScratch();
      } else { // there are some items in the storage, just handle updates...
        return this._checkBookmarksFromLastTime();
      }
    });
  }

  _loadBookmarksFromScratch() {
    return this.bookmarksManager.request({}).then(bookmarks => {
      let bookmarksSince = bookmarks.since;
      let bookmarksList = bookmarks.list;
      return common.saveToStorage(this.cacheItemsKey, bookmarksList)
        .then(() => common.saveToStorage(this.cacheTimestampKey, bookmarksSince));
    });
  }

  // may return a rejected promise!
  _checkBookmarksFromLastTime() {
    return common.getFromStorage(this.cacheTimestampKey)
      .then(timestamp => this.bookmarksManager.basicRequest({since: timestamp}))
      .then(updateResponse => {
        common.logging('>>>update response', JSON.stringify(updateResponse));
        let updatedSince = updateResponse.since;
        let listOfUpdates = updateResponse.list;

        if (_.size(listOfUpdates) === 0) {
          return Promise.reject('No new updates.');
        } else {
          return common.saveToStorage(this.cacheTimestampKey, updatedSince)
            .then(() => common.getFromStorage(this.cacheItemsKey))
            .then(items => this._merger(items, listOfUpdates));
        }
      })
      .then(mergedBookmarks => common.saveToStorage(this.cacheItemsKey, mergedBookmarks));
      // TODO add .then(failed promise) -> when internet is down
  }

  get() {
    return common.getFromStorage(this.cacheItemsKey);
  }

  tryGetFresh() {
    return this.update().then(() => this.get(), () => this.get());
  }
  /**
   * @param bookmarksList object where key=bookmark_id, value=whole bookmark info
   * @param updateBookmarksList object where key=bookmark_id, value=whole bookmark info
   */
  _merger(bookmarksList, updateBookmarksList) {
    // common.logging('>>>merger originalList+updates:', bookmarksList, updateBookmarksList);
    if (_.isEmpty(bookmarksList)) {
      return updateBookmarksList;
    }
    if (_.isEmpty(updateBookmarksList)) {
      return bookmarksList;
    }

    let updateBookmarksArray = BookmarksTransformer.getBookmarksFromBookmarksList(updateBookmarksList);
    console.log(updateBookmarksArray);

    // 1.  update bookmarks
    updateBookmarksArray.forEach(updatedBookmark => {
      let itemId = updatedBookmark.item_id;
      bookmarksList[itemId] = updatedBookmark;
    });

    // 2. delete bookmarks
    let idsToDelete = updateBookmarksArray
      .filter(bookmark => this.shouldBeDeleted(bookmark))
      .map(bookmark => bookmark.item_id);
    console.log('idstodelete', idsToDelete);

    idsToDelete.forEach(idToDelete => {
      delete bookmarksList[idToDelete];
    });

    // common.logging('>>merger result', bookmarksList);
    return bookmarksList;
  }

  wipe() {
    return common.saveToStorage(this.cacheTimestampKey, null)
      .then(() => common.saveToStorage(this.cacheItemsKey, null));
  }
}

class CachedBookmarksManager extends BookmarksManagerInterface {
  constructor(cacheName, bookmarksManager, shouldBeDeletedFunction) {
    super();
    this.cache = new Cache(cacheName, shouldBeDeletedFunction, bookmarksManager);
    this.cache.update();

    // once it gave the complete list of bookmarks (all the pages)
    // it doesn't have anything. (equivalent of giving the last page of bookmarks)
    // so from now can only refresh for changes
    this.alreadyGivenBookmarks = false;
  }

  reset() {
    this.cache.update();
    this.alreadyGivenBookmarks = false;
  }

  getNextBookmarks(/* count */) { // always fetch everything
    if (this.alreadyGivenBookmarks) {
      return Promise.resolve({});
    } else {
      this.alreadyGivenBookmarks = true;
      return this.cache.tryGetFresh();
    }
  }

  // todo might delete
  update(/*since*/) {
    return this.cache.update();
  }

  wipeCache() {
    this.cache.wipe();
  }
}

let ArchivedBookmarksManager = new BaseBookmarksManager({state: 'archive'});
let UnreadBookmarksManager = new BaseBookmarksManager({state: 'unread'});
let FavoriteBookmarksManager = new BaseBookmarksManager({state: 'all', favorite: 1});

let UnreadCachedBookmarksManager = new CachedBookmarksManager('UnreadBMCache_', UnreadBookmarksManager, bookmark => bookmark.status > 0);

let SearchBookmarksManagerFactory = function(searchPhrase) {
  return new BaseBookmarksManager({state: 'unread', search: searchPhrase});
};

window.request = request;

window.bookmarksManager =
module.exports = {
  BookmarksTransformer,

  // future removal
  _,
  BaseBookmarksManager,
  CachedBookmarksManager,

  UnreadCachedBookmarksManager,

  FavoriteBookmarksManager,
  SearchBookmarksManagerFactory,
  UnreadBookmarksManager,
  ArchivedBookmarksManager
};
