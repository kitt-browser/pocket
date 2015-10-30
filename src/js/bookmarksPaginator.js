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

  static parseDomain(url) {
    return url.match(/^((http[s]?|ftp):\/)?\/?([^:\/\s]+)(:([^\/]*))?/i)[3] || '';
  }
  // definitelly going to be refactored, I just want to get the release working ASAP
  static processItem(item) {
    // Real URL is preferably the resolved URL but could be the given URL
    let realURL = item.resolved_url || item.given_url;
    item.url = realURL;

    // Regular expression to parse out the domain name of the URL, or an empty string if something fails
    item.domain = BookmarksTransformer.parseDomain(item.url);
    // Fetches a icon from a great webservice which provides a default fallback icon
    item.icon = 'https://web-image.appspot.com/?url=' + realURL;

    item.tags = _.isObject(item.tags) ? Object.keys(item.tags) : [];

    item.title = item.resolved_title || item.given_title;

    item.time = {
      added: moment.unix(item.time_added),
      updated: moment.unix(item.time_updated),
      read: moment.unix(item.time_read),
      favorited: moment.unix(item.time_favorited)
    };

    item.favorite = parseInt(item.favorite) === 1;
    item.status = parseInt(item.status);

    return item;
  }
}

// their main responsibility is to handle pagination
class BookmarksPaginatorInterface {
  static getEndpoint() {
    return constants.pocket_api_endpoint + '/get';
  }


  static baseRequest(params) {
    return request(BookmarksPaginatorInterface.getEndpoint(), params);
  }

  getNextBookmarks(/* count */) {
    throw new Error('Not implemented');
  }

  reset() {
    throw new Error('Not implemented');
  }

}

class BaseBookmarksPaginator extends BookmarksPaginatorInterface {
  /**
   * @param requestParams specification of the API to be sent via /get
   */
    constructor(requestParams) {
    super();
    if (typeof requestParams !== 'object') {
      throw new Error('Need to pass original config');
    }
    this.requestParams = requestParams;
    this.requestParams.detailType = 'complete';

    this.offset = 0; // offset at which se send the following request
  }

  request(additionalParams) {
    let requestParams = _.extend( _.clone(this.requestParams), additionalParams);
    common.logging('request in bookmarksPaginator and params', requestParams);
    return BookmarksPaginatorInterface.baseRequest(requestParams);
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
}

class Cache {
  constructor(cacheName, shouldBeDeletedFunction, bookmarksPaginator) {
    // takes bookmark, returns boolean
    // status - 0, 1, 2 - 1 if the item is archived - 2 if the item should be deleted
    this.shouldBeDeleted = shouldBeDeletedFunction;
    this.bookmarksPaginator = bookmarksPaginator;

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
    return this.bookmarksPaginator.request({}).then(bookmarks => {
      let bookmarksSince = bookmarks.since;
      let bookmarksList = bookmarks.list;
      return common.saveToStorage(this.cacheItemsKey, bookmarksList)
        .then(() => common.saveToStorage(this.cacheTimestampKey, bookmarksSince));
    });
  }

  // may return a rejected promise!
  _checkBookmarksFromLastTime() {
    return common.getFromStorage(this.cacheTimestampKey)
      .then(timestamp => BookmarksPaginatorInterface.baseRequest({since: timestamp}))
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

class CachedBookmarksPaginator extends BookmarksPaginatorInterface {
  constructor(cacheName, bookmarksPaginator, shouldBeDeletedFunction) {
    super();
    this.cache = new Cache(cacheName, shouldBeDeletedFunction, bookmarksPaginator);
    this.reset();
  }

  reset() {
    this.cache.update();

    // once it gave the complete list of bookmarks (all the pages)
    // it doesn't have anything. (equivalent of giving the last page of bookmarks)
    // so from now can only refresh for changes
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

  wipeCache() {
    this.cache.wipe();
  }
}

let ArchivedBookmarksPaginator = new BaseBookmarksPaginator({state: 'archive'});
let UnreadBookmarksPaginator = new BaseBookmarksPaginator({state: 'unread'});
let FavoriteBookmarksPaginator = new BaseBookmarksPaginator({state: 'all', favorite: 1});

let UnreadCachedBookmarksPaginator = new CachedBookmarksPaginator('UnreadBMCache_',
  UnreadBookmarksPaginator, bookmark => bookmark.status > 0);

let SearchBookmarksPaginatorFactory = function(searchPhrase) {
  return new BaseBookmarksPaginator({state: 'unread', search: searchPhrase});
};

window.bookmarksPaginator =
  module.exports = {
    BookmarksTransformer,
    UnreadCachedBookmarksPaginator,
    FavoriteBookmarksPaginator,
    SearchBookmarksPaginatorFactory,
    ArchivedBookmarksPaginator,

    // for debugging purposes only
    UnreadBookmarksPaginator,
    request
  };
