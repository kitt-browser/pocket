function createToolbarIframe(url, itemId) {
  return '<iframe src="'+url +'?id=' + itemId+'"/>';
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.command === 'showArticleView') {
    document.head.innerHTML = '<style>img { max-width: 100% }</style>';
    document.body.innerHTML = '';

    document.body.innerHTML += '<h1>' + request.title + '</h1>' + request.article;
    document.body.innerHTML += createToolbarIframe(chrome.extension.getURL('html/articleViewToolbar.html'),
      request.resolved_id );
  }
});
