var _ = require('underscore');
require('ionic-framework');

require('../../node_modules/ionic-framework/release/css/ionic.css');
require('../vendor/animate.css/animate.css');
require('../css/pocket.css');

let bookmarksManager = require('./bookmarksManager');
let bookmarksTransformer = bookmarksManager.BookmarksTransformer;
let currentBookmarksManager;


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

var bookmarksManager2 = require('./bookmarksManager2');

var CLEAN_CACHE_SEARCH_STRING = 'salsa:ccache';


function isMobile() {
  return window.navigator.userAgent.indexOf('Mobile') !== -1;
}


window.angular.module('pocket', [
  'ionic'
]).controller('bookmarksCtrl', function($scope, $ionicLoading) {
  if (!isMobile()) { // for debugging purposes
    document.body.style.width = '400px';
    document.body.style.height = '400px';
  }

  var searchDelayMs = 700;
  bookmarksManager2.init($scope);

  $scope.bookmarks = [];
  $scope.allResultsFetched = false;
  $scope.pagePocketed = false;

  // parameters used with bookmarksManager
  let offset = 0;
  let count = 2;


  currentBookmarksManager = new bookmarksManager.AllItemsBookmarksManager();

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
    currentBookmarksManager.getBookmarksList(offset, count)
      .then(bl => bookmarksTransformer.getBookmarksFromBookmarksList(bl))
      .then(bookmarks => bookmarksTransformer.sortBookmarksByNewest(bookmarks))
      .then(bookmarks => {
        let processedBookmarks = bookmarks.map(bookmarksTransformer.processItem);
        $scope.bookmarks = $scope.bookmarks.concat(processedBookmarks); // TODO further refactor
        $scope.allResultsFetched = _.isEmpty(bookmarks);
        $scope.$apply();
        $scope.$broadcast('scroll.infiniteScrollComplete');
        offset += bookmarks.length;
      });

//    bookmarksManager2.loadBookmarks({}, {cachedRequest: true}, function() {
//      $scope.$broadcast('scroll.infiniteScrollComplete');
//    });
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
    bookmarksManager2.loadBookmarks({
      offset: 0,
      state: 'unread'
    }, {
      updateCache: true
    }, function() {
        $scope.$broadcast('scroll.refreshComplete');
    });
  };

  function freshLoadBookmarks(requestOptions) {
    $scope.bookmarks = [];
    $scope.wipeCache(function() {
      bookmarksManager2.loadBookmarks(requestOptions, {
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

  $scope.loadFavoritedBookmarks = function() {
    freshLoadBookmarks({
      offset: 0,
      state: 'unread',
      favorite: 1
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
      $scope.bookmarks = bookmarksManager2.mergeBookmarks($scope.bookmarks, [], [item.id]);
      $scope.$apply();
    });
  }

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
