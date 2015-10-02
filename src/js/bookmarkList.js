var _ = require('underscore');
require('ionic-framework');

require('../../node_modules/ionic-framework/release/css/ionic.css');
require('../vendor/animate.css/animate.css');
require('../css/pocket.css');

var Minilog = require('minilog');
var common = require('./common');

var log = Minilog('app');
Minilog.enable();

function logging(message) {
  chrome.runtime.sendMessage(null, {
    command: "echo",
    message: message
  }, function(response) {
    log.debug(message); // in fact it logs into popup window console. which is inconvenient to open....
  });
}

logging('THIS WORKS');

var CLEAN_CACHE_SEARCH_STRING = 'salsa:ccache';

function isMobile() {
  return window.navigator.userAgent.indexOf('Mobile') !== -1;
}
window.angular.module('pocket', [
  'ionic'
])

.controller('bookmarksCtrl', function($scope, $ionicLoading) {
  if (!isMobile()) { // for debugging purposes
    document.body.style.width = '400px';
    document.body.style.height = '400px';
  }

  var searchDelayMs = 700;

  $scope.bookmarks = [];
  $scope.allResultsFetched = false;
  $scope.pagePocketed = false;

  $scope.$watch('bookmarks', function(newVal, oldVal) {
    if (newVal !== oldVal && newVal === []) {
      //$scope.allResultsFetched = false; // TODO
      //$scope.loadNextPage();
    }
    // Change add button to article view if page has already been pocketed
    // or back to add button if it has been removed
    common.getActiveTab().then(function(tab) {
      var item = _.findWhere($scope.bookmarks, {url: tab.url});
      if (item && !$scope.pagePocketed) {
        document.getElementById('add-or-article-view').setAttribute('class', 'button ion-ios7-paper');
      }
      else if (!item && $scope.pagePocketed) {
        document.getElementById('add-or-article-view').setAttribute('class', 'button ion-ios7-plus');
      }
      $scope.pagePocketed = !!item;
    });
  }, true);

  $scope.loadNextPage = function() {
    loadBookmarks({}, {}, function() {
      $scope.$broadcast('scroll.infiniteScrollComplete');
    });
  };

  var onSearch = _.debounce(function() {
    $scope.bookmarks = [];
    $scope.loadNextPage();
  }, searchDelayMs);

  $scope.$watch('searchText', function(newVal, oldVal) {
    if (newVal !== oldVal) {
      onSearch();
    }
    if (newVal === CLEAN_CACHE_SEARCH_STRING) {
      $scope.wipeCache();
    }
  });

  $scope.onRefresh = function() {
    logging('update on refresh!');
    loadBookmarks({
      offset: 0,
      count: null,
      sort: null,
      state: null
    }, {
      updateCache: true
    }, function() {
        $scope.$broadcast('scroll.refreshComplete');
    });
  };

  function freshLoadBookmarks(requestOptions) {
    $scope.bookmarks = [];
    $scope.wipeCache(function() {
      loadBookmarks(requestOptions, {
        updateCache: true
      }, function() {
        //$scope.$apply();
      });
    });
  }

  $scope.loadArchivedBookmarks = function() {
    freshLoadBookmarks({
      offset: 0,
      state: 'archive'
    });
  };

  $scope.loadUnreadBookmarks = function() {
    freshLoadBookmarks({
      offset: 0,
      state: 'unread'
    });
  };

  $scope.archive = function(event, item) {
    event.preventDefault();
    event.stopPropagation();
    archiveItem(item);
  };


  function archiveItem(item) {
    chrome.runtime.sendMessage(null, {
      command: "archiveBookmark",
      id: item.id
    }, function(response) {
      if (response && response.error) {
        logging.error('deleting bookmarks', response.error);
        return;
      }
      logging('deleted bookmark');
      $scope.bookmarks = mergeBookmarks($scope.bookmarks, [], [item.id]);
      $scope.$apply();
    });
  }

  function mergeBookmarks(bookmarks, updatedBookmarks, removedIds) {
    // Update/add bookmarks.
    for (var i=0; i<updatedBookmarks.length; ++i) {
      var item = _.findWhere(bookmarks, {id: updatedBookmarks[i].id});
      if (item) {
        bookmarks[bookmarks.indexOf(item)] = updatedBookmarks[i];
      } else {
        bookmarks.push(updatedBookmarks[i]);
      }
    }

    // Remove the deleted bookmarks.
    var removed = _.filter(bookmarks, function(item) {
      return ~removedIds.indexOf(item.id);
    });

    bookmarks = _.chain(bookmarks)
      .difference(removed)
      // Sort by name and time.updated. It's a stable sort so we sort it two
      // times to make sure the items won't jump around as they're sorted
      // (which could happen if we were sorting just by time which is not
      // unique).
      .sortBy('id')
      .sortBy(function(b) {
        return b.time.updated;
      })
      .reverse()
      .value();

    return bookmarks;
  }

  var state = 'unread';
  var loadBookmarks = function(requestOptions, cacheFlags, callback) {
    callback = callback || function() {};

    state = requestOptions.state || state; // either new state or last state

    logging('---requesting bookmarks', requestOptions, cacheFlags);
    var defaultedOpts = _.defaults(requestOptions, {
      sort: 'newest',
      state: state,
      search: $scope.searchText,
      offset: $scope.bookmarks.length,
      count: 20
    });

    logging('defaulted options', defaultedOpts);

    chrome.runtime.sendMessage(null, {
      command: "loadBookmarks",
      flags: {
        updateCache: cacheFlags.updateCache || false
      },
      opts: defaultedOpts
    }, function(response) {
      if ( ! response) {
        window.close();
        return;
      }

      logging('response to bookmark request', response);
      var bookmarks = response.items || [];
      var removedIds = response.removed || [];

      $scope.bookmarks = mergeBookmarks($scope.bookmarks, bookmarks, removedIds);

      $scope.allResultsFetched = _.isEmpty(bookmarks);
      $scope.$apply();

      callback();
    });
  };

  $scope.bookmarkSelected = function(item) {
    common.getActiveTab().then(function(tab) {
      chrome.tabs.update(tab.id, {url:item.url}, function() {
        window.close();
      });
    });
  };

  $scope.addCurrentOrArticleView = function() {
    common.getActiveTab().then(function(tab) {
      if ($scope.pagePocketed) {
        chrome.runtime.sendMessage(null, {
          command: 'requestArticleView',
          url: tab.url
        }, function(response) {
          console.log(JSON.stringify(response));
          common.getActiveTab().then(function(tab) {
            chrome.tabs.sendMessage(tab.id, {
              command: 'showArticleView',
              title: response.title,
              article: response.article,
              resolved_id: response.resolved_id
            });
            window.close();
          });
        });
      }
      else {
        chrome.runtime.sendMessage(null, {
          command: 'addBookmark',
          url: tab.url
        }, function() {
          window.close();
          $scope.$apply();
        });
      }
    });
  };

  $scope.wipeCache = function(callback) {
    chrome.runtime.sendMessage(null, {
      command: "wipeBookmarkCache"
    }, callback);
  };

});
