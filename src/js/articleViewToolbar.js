/**
 * Created by tomasnovella on 9/2/15.
 */
/**
 * Created by tomasnovella on 8/28/15.
 */
function getParameterByName(name) {
  name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
  var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
    results = regex.exec(window.location.search);
  return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}
var _ = require('underscore');

function generateAction(actionName, itemId, properties) {
  var action = {
    action: actionName,
    item_id: itemId,
    time: Math.floor(Date.now()/1000)
  };

  return _.extend(action, properties);
}


function sendAction(action) {
  chrome.runtime.sendMessage(null, {
    command: 'modifyBookmark',
    action: action
  }, function() {
      chrome.runtime.sendMessage(null, {
        command: 'updateBookmarks'
      });
  });
}

function deleteItemRequest(itemId) {
  var action = generateAction('delete', itemId);
  sendAction(action);
}

function addStarRequest(itemId) {
  var action = generateAction('favorite', itemId);
  sendAction(action);
}

function removeStarRequest(itemId) {
  var action = generateAction('unfavorite', itemId);
  sendAction(action);
}

function archiveItemRequest(itemId) {
  chrome.runtime.sendMessage(null, {command: 'archiveBookmark', id: itemId});
}


function actionTagsReplace(itemId, tags) { // array of tags
  var action = generateAction('tags_replace', itemId, {tags: tags.join(',')});
  sendAction(action);
}

function render(itemId) {
  chrome.runtime.sendMessage(null, {command:'getBookmark', id: itemId}, function(item) {

    document.getElementById('menuDelete').onclick = function() {
      deleteItemRequest(itemId);
    };

    var menuToggleStar = document.getElementById('menuToggleStar');
    menuToggleStar.className = item.favorite? 'star-on': 'star-off';
    menuToggleStar.innerHTML = item.favorite? 'Remove Star': 'Add Star';
    menuToggleStar.onclick = function() {
      if (menuToggleStar.className === 'star-on') {
        removeStarRequest(itemId);
        menuToggleStar.innerHTML = 'Add Star';
        menuToggleStar.className = 'star-off';
      } else {
        addStarRequest(itemId);
        menuToggleStar.className = 'star-on';
        menuToggleStar.innerHTML = 'Remove Star';
      }
    };

    document.getElementById('menuArchive').onclick = function() {
      archiveItemRequest(itemId);
    };

    document.getElementById('menuTags').innerHTML = item.tags;
  });
}
window.onload = function() {
  var articleId = parseInt(getParameterByName('id'));
  render(articleId);
};
