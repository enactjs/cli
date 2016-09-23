import React from 'react';
import kind from 'enact-core/kind';
import Button from 'enact-moonstone/Button';
import {Panel, Header} from 'enact-moonstone/Panels';

export default kind({
	name: 'MainPanel',

	render: () => (
		<Panel>
			<Header title="Hello world!" />
			<Button>Click me</Button>
		</Panel>
	)
});
