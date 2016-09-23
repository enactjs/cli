var mixin = function(a, b) {
	for(var x in b) {
		if(typeof a[x] !== typeof b[x]) {
			a[x] = b[x];
		} else {
			if(Array.isArray(a[x])) {
				a[x] = a[x].concat(b[x]);
			} else if(typeof a[x] === 'object' && a[x] !== null && b[x] !== null) {
				a[x] = mixin(a[x], b[x]);
			} else {
				a[x] = b[x];
			}
		}
	}
	return a;
};

module.exports = mixin;
