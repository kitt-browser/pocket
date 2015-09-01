/**
 * Created by tomasnovella on 8/28/15.
 */
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

function deleteItem(itemId) {
  var action = generateAction('delete', itemId);
  sendAction(action);
}

function addStar(itemId) {
  var action = generateAction('favorite', itemId);
  sendAction(action);
}

function removeStar(itemId) {
  var action = generateAction('unfavorite', itemId);
  sendAction(action);
}

function archiveItem(itemId) {
  chrome.runtime.sendMessage(null, {command: 'archiveBookmark', id: itemId});
}

function render(item) {
  var itemId = item.id;


  var html = '<hr /> Bottom Bar <a id="menuDelete">Delete me</a> | ';
     html += '<a id="menuToggleStar" class="' + (item.favorite? 'star-on': 'star-off') +
       '">' + (item.favorite? 'Remove Star': 'Add star')+'</a> | <a id="menuArchive">Archive</a>';


  document.body.innerHTML += html;
  document.getElementById('menuDelete').onclick = function() {
    deleteItem(itemId);
  };

  document.getElementById('menuArchive').onclick = function() {
    archiveItem(itemId);
  };
  var menuToggleStar = document.getElementById('menuToggleStar');
  menuToggleStar.onclick = function() {
    if (menuToggleStar.className === 'star-on') {
      removeStar(itemId);
      menuToggleStar.innerHTML = 'Add Star';
      menuToggleStar.className = 'star-off';
    } else {
      addStar(itemId);
      menuToggleStar.className = 'star-on';
      menuToggleStar.innerHTML = 'Remove Star';
    }
  };
}

module.exports = {
  render: render
};
