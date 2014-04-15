var Q = require('../vendor/q/q');

var getActiveTab = function() {
  var defer = Q.defer();

  chrome.tabs.query({active: true}, function(tabs) {
    if (tabs.length === 0) {
      console.log('ERROR: no active tab found');
      return defer.reject();
    }
    return defer.resolve(tabs[0]);
  });

  return defer.promise;
};


var getFromStorage = function(key) {
  var defer = Q.defer();
  chrome.storage.local.get(key, function(items) {
    defer.resolve(items[key]);
  });
  return defer.promise;
};


var saveToStorage = function(key, val) {
  var defer = Q.defer();
  var obj = {};
  obj[key] = val;
  chrome.storage.local.set(obj, function() {
    defer.resolve();
  });
  return defer.promise;
};

module.exports = {
  getActiveTab: getActiveTab,
  getFromStorage: getFromStorage,
  saveToStorage: saveToStorage,
};
