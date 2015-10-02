/**
 * Created by tomasnovella on 10/2/15.
 */


function logging(message) {
  chrome.runtime.sendMessage(null, {
    command: "echo",
    message: message
  }, function(response) {
  });
}

var _ = require('underscore');

var $scope;
function init(scope) {
  $scope = scope;
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

var lastRequestOptions;
var loadBookmarks = function(requestOptions, cacheFlags, callback) {
  callback = callback || function() {};

  //state = requestOptions.state || state; // either new state or last state
  //favorite = requestOptions.favorite || favorite;

  //logging('---requesting bookmarks', requestOptions, cacheFlags);


  var defaultRequestOptions =   {
    sort: 'newest',
    state: 'unread',
    search: $scope.searchText,
    offset: $scope.bookmarks.length,
    count: 20
  };

  if (cacheFlags.cachedRequest) {
    requestOptions = _.clone(lastRequestOptions || defaultRequestOptions);
    logging('CACHED REQUEST!!!!!!');
  } else {
    requestOptions = _.defaults(requestOptions, defaultRequestOptions);
  }
  requestOptions.offset = $scope.bookmarks.length;

  lastRequestOptions = _.clone(requestOptions);
  logging('TESTME');
  logging('--options of the sent request' + JSON.stringify(requestOptions));

  chrome.runtime.sendMessage(null, {
    command: "loadBookmarks",
    flags: {
      updateCache: cacheFlags.updateCache || false
    },
    opts: requestOptions
  }, function(response) {
    if ( ! response) {
      window.close();
      return;
    }

    //logging('response to bookmark request', response);
    var bookmarks = response.items || [];
    var removedIds = response.removed || [];

    $scope.bookmarks = mergeBookmarks($scope.bookmarks, bookmarks, removedIds);

    $scope.allResultsFetched = _.isEmpty(bookmarks);
    $scope.$apply();

    callback();
  });
};

module.exports = {
  init: init,
  loadBookmarks: loadBookmarks,
  mergeBookmarks: mergeBookmarks
};
