var _ = require('../vendor/underscore/underscore');
require('../vendor/ionic/ionic.bundle');
require('../vendor/angular-truncate/angular-truncate');
require('../vendor/moment/moment');
require('../vendor/angular-moment/angular-moment');
require('../vendor/ngAnimate-animate.css/animate');

require('../vendor/ionic/css/ionic.css');
require('../vendor/animate.css/animate.css');
require('../css/pocket.css');

var common = require('./common');


var LOG = common.LOG;

var sort = 'newest';
var state = 'unread';


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
  });

  $scope.onRefresh = function() {
    LOG('update on refresh!');
    loadBookmarks({
      offset: null,
      count: null,
      sort: null,
      state: null
    }, {
      updateCache: true
    }, function() {
        $scope.$broadcast('scroll.refreshComplete');
    });
  };

  var loadBookmarks = function(opts, flags, callback) {
    console.log('requesting bookmarks');
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
      if ( ! response) {
        window.close();
        return;
      }
      var bookmarks = response.items || [];
      var removedIds = response.removed || [];

      // Merge in new and updated bookmarks.
      for (var i=0; i<bookmarks.length; ++i) {
        var item = _.findWhere($scope.bookmarks, {id: bookmarks[i].id});
        if (item) {
          $scope.bookmarks[$scope.bookmarks.indexOf(item)] = bookmarks[i];
        } else {
          $scope.bookmarks.push(bookmarks[i]);
        }
      }

      // Remove the removed bookmarks.
      var removed = _.filter($scope.bookmarks, function(item) {
        return ~removedIds.indexOf(item.id);
      });

      $scope.bookmarks = _.chain($scope.bookmarks)
        .difference(removed)
        .sortBy(function(b) {
          return b.time.updated;
        })
        .reverse()
        .value();

      $scope.allResultsFetched = (bookmarks.length === 0);
      $scope.$apply();

      callback();
    });
  };

  $scope.bookmarkSelected = function(item) {
    common.getActiveTab().then(function(tab) {
      chrome.tabs.update(tab.id, {url:item.url}, function(){
        console.log('going to: ' + item.url);
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
