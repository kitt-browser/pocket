var articleViewMenu = require('./articleViewMenu');

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.command === 'showArticleView') {
    document.head.innerHTML = '<style>img { max-width: 100% }</style>';
    document.body.innerHTML = '<h1>' + request.title + '</h1>' + request.article;

    chrome.runtime.sendMessage(null, {command: 'getBookmark', id: request.resolved_id},
      function(bookmarkItem) {
        articleViewMenu.render(bookmarkItem);
      }
    );

  }
});
