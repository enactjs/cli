/*
 *  snapshot-helper.js
 *
 *  Since the initial ExecutionEnvironment is set during snapshot creation, we need to provide an API
 *  to update environment on window load.
 *
 */

global.updateEnvironment = function() {
	var ExecutionEnvironment = require('fbjs/lib/ExecutionEnvironment');
	var canUseDOM = !!(typeof window !== 'undefined' && window.document && window.document.createElement);

	ExecutionEnvironment.canUseDOM = canUseDOM;
	ExecutionEnvironment.canUseWorkers = typeof Worker !== 'undefined';
	ExecutionEnvironment.canUseEventListeners = canUseDOM && !!(window.addEventListener || window.attachEvent);
	ExecutionEnvironment.canUseViewport = canUseDOM && !!window.screen;
	ExecutionEnvironment.isInWorker = !canUseDOM; // For now, this is true - might change in the future.
};
