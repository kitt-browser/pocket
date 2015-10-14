/**
 * Created by tomasnovella on 10/5/15.
 */

/*jslint node: true */
'use strict';
let _ = require('lodash');
let constants = require("./constants");

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

    var id = item.item_id;
    // Regular expression to parse out the domain name of the URL, or an empty string if something fails
    var domain = realURL.match(/^((http[s]?|ftp):\/)?\/?([^:\/\s]+)(:([^\/]*))?/i)[3] || '';
    // Fetches a icon from a great webservice which provides a default fallback icon
    var icon = 'https://web-image.appspot.com/?url=' + realURL;

    var tags = _.isObject(item.tags) ? Object.keys(item.tags) : [];

    // Create a data object and push it to the items array
    return { // future TODO: Do not create separate object, only edit the fields in |item|.
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

    this.since = 0; // TODO it's incorrectly initialized
  }

  _retrieveBookmarksListWithUpdatedSince(requestParameters, shouldUpdateSince) {
    return request(this.getEndpoint, requestParameters)
      .then((response) => {
        if (shouldUpdateSince) { // TODO needs refactoring. When loading next page, ti doesnt update new items, so no need for since update
          this.since = response.since; // used only for refresh
        }
        return response.list;
      });
  }

  getBookmarksList(offset, count) {
    let newRequest = _.clone(this.baseRequest);
    newRequest = _.extend(newRequest, {count: count, offset: offset});
    return this._retrieveBookmarksListWithUpdatedSince(newRequest, !this.since); // when there is SINCE, do not update. on first try do update
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
}



class CachedBookmarksManager extends BaseBookmarksManager {
}

class ArchivedBookmarksManager extends BaseBookmarksManager {
  constructor() {
    super({state: 'archive'});
  }

  shouldBeDeleted(bookmark) {
    return parseInt(bookmark.status) !== 1; // if a bookmark is other than ARCHIVED
  }
}

class AllItemsBookmarksManager extends BaseBookmarksManager {
  constructor() {
    super({state: 'unread'});
  }

  shouldBeDeleted(bookmark) {
    return parseInt(bookmark.status) > 1; // either marked as 'archived', or 'to delete'
  }
}

class SearchBookmarksManager extends BaseBookmarksManager {
  constructor(searchPhrase) {
    super({state: 'all', search: searchPhrase});
  }

  // Violates the Liskov substitution principle, but I have no better idea so far...
  getRefreshUpdates() {
    return Promise.resolve({});
  }
}

class FavoriteBookmarksManager extends BaseBookmarksManager {
  constructor() {
    super({state: 'all', favorite: 1});
  }
}

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
  SearchBookmarksManager,
  AllItemsBookmarksManager,
  ArchivedBookmarksManager
};
