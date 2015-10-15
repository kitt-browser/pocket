var _ = require('lodash');
require('ionic-framework');

require('../../node_modules/ionic-framework/release/css/ionic.css');
require('../vendor/animate.css/animate.css');
require('../css/pocket.css');

let bookmarksManager = require('./bookmarksManager');
let bookmarksTransformer = bookmarksManager.BookmarksTransformer;
let defaultBookmarksManager = bookmarksManager.AllItemsBookmarksManager;
let currentBookmarksManager;

var common = require('./common');

var Minilog = require('minilog');
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

  $scope.bookmarks = [];
  $scope.allResultsFetched = false;
  $scope.pagePocketed = false;


  // parameters used with bookmarksManager
  let offset = 0;
  let count = 2;


  currentBookmarksManager = defaultBookmarksManager;


  function freshLoadBookmarksManager(bookmarksManagerInstance) {
    $scope.bookmarks = [];
    currentBookmarksManager = bookmarksManagerInstance;
    $scope.loadFirstPage();
  }

  $scope.$watch('bookmarks', function(newVal, oldVal) {
    if (newVal !== oldVal && newVal === []) {
      $scope.allResultsFetched = false;
      $scope.loadNextPage();
    }

    // Change add button to article view if page has already been pocketed
    // or back to add button if it has been removed
    // FIXME bug - searches only through $scope.bookmarks, which comprises not necessarily
    // of all bookmarks
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
    if(newVal !== oldVal) {
      if (!_.isEmpty(newVal)) {
        freshLoadBookmarksManager(bookmarksManager.SearchBookmarksManagerFactory(newVal));
      } else {
        freshLoadBookmarksManager(defaultBookmarksManager);
      }
    }
  }, searchDelayMs));

  $scope.onRefresh = function() {
    // TODO refresh
    $scope.$broadcast('scroll.refreshComplete');
  };

  $scope.loadArchivedBookmarks = function() {
    freshLoadBookmarksManager(bookmarksManager.ArchivedBookmarksManager);
  };

  $scope.loadUnreadBookmarks = function() {
    freshLoadBookmarksManager(defaultBookmarksManager);
  };

  $scope.loadFavoritedBookmarks = function() {
    freshLoadBookmarksManager(bookmarksManager.FavoriteBookmarksManager);
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
      $scope.bookmarks.splice(_.findKey($scope.bookmarks), b => b.item_id == item.id, 1);
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
