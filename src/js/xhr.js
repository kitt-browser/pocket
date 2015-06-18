var Q = require("q");

exports.post = function (url, data) {
  console.log('posting to', url);
  var defer = Q.defer();

  var xhr = new XMLHttpRequest();
  xhr.onerror = function(err) {
    console.log('XMLHttpRequest error: ' + err);
    defer.reject(err);
  };

  xhr.onreadystatechange = function () {
    console.log('ready state change, state:' + xhr.readyState + ' ' + xhr.status);
    if (xhr.readyState === 4 && xhr.status === 200) {
      if(xhr.responseType === 'json') {
        defer.resolve(xhr.response);
      } else {
        // backward compatibility with previous versions of Kitt
        defer.resolve(JSON.parse(xhr.responseText));
      }
    } else if (this.readyState === 4 && this.status === 401) {
      console.log('HTTP 401 returned');
      defer.reject({code: 401});
    }
  };

  xhr.open('POST', url, true);
  xhr.setRequestHeader("Content-type", "application/json; charset=utf-8");
  xhr.setRequestHeader("X-Accept", "application/json");
  xhr.send(data || null);

  console.log('HTTP req sent to', url, data);

  return defer.promise;
};


