chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.command === 'showArticleView') {
    console.log('request', request);
    document.head.innerHTML = '<style>img { max-width: 100% }</style>';
    document.body.innerHTML = request.html;
  }
});