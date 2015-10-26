var Q = require('q');

var Minilog = require('minilog');
var log = Minilog('app');
Minilog.enable();

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

function logging(/*message*/) {
  let messageJson = {
    command: "echo",
    message: arguments
  };

  chrome.runtime.sendMessage(null, messageJson, function(response) {
    log.debug(arguments); // in fact it logs into popup window console. which is inconvenient to open....
  });

  getActiveTab().then(tab => {
    chrome.runtime.sendMessage(tab.id, {command: 'echoContentScript', message: arguments});
  });
}

module.exports = {
   getActiveTab,
   getFromStorage,
   saveToStorage,
   logging
};
