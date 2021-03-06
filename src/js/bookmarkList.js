var _ = require('../vendor/underscore/underscore');
require('../vendor/ionic/ionic.bundle');
require('../vendor/angular-truncate/angular-truncate');
require('../vendor/moment/moment');
require('../vendor/angular-moment/angular-moment');
require('../vendor/ngAnimate-animate.css/animate');

require('../vendor/ionic/css/ionic.css');
require('../vendor/animate.css/animate.css');
require('../css/pocket.css');

var Minilog = require("../../node_modules/minilog");
var common = require('./common');

var log = Minilog('app');
Minilog.enable();

var sort = 'newest';
var state = 'unread';

var CLEAN_CACHE_SEARCH_STRING = 'salsa:ccache';

window.angular.module('pocket', [
  'ionic',
  'truncate',
  'angularMoment',
  'ngAnimate',
  'ngAnimate-animate.css'
])

.controller('bookmarksCtrl', function($scope, $ionicLoading) {
  var count = 20;

  var searchDelayMs = 700;

  $scope.bookmarks = [];
  $scope.allResultsFetched = false;

  $scope.$watch('bookmarks', function(newVal, oldVal) {
    if (newVal !== oldVal && newVal === []) {
      $scope.allResultsFetched = false;
      $scope.loadNextPage();
    }
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
    log.debug('update on refresh!');
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
        log.error('deleting bookmarks', response.error);
        return;
      }
      log.debug('deleted bookmark');
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


  var loadBookmarks = function(opts, flags, callback) {
    log.debug('requesting bookmarks');
    chrome.runtime.sendMessage(null, {
      command: "loadBookmarks",
      flags: {
        updateCache: flags.updateCache || false
      },
      opts: _.defaults(opts, {
        sort: sort,
        state: state,
        search: $scope.searchText,
        offset: $scope.bookmarks.length,
        count: count,
      })
    }, function(response) {
      log.debug('reponse', response);
      if ( ! response) {
        window.close();
        return;
      }
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
      chrome.tabs.update(tab.id, {url:item.url}, function(){
        window.close();
      });
    });
  };

  $scope.addCurrent = function() {
    common.getActiveTab().then(function(tab) {
      chrome.runtime.sendMessage(null, {
        command: 'addBookmark',
        url: tab.url
      }, function() {
        window.close();
        $scope.$apply();
      });
    });
  };

  $scope.wipeCache = function() {
    chrome.runtime.sendMessage(null, {
      command: "wipeBookmarkCache"
    });
  };

});
