chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.command === 'showArticleView') {
    document.head.innerHTML = '<style>img { max-width: 100% }</style>';
    document.body.innerHTML = '<h1>' + request.title + '</h1>' + request.html;
  }
});