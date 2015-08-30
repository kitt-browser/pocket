var articleViewMenu = require('./articleViewMenu');

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.command === 'showArticleView') {
    document.head.innerHTML = '<style>img { max-width: 100% }</style>';
    document.body.innerHTML = '<h1>' + request.title + '</h1>' + request.article;
    articleViewMenu.render(request.resolved_id, document);

    //document.body.innerHTML += bottomContextMenu.render();
    //document.getElementById('CLICKME').onclick = function(){console.log('CLICKME'); alert('CLICKME');};

    //document.body.innerHTML += '<script>function toggleFavorite(itemId) {console.log(itemId);}</script>';
    //document.body.innerHTML += '<div><a onclick="console.log(\'logggggy\')">ToggleStar</a></div>';
  }
});
