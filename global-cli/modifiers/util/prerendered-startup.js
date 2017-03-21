(function() {
	var screenTypes = %SCREENTYPES%;
	var defaultType = {name: 'standard', pxPerRem: 16, width: window.innerWidth, height: window.innerHeight, aspectRatioName: 'standard', base: true};
	if(screenTypes.length===0) {
		screenTypes.push(defaultType);
	}
	var height = window.innerHeight,
		width = window.innerWidth;
	var scrObj = screenTypes[screenTypes.length - 1];
	if(height > width) {
		width = height;
	}
	for(var i=screenTypes.length-1; i>=0; i--) {
		if(width <= screenTypes[i].width) {
			scrObj = screenTypes[i];
		}
	}
	document.documentElement.style.fontSize = scrObj.pxPerRem + 'px';

	window.onload = function() { setTimeout(function() {
		if(typeof App === 'undefined') {
			var count = 0;
			var appendScripts = function(js) {
				if(js.length===0) {
					if(typeof enact_framework !== 'undefined') {
						window.ReactDOM = enact_framework('react-dom');
					}
					if((typeof App === 'object') && (typeof ReactDOM === 'object')) {
						var appEle = (App && App.__esModule) ? App['default'] : App;
						if(typeof appEle === 'object' && appEle) {
							console.warn('WARNING: HTML-side isomorphic rendering is depreciated and will be removed in a future release. Please conditionally render within the app itself.');
							console.warn('    See https://github.com/enyojs/enact-dev/blob/develop/template/src/index.js for an example entrypoint.');
							ReactDOM.render(appEle, document.getElementById('root'));
						}
					}
				} else {
					var src = js.shift();
					var script = document.createElement('script');
					script.type = 'text/javascript';
					script.src = src;
					script.onload = function() {
						appendScripts(js);
					};
					document.body.appendChild(script);
				}
			};
			appendScripts(%JSASSETS%);
		} else {
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
		}
	}, 0); };
})();
