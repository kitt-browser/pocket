var _ = require('lodash');
require('ionic-framework');

require('../../node_modules/ionic-framework/release/css/ionic.css');
require('../vendor/animate.css/animate.css');
require('../css/pocket.css');

let bookmarksManager = require('./bookmarksManager');
let bookmarksTransformer = bookmarksManager.BookmarksTransformer;
let defaultBookmarksManager = new bookmarksManager.AllItemsBookmarksManager();

let currentBookmarksManager;


var Minilog = require('minilog');
var common = require('./common');

var log = Minilog('app');
Minilog.enable();

function logging(message) {
  let messageJson = {
    command: "echo",
    message: message
  };

  chrome.runtime.sendMessage(null, messageJson, function(response) {
    log.debug(message); // in fact it logs into popup window console. which is inconvenient to open....
  });

  common.getActiveTab().then(tab => {
    chrome.runtime.sendMessage(tab.id, {command: 'echoContentScript', message: message});
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

  bookmarksManager2.init($scope);

  $scope.bookmarks = [];
  $scope.allResultsFetched = false;
  $scope.pagePocketed = false;

  // parameters used with bookmarksManager
  let offset = 0;
  let count = 2;


  currentBookmarksManager = defaultBookmarksManager;

  $scope.$watch('bookmarks', function(newVal, oldVal) {
    if (newVal !== oldVal && newVal === []) {
      $scope.allResultsFetched = false;
      $scope.loadNextPage();
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
    logging('$scope.loadNextPage');
    currentBookmarksManager.getBookmarksList(offset, count)
      .then(bl => bookmarksTransformer.getBookmarksFromBookmarksList(bl))
      .then(bookmarks => bookmarksTransformer.sortBookmarksByNewest(bookmarks))
      .then(bookmarks => {
        let processedBookmarks = bookmarks.map(bookmarksTransformer.processItem); // TODO further refactor
        $scope.bookmarks = $scope.bookmarks.concat(processedBookmarks);
        $scope.allResultsFetched = _.isEmpty(bookmarks);
        $scope.$apply();
        $scope.$broadcast('scroll.infiniteScrollComplete');
        offset += bookmarks.length;
      });
  };

  $scope.loadFirstPage = function() { // if something in the cache, else...
    offset = 0;
    $scope.loadNextPage();
  };

  let searchDelayMs = 700;
  $scope.$watch('searchText', _.debounce(function(newVal, oldVal) {
    $scope.bookmarks = [];

    if(newVal !== oldVal) {
      if (!_.isEmpty(newVal)) {
        currentBookmarksManager = new bookmarksManager.SearchBookmarksManager(newVal);
      } else {
        currentBookmarksManager = defaultBookmarksManager;
        logging('back to default');
      }
    }

    $scope.loadFirstPage();

  }, searchDelayMs));

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
