var Q = require('../vendor/q/q');

var newestSort = function(a, b) {
  var aTime = parseInt(a.added);
  var bTime = parseInt(b.added);
  if (aTime < bTime)
    return 1;
  if (aTime > bTime)
    return -1;
  return 0;
};

var oldestSort = function(a, b) {
  var aTime = parseInt(a.added);
  var bTime = parseInt(b.added);
  if (aTime < bTime)
    return -1;
  if (aTime > bTime)
    return 1;
  return 0;
};

var titleSort = function(a, b) {
  if (a.title < b.title)
    return -1;
  if (a.title > b.title)
    return 1;
  return 0;
};

var siteSort = function(a, b) {
  if (a.domain < b.domain)
    return -1;
  if (a.domain > b.domain)
    return 1;
  return 0;
};

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
    console.log('saved to storage');
    defer.resolve();
  });
  return defer.promise;
};


var LOG = function() {
  var res = "";
  for(var i=0; i<arguments.length; ++i) {
    if (typeof(arguments[i]) === 'string' || typeof(arguments[i]) === 'function') {
      res += arguments[i] + ' ';
    } else {
      res += JSON.stringify(arguments[i], null, 2) + ' ';
    }
  }
  console.log(res);
};


module.exports = {
  LOG: LOG,
  getActiveTab: getActiveTab,
  getFromStorage: getFromStorage,
  saveToStorage: saveToStorage,
};
