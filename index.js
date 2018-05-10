module.exports = {
	create: require('./commands/create').api,
	link: require('./commands/link').api,
	pack: require('./commands/pack').api,
	serve: require('./commands/serve').api,
	clean: require('./commands/clean').ali,
	lint: require('./commands/lint').api,
	test: require('./commands/test').api,
	eject: require('./commands/eject').api,
	template: require('./commands/template').api,
	transpile: require('./commands/transpile').api,
	license: require('./commands/license').api
};
