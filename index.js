
module.exports = {
	create: require('./global-cli/create').api,
	link: require('./global-cli/link').api,
	pack: require('./global-cli/pack').api,
	serve: require('./global-cli/serve').api,
	clean: require('./global-cli/clean').ali,
	lint: require('./global-cli/lint').api,
	test: require('./global-cli/test').api,
	template: require('./global-cli/template').api,
	transpile: require('./global-cli/transpile').api,
	license: require('./global-cli/license').api
};
