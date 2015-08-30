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
    if (action.action === 'delete') {
      alert('before wipecache');
      chrome.runtime.sendMessage(null, {
        command: 'wipeBookmarkCache'
      }, function() { alert('wiped bookmark cache'); });
    }
  });
}

function deleteItem(itemId) {
  var action = generateAction('delete', itemId);
  sendAction(action);
}

function addStar(itemId) {
  alert('added star' + itemId);
}

function removeStar(itemId) {
  alert('removedStar' + itemId);
}

function render(itemId, document) { // TODO default value is hardwired 'Add star' -> load it instead!
  var html = '<hr /> Bottom Bar <a id="menuDelete">Delete me</a>';
     html += '<a id="menuToggleStar" class="star-off">Add Star</a>' + chrome.extension.getURL('auth.html'); // TODO

  document.body.innerHTML += html;
  document.getElementById('menuDelete').onclick = function() {
    deleteItem(itemId);
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
