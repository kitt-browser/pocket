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

  getRefreshUpdates(/*since*/) {
    // basic implementation doesn't cache anything, so no need to refresh stuff
    return Promise.resolve({});
  }
}

class CachedBookmarksManager extends BookmarksManagerInterface {
  constructor(bookmarksManager) {
    super();

    this.bookmarksManager = bookmarksManager;

    let cachePrefix = 'cache_'+bookmarksManager.constructor.name.toString(); // FIXME everything comes from the same class, be it all/archive/unread/...!!!
    this.cacheTimestampKey = cachePrefix + '_timestamp';
    this.cacheItemsKey = cachePrefix + '_items';
  }

  getBookmarksList(count) {
    common.getFromStorage(this.cacheItemsKey).then(items => {
      if (items) { // TODO rethink -
        // load since last |since| and merge into cache
        common.getFromStorage(this.cacheTimestampKey).then(timestamp => {
          return this.bookmarksManager.request({since: timestamp});
        }).then(updateResponse => {
          let updatedSince = updateResponse.since;
          let listOfUpdates = updateResponse.list;
          return common.saveToStorage(this.cacheTimestampKey, updatedSince)
            .then(() => common.getFromStorage(this.cacheItemsKey))
            .then(items => this.merger(items, listOfUpdates));
        }).then(newBookmarks => { // TODO optimization opportunity: return merged and save back as promise
              return this.bookmarksManager.request({offset: _.size(newBookmarks), count: count})
                .then(newItemsResponse =>  this.merger(newBookmarks, newItemsResponse.list));
        }).then(newBookmarks =>common.saveToStorage(this.cacheItemsKey, newBookmarks))
          .then(() => common.getFromStorage(this.cacheItemsKey));
      } else { // empty cache
        // load |count| and save into cache
        return this.bookmarksManager.request({offset: 0, count: count}).then(response => {
          common.saveToStorage(this.cacheItemsKey, response.list)
            .then(() => common.saveToStorage(this.cacheTimestampKey, response.since));
          return response.list;
        });
      }
    });
  }

  /**
   * Loads all the refresh updates. Requires that getBookmarks be called before. (thus this.since be set)
   * @returns {*}
   */
  getRefreshUpdates() {
    let newRequest = _.clone(this.baseRequest);
    if (this.since) {
      newRequest = _.extend(newRequest, {since: this.since});
      // if not since -> there was no 'nextPage' call -> list is empty,do not do anything
      return this._retrieveBookmarksListWithUpdatedSince(newRequest, true);
    } else {
      throw new Error('Calling refresh on an empty list');
    }
  }

  // status - 0, 1, 2 - 1 if the item is archived - 2 if the item should be deleted
  shouldBeDeleted(/* bookmark */) {
    throw new Error('Not implemented the |shouldBeDeleted| method');
  }

  /**
   * ?? TODO can be used both in refresh updates and nextpage(secondarily)
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
  }

  wipeCache() {
    return common.saveToStorage(this.cacheTimestampKey, null)
      .then(() => common.saveToStorage(this.cacheItemsKey, null));
  }
}

let ArchivedBookmarksManager = new BaseBookmarksManager({state: 'archive'});
let AllItemsBookmarksManager = new BaseBookmarksManager({state: 'unread'});
let FavoriteBookmarksManager= new BaseBookmarksManager({state: 'all', favorite: 1});

let SearchBookmarksManagerFactory = function(searchPhrase) {
  return new BaseBookmarksManager({state: 'unread', search:searchPhrase});
};

// !!!! ****** CACHE IFF REFRESHABLE TODO TODO TODO TODO




/////// test
//let myBookmarks = [];//...
//let panel = new ArchivedBookmarksPanel();
//
//// all are promises
//panel.updateWithNextPage(myBookmarks)   .then(()=>$scope.$apply()); // or something like that...
//
//
//panel._getNextPage(myBookmarks.length).then((nextPageBookmarks)=> {
//  myBookmarks = panel.merger(myBookmarks, nextPageBookmarks); // idea: special merger should be used only with refresher
//});
//let since = 0; // get from cache
//
//panel.getRefreshUpdates(since).then(updates=> {
//  myBookmarks = panel.merger(myBookmarks, nextPageBookmarks); // idea: special merger should be used only with refresher
//});
//either way i must use some caching at least for the new itens.
// !idea -> MergerPanel extends BasePanel -> adds updateWith.... -> makes syntactic sugar + handles cache
// + handles offset,...
// do I need cache at all? don't think so..
//panel.updateWithRefresh(myBookmarks); // output arguments
// what f merger DID NOT belong to the class? (was purely static?)
//myBookmarks = ArchivedBookmarksPanel.merger() //--> should not work - EXA said so!!!!
// static hierarchy calling should not work anywhere... bcs merger calls shouldBeDeleted
//
//
//class BookmarksCacheUpdater {
//  constructor({requestorPanel: panel, list:bookmarksList, prefix: prefix}) {
//    this.offset = 0;
//    this.bookmarksList = bookmarksList;
//  }
//  refreshUpdate() {
//    let self = this; // todo delete? labmda hacks it all
//    return getFromStorage(this.prefix+'since').then(since => {
//      panel.getRefreshUpdates(since).then(updates => {
//        this.bookmarksList = panel.merger(this.bookmarksList);
//      });
//    });
//  }
//
//}

// if I'm in archived bookmarks, then returning update with status=archived is ok
// otherwise both archived and deleted mean delete... implement a method in class to decide fi
window.request = request;

window.bookmarksManager =
module.exports = {
  _,
  BookmarksTransformer,

  // base classes we derive from. Possibly we shouldn't even export them
  CachedBookmarksManager,
  BaseBookmarksManager,

  FavoriteBookmarksManager,
  SearchBookmarksManagerFactory,
  AllItemsBookmarksManager,
  ArchivedBookmarksManager
};
