(function() {
	if(typeof App === 'undefined') {
		var js = %JSASSETS%;
		for(var i=0; i<js.length; i++) {
			var script = document.createElement('script');
			script.type = 'text/javascript';
			script.src = js[i];
			document.head.appendChild(script);
		}
	} else {
		window.onload = function() {
			if(typeof updateEnvironment === 'function') {
				updateEnvironment();
			}
			if(typeof iLibLocale === 'object') {
				iLibLocale.updateLocale(null, true);
			}
			if(typeof App === 'object' && (typeof ReactDOM === 'object')) {
				ReactDOM.render(App['default'] || App, document.getElementById('root'));
			} else {
				console.log('ERROR: Snapshot app not found');
			}
		};
	}
})();
