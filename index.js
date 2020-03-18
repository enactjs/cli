const exportAPIs = commands => {
	commands.forEach(name => {
		Object.defineProperty(module.exports, name, {
			configurable: false,
			enumerable: true,
			get: () => require(`./commands/${name}`).api
		});
	});
};

exportAPIs([
	// List of commands to export via getters
	'create',
	'link',
	'bootstrap',
	'pack',
	'serve',
	'clean',
	'lint',
	'test',
	'eject',
	'template',
	'transpile',
	'license'
]);
