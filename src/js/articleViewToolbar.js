require('../../node_modules/ionic-framework/release/css/ionic.css');

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
var $ = require('jquery');

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


/*
function tagRemoveRequest(itemId, tag) {
  var action = generateAction('tags_remove', itemId, {tags: tag});
  sendAction(action);
}

function tagAddRequest(itemId, tagName) {
  var action = generateAction('tags_add', itemId, {tags: tagName});
  sendAction(action);
}

function getTagId(tagName) {
  return 'tag_' + tagName;
}
function generateTagHtml(tagName) {
  var tagId = getTagId(tagName);
  return '<span id="'+tagId+'">' + tagName + ' <a id="delete_'+tagId + '"> (Delete) </a>,</span> ';
}
function deleteTag(itemId, tagName) {
  var tagId = getTagId(tagName);
  $('#'+tagId).remove();
  tagRemoveRequest(itemId, tagName);
}

function addTag(itemId, tagName) {
  $("#menuTags").append(generateTagHtml(tagName));
  tagAddRequest(itemId, tagName);
}
*/

function render(itemId) {
  chrome.runtime.sendMessage(null, {command:'getBookmark', id: itemId}, function(item) {

    document.getElementById('menuDelete').onclick = function() {
      deleteItemRequest(itemId);
      this.className="deleted";
    };

    var menuToggleStar = document.getElementById('menuToggleStar');
    menuToggleStar.innerHTML = '';
    var star = document.createElement('i');
    star.className = 'icon ion-android-star';
    menuToggleStar.className = item.favorite ? 'star-on' : 'star-off';
    menuToggleStar.appendChild(star);
    menuToggleStar.onclick = function() {
      if (menuToggleStar.className === 'star-on') {
        removeStarRequest(itemId);
        menuToggleStar.className = 'star-off';
      } else {
        addStarRequest(itemId);
        menuToggleStar.className = 'star-on';
      }
    };

    document.getElementById('menuArchive').onclick = function() {
      archiveItemRequest(itemId);
      this.className="archived";
    };

    /*
    _.forEach(item.tags, function(tagName) {
      var deleteTagId = '#delete_' + getTagId(tagName);
      $('#menuTags').append(generateTagHtml(tagName));
      $(deleteTagId).click(function() {
        deleteTag(itemId, tagName);
      });
    });

    $('#addTagForm').submit(function(e) {
      e.preventDefault();
      var newTagName = $('#menuAddTag').val();
      addTag(itemId, newTagName);
      $('#menuAddTag').val('');
    });
    */

  });
}
window.onload = function() {
  var articleId = parseInt(getParameterByName('id'));
  render(articleId);
};