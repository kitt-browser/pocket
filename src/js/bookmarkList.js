let _ = require('lodash');
let $ = require('jquery');

require('ionic-framework');

require('../../node_modules/ionic-framework/release/css/ionic.css');
require('../vendor/animate.css/animate.css');
require('../css/pocket.css');

let bookmarksManager = require('./bookmarksManager');
let bookmarksTransformer = bookmarksManager.BookmarksTransformer;
let defaultBookmarksManager = bookmarksManager.UnreadCachedBookmarksManager;
let currentBookmarksManager;

let common = require('./common');


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

  $scope.bookmarks = []; // bookmarks being displayed
  $scope.allResultsFetched = false; // when set to true, it disables the spinning wheel
  $scope.pagePocketed = false; //indicates whether the current page is in pocket


  // parameters used with bookmarksManager
  const itemsPerPage = 20;

  currentBookmarksManager = defaultBookmarksManager;


  function freshLoadBookmarksManager(bookmarksManagerInstance) {
    $scope.bookmarks = [];
    currentBookmarksManager = bookmarksManagerInstance;
    currentBookmarksManager.reset();
    $scope.loadNextPage();
  }

  $scope.$watch('bookmarks', function(newVal, oldVal) {
    if (newVal !== oldVal && newVal === []) {
      $scope.allResultsFetched = false;
      $scope.loadNextPage();
    }

    // Change add button to article view if page has already been pocketed
    // or back to add button if it has been removed
    // FIXME: known issue. wikipedia saves http://..., but when I get to https:// the urls
    // FIXME: differ, so it doesn't recognize it
    common.getActiveTab().then(function(tab) {
      var item = _.findWhere($scope.bookmarks, {url: tab.url});

      if (item) {
        document.getElementById('add-or-article-view').setAttribute('class', 'button ion-ios7-paper');
      } else {
        document.getElementById('add-or-article-view').setAttribute('class', 'button ion-ios7-plus');
      }
      $scope.pagePocketed = !!item;
    });
  }, true);

  $scope.loadNextPage = function() {
    common.logging('$scope.loadNextPage');
    return currentBookmarksManager.getNextBookmarks(itemsPerPage)
      .then(bl => bookmarksTransformer.getBookmarksFromBookmarksList(bl))
      .then(bookmarks => bookmarksTransformer.sortBookmarksByNewest(bookmarks))
      .then(bookmarks => {
        let processedBookmarks = bookmarks.map(bookmarksTransformer.processItem); // TODO further refactor
        $scope.bookmarks = $scope.bookmarks.concat(processedBookmarks);
        $scope.allResultsFetched = _.isEmpty(bookmarks);
        $scope.$apply();
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
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

  /*
  $scope.onRefresh = function() {
    currentBookmarksManager.getRefreshUpdates()
      .then((resolved) => freshLoadBookmarksManager(currentBookmarksManager),
        (rejected) => null)
      .then(() => $scope.$broadcast('scroll.refreshComplete'));
  };*/

  function switchActiveTab(tabId) {
    $('#my-items, #favorited-items, #archived-items').removeClass('active');
    $(tabId).addClass('active');
  }

  $scope.loadArchivedBookmarks = function() {
    freshLoadBookmarksManager(bookmarksManager.ArchivedBookmarksManager);
    switchActiveTab('#archived-items');
  };

  $scope.loadUnreadBookmarks = function() {
    freshLoadBookmarksManager(defaultBookmarksManager);
    switchActiveTab('#my-items');
  };

  $scope.loadFavoritedBookmarks = function() {
    freshLoadBookmarksManager(bookmarksManager.FavoriteBookmarksManager);
    switchActiveTab('#favorited-items');

  };

  $scope.archive = function(event, item) {
    event.preventDefault();
    event.stopPropagation();
    archiveItem(item);
  };


  function archiveItem(item) {
    chrome.runtime.sendMessage(null, {
      command: "archiveBookmark",
      item_id: item.item_id
    }, function(response) {
      if (response && response.error) {
        common.logging.error('deleting bookmarks', response.error);
        return;
      }
      common.logging('deleted bookmark');
      common.logging(  $scope.bookmarks.splice(_.findKey($scope.bookmarks, b => b.item_id == item.id), 1));
      common.logging($scope.bookmarks);
      $scope.$apply();
      currentBookmarksManager.reset();
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

  $scope.wipeCache = function() {
    defaultBookmarksManager.wipeCache();
  };

});
