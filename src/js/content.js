function createToolbarIframe(url, item) {
  let encodedItem = encodeURIComponent(JSON.stringify(item));
  return '<iframe src="' + url + '?item=' + encodedItem + '" />';
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.command === 'showArticleView') {
    document.head.innerHTML = '<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no\" /><style>body, html { margin: 0; padding: 0; background: #fff } body { overflow-x: hidden } body > div { margin: 0; padding: 15px; margin-bottom: 30px; overflow-x: hidden; } pre { white-space: pre-wrap !important; word-wrap: break-word !important; overflow-wrap: break-word !important; } img { max-width: 100% } iframe { width: 100%; position: fixed; left: 0; bottom: 0; background: #ededf3; border-width: 1px 0 0 0; border-style: solid; border-color: #c8c7cc; height: 45px; overflow: hidden }</style>';
    document.body.innerHTML = '';

    document.body.innerHTML += '<h1 style=\"padding: 15px; background: #ededf3; font-size: 20px; border-bottom: 1px solid #c8c7cc; color: #333; margin: 0; font-family: \'Helvetica Neue\', Helvetica, Arial, sans-serif \">' + request.title + '</h1>' + request.article;
    document.body.innerHTML += createToolbarIframe(chrome.extension.getURL('html/articleViewToolbar.html'),
      request.item);
  } else if (request.command === 'echoContentScript') {
    console.log('(echo command)', request.message);
  }
});
