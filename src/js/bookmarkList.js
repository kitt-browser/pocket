let _ = require('lodash');
let $ = require('jquery');

require('ionic-framework');

require('../../node_modules/ionic-framework/release/css/ionic.css');
require('../vendor/animate.css/animate.css');
require('../css/pocket.css');

let bookmarksPaginator = require('./bookmarksPaginator');
let bookmarksTransformer = bookmarksPaginator.BookmarksTransformer;
let defaultBookmarksPaginator = bookmarksPaginator.UnreadCachedBookmarksPaginator;
let currentBookmarksPaginator;

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


  // parameters used with bookmarksPaginator
  const itemsPerPage = 20;

  currentBookmarksPaginator = defaultBookmarksPaginator;


  function freshLoadBookmarksPaginator(bookmarksPaginatorInstance) {
    $scope.bookmarks = [];
    currentBookmarksPaginator = bookmarksPaginatorInstance;
    currentBookmarksPaginator.reset();
    $scope.loadNextPage();
  }

  $scope.$watch('bookmarks', function(newVal, oldVal) {
    if (newVal !== oldVal && newVal === []) {
      $scope.allResultsFetched = false;
      $scope.loadNextPage();
    }

    // Change add button to article view if page has already been pocketed
    // or back to add button if it has been removed
    common.getActiveTab().then(function(tab) {
      // TODO do not forget, page may be pocketed even if it's not in bookmarks (it's in archive...)
      // TODO for now we'll be ignoring this fact

      // sometimes, when I have cookies, or special settings in browser,
      // the page resolves to different url than when getpocket.com tries to resolve it
      let item = _.find($scope.bookmarks, (bookmark) => {
        return bookmark.resolved_url === tab.url || bookmark.given_url === tab.url;
      });

      if (item) {
        $('#add-or-article-view').removeClass('ion-ios7-plus').addClass('ion-ios7-paper');
        $('#current-page-title').text(item.title);
        $('#current-page-domain').text(item.domain);
      } else {
        $('#add-or-article-view').removeClass('ion-ios7-paper').addClass('ion-ios7-plus');
        $('#current-page-title').text(tab.title);
        $('#current-page-domain').text(bookmarksTransformer.parseDomain(tab.url));
      }
      $scope.pagePocketed = !!item;
    });
  }, true);

  $scope.loadNextPage = function() {
    common.logging('$scope.loadNextPage');
    return currentBookmarksPaginator.getNextBookmarks(itemsPerPage)
      .then(bl => bookmarksTransformer.getBookmarksFromBookmarksList(bl))
      .then(bookmarks => bookmarksTransformer.sortBookmarksByNewest(bookmarks))
      .then(bookmarks => {
        let processedBookmarks = bookmarks.map(bookmarksTransformer.processItem);
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
        freshLoadBookmarksPaginator(bookmarksPaginator.SearchBookmarksPaginatorFactory(newVal));
      } else {
        freshLoadBookmarksPaginator(defaultBookmarksPaginator);
      }
    }
  }, searchDelayMs));

  // either tabs bar or search bar are on (=visible)
  let tabsBarOn = true;
  $scope.showSearchBar = function() {
    if (tabsBarOn) {
      $('#tabsBar').removeClass('active');
      $('#searchBar').addClass('active');
      $('#search-or-close').removeClass('ion-ios7-search').addClass('ion-ios7-close');
    } else {
      $('#searchBar').removeClass('active');
      $('#tabsBar').addClass('active');
      $('#search-or-close').removeClass('ion-ios7-close').addClass('ion-ios7-search');

      $scope.searchText = '';
      $scope.$apply();
    }
    tabsBarOn = !tabsBarOn;
  };

  function switchActiveTab(tabId) {
    $('#my-items, #favorited-items, #archived-items').removeClass('active');
    $(tabId).addClass('active');
  }

  $scope.loadArchivedBookmarks = function() {
    freshLoadBookmarksPaginator(bookmarksPaginator.ArchivedBookmarksPaginator);
    switchActiveTab('#archived-items');
  };

  $scope.loadUnreadBookmarks = function() {
    freshLoadBookmarksPaginator(defaultBookmarksPaginator);
    switchActiveTab('#my-items');
  };

  $scope.loadFavoritedBookmarks = function() {
    freshLoadBookmarksPaginator(bookmarksPaginator.FavoriteBookmarksPaginator);
    switchActiveTab('#favorited-items');
  };

  $scope.archive = function(event, item) {
    event.preventDefault();
    event.stopPropagation();

    chrome.runtime.sendMessage(null, {
      command: "archiveBookmark",
      item_id: item.item_id
    }, function(response) {
      if (response && response.error) {
        //common.logging.error('deleting bookmarks', response.error);
        return;
      }

      $scope.bookmarks.splice(_.findKey($scope.bookmarks, b => b.item_id == item.item_id), 1);
      $scope.$apply();
      currentBookmarksPaginator.reset();
    });
  };

  $scope.bookmarkSelected = function(item) {
    common.getActiveTab().then(function(tab) {
      chrome.tabs.update(tab.id, {url:item.url}, function() {
        window.close();
      });
    });
  };

  $scope.articleView = function(event, item) {
    event.preventDefault();
    event.stopPropagation();
    common.getActiveTab().then(function(tab) {
      viewArticle(item.url, tab.id, item);
    });
  };

  function viewArticle(url, tabId, item) {
    chrome.runtime.sendMessage(null, {
      command: 'requestArticleView',
      url: url
    }, function(response) {
        let message = {
          command: 'showArticleView',
          title: response.title,
          article: response.article,
          resolved_id: response.resolved_id,
          item: item
        };
        chrome.tabs.sendMessage(tabId, message);
        window.close();
    });
  }

  function addBookmark(url) {
    chrome.runtime.sendMessage(null, {
      command: 'addBookmark',
      url: url
    }, function() {
      window.close();
      $scope.$apply();
    });
  }

  $scope.addCurrentOrArticleView = function() {
    common.getActiveTab().then(function(tab) {
      if ($scope.pagePocketed) {
        viewArticle(tab.url, tab.id);
      } else {
        addBookmark(tab.url);
      }
    });
  };

  $scope.wipeCache = function() {
    defaultBookmarksPaginator.wipeCache();
  };

});
